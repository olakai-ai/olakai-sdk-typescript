import type {
  SDKConfig,
  MonitorPayload,
  MonitoringAPIResponse,
  ControlPayload,
  ControlAPIResponse,
  FeedbackPayload,
} from "./types";
import packageJson from "../package.json";
import { ConfigBuilder, olakaiLogger, sleep } from "./utils";
import { ErrorCode } from "./types";
import {
  APIKeyMissingError,
  ConfigNotInitializedError,
  HTTPError,
  URLConfigurationError,
} from "./exceptions";

let config: SDKConfig | undefined;

export const DEFAULT_HOST = "app.olakai.ai";

/**
 * Read `OLAKAI_HOST` from the environment, guarding against browser
 * runtimes where `process` is not defined.
 */
export function readOlakaiHostEnv(): string | undefined {
  return typeof process !== "undefined" && process.env
    ? process.env.OLAKAI_HOST
    : undefined;
}

/**
 * Resolve the base origin URL the SDK should call.
 * Precedence: explicit `host` (or full base URL) → `OLAKAI_HOST` env → DEFAULT_HOST.
 * Accepts a bare hostname ("olakai.acme.com") or a full URL ("https://olakai.acme.com");
 * trailing slashes are stripped. `URL` is used to parse explicit values so that paths
 * and query strings are dropped — only the origin is kept.
 */
export function resolveOriginUrl(explicit?: string): string {
  const raw = explicit || readOlakaiHostEnv() || DEFAULT_HOST;
  // Bare hostname → prepend https://. URL parsing requires a scheme.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    throw new URLConfigurationError(
      `[Olakai SDK] Invalid host or URL: ${raw}`,
    );
  }
}

/**
 * Build the three derived endpoints from a single resolved origin.
 */
export function buildEndpointsFromOrigin(origin: string): {
  monitorEndpoint: string;
  controlEndpoint: string;
  feedbackEndpoint: string;
} {
  return {
    monitorEndpoint: `${origin}/api/monitoring/prompt`,
    controlEndpoint: `${origin}/api/control/prompt`,
    feedbackEndpoint: `${origin}/api/monitoring/feedback`,
  };
}

/**
 * Initialize the SDK
 * @param apiKey - The API key
 * @param domainUrl - The domain URL or bare hostname. If omitted, falls back
 *   to the `OLAKAI_HOST` env var (e.g. on-prem host) or `app.olakai.ai`.
 *   Only the origin is used; any path/query is dropped.
 * @param options - Extra options. May include explicit `monitorEndpoint`,
 *   `controlEndpoint`, and/or `feedbackEndpoint` to override the derived URLs.
 * @default options - {
 *  retries: 4,
 *  timeout: 30000,
 *  debug: false,
 *  verbose: false,
 *  version: packageJson.version,
 * }
 * @throws {URLConfigurationError} if the API URL is not set
 * @throws {APIKeyMissingError} if the API key is not set
 */
export async function initClient(
  apiKey: string,
  domainUrl?: string,
  options: Partial<SDKConfig> = {},
) {
  const origin = resolveOriginUrl(domainUrl);
  const derived = buildEndpointsFromOrigin(origin);

  const configBuilder = new ConfigBuilder();
  configBuilder.apiKey(apiKey);
  configBuilder.monitorEndpoint(options.monitorEndpoint ?? derived.monitorEndpoint);
  configBuilder.controlEndpoint(options.controlEndpoint ?? derived.controlEndpoint);
  configBuilder.feedbackEndpoint(options.feedbackEndpoint ?? derived.feedbackEndpoint);
  configBuilder.retries(options.retries || 4);
  configBuilder.timeout(options.timeout || 30000);
  configBuilder.version(options.version || packageJson.version);
  configBuilder.debug(options.debug || false);
  configBuilder.verbose(options.verbose || false);

  // Validate before assigning to the module singleton so a failed re-init
  // doesn't leave a half-built config in place.
  const built = configBuilder.build();
  if (!built.apiKey || built.apiKey.trim() === "") {
    throw new APIKeyMissingError(
      "[Olakai SDK] API key is not set. Please provide a valid apiKey in the configuration.",
    );
  }
  config = built;
  olakaiLogger(`Config: ${JSON.stringify(config)}`, "info", config.debug);
}

/**
 * Get the current configuration. Returns a shallow copy so callers cannot
 * mutate the module-level singleton.
 * @throws {ConfigNotInitializedError} if the config is not initialized
 */
