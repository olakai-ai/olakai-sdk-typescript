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
  OlakaiBlockedError,
  URLConfigurationError,
} from "./exceptions";

let config: SDKConfig;

/**
 * Initialize the SDK
 * @param apiKey - The API key
 * @param domainUrl - The domain URL
 * @param options - The extra options for the SDKConfig
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
  domainUrl: string,
  options: Partial<SDKConfig> = {},
) {
  // Extract known parameters
  const configBuilder = new ConfigBuilder();
  configBuilder.apiKey(apiKey);
  configBuilder.monitorEndpoint(`${domainUrl}/api/monitoring/prompt`);
  configBuilder.controlEndpoint(`${domainUrl}/api/control/prompt`);
  configBuilder.feedbackEndpoint(`${domainUrl}/api/monitoring/feedback`);
  configBuilder.retries(options.retries || 4);
  configBuilder.timeout(options.timeout || 30000);
  configBuilder.version(options.version || packageJson.version);
  configBuilder.debug(options.debug || false);
  configBuilder.verbose(options.verbose || false);
  config = configBuilder.build();

  // Validate required configuration
  if (
    !config.monitorEndpoint ||
    config.monitorEndpoint === "/api/monitoring/prompt"
  ) {
    throw new URLConfigurationError(
      "[Olakai SDK] API URL is not set. Please provide a valid monitorEndpoint in the configuration.",
    );
  }
  if (
    !config.controlEndpoint ||
    config.controlEndpoint === "/api/control/prompt"
  ) {
    throw new URLConfigurationError(
      "[Olakai SDK] API URL is not set. Please provide a valid controlEndpoint in the configuration.",
    );
  }
  if (!config.apiKey || config.apiKey.trim() === "") {
    throw new APIKeyMissingError(
      "[Olakai SDK] API key is not set. Please provide a valid apiKey in the configuration.",
    );
  }
  olakaiLogger(`Config: ${JSON.stringify(config)}`, "info", config.debug);
}

/**
 * Get the current configuration
 * @returns The current configuration
 * @throws {ConfigNotInitializedError} if the config is not initialized
 */
export function getConfig(): SDKConfig {
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
  if (!config.apiKey) {
    throw new APIKeyMissingError("[Olakai SDK] API key is not set");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);
  let url: string = "";

  if (role === "monitoring") {
    url = config.monitorEndpoint;
  } else if (role === "control") {
    url = config.controlEndpoint;
  } else if (role === "feedback") {
    url = config.feedbackEndpoint;
  }

  olakaiLogger(`Making API call to ${role} endpoint: ${url}`, "info", config.debug);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    olakaiLogger(`API call response: ${response.status}`, "info", config.debug);

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

    olakaiLogger(`API response: ${JSON.stringify(responseData)}`, "info", config.debug);

    clearTimeout(timeoutId);

    // Handle different status codes
    if (role === "monitoring") {
      responseData = responseData as MonitoringAPIResponse;
      if (response.status === ErrorCode.SUCCESS) {
        olakaiLogger(
          `Request succeeded: ${JSON.stringify(responseData)}`,
          "info",
          config.debug,
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
  maxRetries: number = config.retries!,
  role: "monitoring" | "control" | "feedback" = "monitoring",
): Promise<MonitoringAPIResponse | ControlAPIResponse | void> {
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
            config.debug,
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
 * Send a payload to the API (simplified - no queueing)
 * @param payload - The payload to send to the endpoint
 * @param role - The role of the API call
 * @returns A promise that resolves when the payload is sent
 */
export async function sendToAPI(
  payload: MonitorPayload | ControlPayload | FeedbackPayload,
  role: "monitoring" | "control" | "feedback" = "monitoring",
): Promise<ControlAPIResponse | void> {
  if (!config.apiKey) {
    throw new APIKeyMissingError("[Olakai SDK] API key is not set");
  }

  if (role === "feedback") {
    try {
      await sendWithRetry(
        payload as FeedbackPayload,
        config.retries!,
        "feedback",
      );
    } catch (error) {
      olakaiLogger(`Error during feedback API call: ${error}`, "error");
      throw error;
    }
    return;
  }

  if (role === "monitoring") {
    try {
      const response = (await sendWithRetry(
        [payload as MonitorPayload],
        config.retries!,
        "monitoring",
      )) as MonitoringAPIResponse;

      // Log any response information if present
      if (
        response.totalRequests !== undefined &&
        response.successCount !== undefined
      ) {
        const level = response.failureCount && response.failureCount > 0 ? "warn" : "info";
        olakaiLogger(
          `API call result: ${response.successCount}/${response.totalRequests} requests succeeded`,
          level,
          level === "info" && config.debug,
        );
      }
    } catch (error) {
      olakaiLogger(`Error during monitoring API call: ${error}`, "error");
      throw error;
    }
  } else if (role === "control") {
    try {
      return (await sendWithRetry(
        payload as ControlPayload,
        config.retries!,
        "control",
      )) as ControlAPIResponse;
    } catch (error) {
      if (error instanceof OlakaiBlockedError) {
        throw error;
      }
      throw error;
    }
  } else {
    throw new Error("[Olakai SDK] Invalid role");
  }
}