export function getConfig(): SDKConfig {
  return { ...requireConfig() };
}

/**
 * Internal: assert config is initialized and narrow the type.
 */
function requireConfig(): SDKConfig {
  if (!config) {
    throw new ConfigNotInitializedError(
      "[Olakai SDK] Config is not initialized",
    );
  }
  return config;
}

/**
 * Make an API call to the configured endpoint
 * @param payload - The payload to send to the endpoint
 * @param role - The role of the API call
 * @returns A promise that resolves to the API response
 * @throws {APIKeyMissingError} if the API key is not set
 * @throws {HTTPError} if the API call fails
 * @throws {Error} if the internal logic fails
 */
async function makeAPICall(
  payload: MonitorPayload[] | ControlPayload | FeedbackPayload,
  role: "monitoring" | "control" | "feedback" = "monitoring",
): Promise<MonitoringAPIResponse | ControlAPIResponse | void> {
  // Caller (`sendToAPI`) is the single gate for init/apiKey state. By the
  // time we get here, both have been validated.
  const cfg = requireConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeout);
  let url: string = "";

  if (role === "monitoring") {
    url = cfg.monitorEndpoint;
  } else if (role === "control") {
    url = cfg.controlEndpoint;
  } else if (role === "feedback") {
    url = cfg.feedbackEndpoint;
  }

  olakaiLogger(`Making API call to ${role} endpoint: ${url}`, "info", cfg.debug);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": cfg.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    olakaiLogger(`API call response: ${response.status}`, "info", cfg.debug);

    if (role === "feedback") {
      clearTimeout(timeoutId);
      if (!response.ok) {
        olakaiLogger(
          `Feedback endpoint returned non-OK status: ${response.status}`,
          "warn",
        );
        throw new HTTPError(`HTTP ${response.status}: ${response.statusText}`);
      }
      return;
    }

    let responseData: MonitoringAPIResponse | ControlAPIResponse = {} as
      | MonitoringAPIResponse
      | ControlAPIResponse;
    if (role === "monitoring") {
      responseData = (await response.json()) as MonitoringAPIResponse;
    } else if (role === "control") {
      responseData = (await response.json()) as ControlAPIResponse;
    }

    olakaiLogger(`API response: ${JSON.stringify(responseData)}`, "info", cfg.debug);

    clearTimeout(timeoutId);

    // Handle different status codes
    if (role === "monitoring") {
      responseData = responseData as MonitoringAPIResponse;
      if (response.status === ErrorCode.SUCCESS) {
        olakaiLogger(
          `Request succeeded: ${JSON.stringify(responseData)}`,
          "info",
          cfg.debug,
        );
        return responseData;
      } else if (response.status === ErrorCode.PARTIAL_SUCCESS) {
        olakaiLogger(
          `Request had mixed results: ${responseData.successCount}/${responseData.totalRequests} succeeded`,
          "warn",
        );
        return responseData;
      } else if (response.status === ErrorCode.FAILED) {
        olakaiLogger(
          `Request failed: ${JSON.stringify(responseData)}`,
          "error",
        );
        throw new Error(
          `Request failed: ${responseData.message || response.statusText}`,
        );
      } else if (!response.ok) {
        olakaiLogger(`API call failed: ${JSON.stringify(payload)}`, "info");
        olakaiLogger(
          `Unexpected API response status: ${response.status}`,
          "warn",
        );
        throw new HTTPError(`HTTP ${response.status}: ${response.statusText}`);
      } else {
        return responseData;
      }
    } else if (role === "control") {
      responseData = responseData as ControlAPIResponse;
      if (response.status === ErrorCode.SUCCESS) {
        return responseData;
      } else if (!response.ok) {
        olakaiLogger(
          `Unexpected API response status: ${response.status}`,
          "warn",
        );
        throw new HTTPError(`HTTP ${response.status}: ${response.statusText}`);
      } else {
        return responseData;
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
  throw new Error("[Olakai SDK] Invalid role");
}

/**
 * Send a payload to the API with retry logic
 * @param payload - The payload to send to the endpoint
 * @param maxRetries - The maximum number of retries
 * @returns A promise that resolves to an object with success status
 */
async function sendWithRetry(
  payload: MonitorPayload[] | ControlPayload | FeedbackPayload,
  maxRetries: number,
  role: "monitoring" | "control" | "feedback" = "monitoring",
): Promise<MonitoringAPIResponse | ControlAPIResponse | void> {
  const cfg = requireConfig();
  let lastError: Error | null = null;
  let response: MonitoringAPIResponse | ControlAPIResponse = {} as
    | MonitoringAPIResponse
    | ControlAPIResponse;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (role === "monitoring") {
        response = (await makeAPICall(
          payload,
          "monitoring",
        )) as MonitoringAPIResponse;
        if (response.success) {
          return response;
        } else if (response.failureCount && response.failureCount > 0) {
          olakaiLogger(
            `Request partial success: ${response.successCount}/${response.totalRequests} requests succeeded`,
            "info",
            cfg.debug,
          );
          return response;
        }
      } else if (role === "control") {
        response = (await makeAPICall(
          payload,
          "control",
        )) as ControlAPIResponse;
        return response;
      } else if (role === "feedback") {
        await makeAPICall(payload, "feedback");
        return;
      }
    } catch (err) {
      lastError = err as Error;

      olakaiLogger(
        `Attempt ${attempt + 1}/${maxRetries + 1} failed: ${
          lastError?.message
        }`,
        "warn",
      );

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        await sleep(delay);
      }
    }
  }
  olakaiLogger(
    `All retry attempts failed: ${JSON.stringify(lastError)}`,
    "error",
  );
  throw lastError;
}

/**
 * Send a payload to the API (simplified - no queueing).
 *
 * Error semantics:
 * - `monitoring` and `feedback` are fire-and-forget telemetry — failures are
 *   logged but never thrown to the caller, even if the SDK is misconfigured.
 *   Telemetry must never break the host application.
 * - `control` is awaited by the caller to decide whether to allow execution,
 *   so errors propagate. Distinguishes `ConfigNotInitializedError` (init never
 *   called) from `APIKeyMissingError` (init called but apiKey blank).
 *
 * @param payload - The payload to send to the endpoint
 * @param role - The role of the API call
 * @returns A promise that resolves when the payload is sent (or fails silently
 *   for monitoring/feedback). For `control`, resolves to the API response.
 */
export async function sendToAPI(
  payload: MonitorPayload | ControlPayload | FeedbackPayload,
  role: "monitoring" | "control" | "feedback" = "monitoring",
): Promise<ControlAPIResponse | void> {
  // Single gate for all three roles. Validates init state and apiKey.
  // Inner helpers (`sendWithRetry`, `makeAPICall`) trust this check.
  let cfg: SDKConfig;
  try {
    cfg = requireConfig();
    if (!cfg.apiKey || cfg.apiKey.trim() === "") {
      throw new APIKeyMissingError("[Olakai SDK] API key is not set");
    }
  } catch (error) {
    if (role === "control") {
      // Control gates execution — the caller needs the precise error type
      // (ConfigNotInitializedError vs APIKeyMissingError) to react.
      throw error;
    }
    // Fire-and-forget: log and bail.
    olakaiLogger(
      `[Olakai SDK] ${role} skipped: ${(error as Error).message}`,
      "warn",
    );
    return;
  }

  if (role === "feedback") {
    try {
      await sendWithRetry(payload as FeedbackPayload, cfg.retries, "feedback");
    } catch (error) {
      olakaiLogger(`Error during feedback API call: ${error}`, "error");
      // Fire-and-forget: swallow.
    }
    return;
  }

  if (role === "monitoring") {
    try {
      const response = (await sendWithRetry(
        [payload as MonitorPayload],
        cfg.retries,
        "monitoring",
      )) as MonitoringAPIResponse;

      if (
        response.totalRequests !== undefined &&
        response.successCount !== undefined
      ) {
        const level = response.failureCount && response.failureCount > 0 ? "warn" : "info";
        olakaiLogger(
          `API call result: ${response.successCount}/${response.totalRequests} requests succeeded`,
          level,
          level === "info" && cfg.debug,
        );
      }
    } catch (error) {
      olakaiLogger(`Error during monitoring API call: ${error}`, "error");
      // Fire-and-forget: swallow.
    }
    return;
  }

  if (role === "control") {
    return (await sendWithRetry(
      payload as ControlPayload,
      cfg.retries,
      "control",
    )) as ControlAPIResponse;
  }

  throw new Error("[Olakai SDK] Invalid role");
}
