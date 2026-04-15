import { uuidv7 } from "uuidv7";
import type {
  SDKConfig,
  JsonValue,
  JsonArray,
  JsonObject,
  SanitizePattern,
} from "./types";

/**
 * Default sanitize patterns for sanitizing sensitive data.
 * @returns An array of sanitize patterns
 */
export const DEFAULT_SANITIZE_PATTERNS: SanitizePattern[] = [
  { pattern: /\b[\w.-]+@[\w.-]+\.\w+\b/g, replacement: "[REDACTED]" }, // Email addresses
  {
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[REDACTED]",
  }, // Credit card numbers
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED]" }, // SSN
  { pattern: /\s*:\s*"[^"]*"/g, key: "password", replacement: "[REDACTED]" }, // Password fields in JSON
  { pattern: /\s*:\s*"[^"]*"/g, key: "token", replacement: "[REDACTED]" }, // Token fields in JSON
  { pattern: /\s*:\s*"[^"]*"/g, key: "apiKey", replacement: "[REDACTED]" }, // API key fields in JSON
  { pattern: /\s*:\s*"[^"]*"/g, key: "secret", replacement: "[REDACTED]" }, // Secret fields in JSON
  { pattern: /\s*:\s*"[^"]*"/g, key: "bearerToken", replacement: "[REDACTED]" }, // Bearer tokens
];

// Validate SDK configuration
export function validateConfig(config: Partial<SDKConfig>): string[] {
  const errors: string[] = [];

  if (!config.apiKey || config.apiKey.trim() === "") {
    errors.push("API key is required");
  }

  if (config.monitorEndpoint && !isValidUrl(config.monitorEndpoint)) {
    errors.push("API URL must be a valid URL");
  }

  if (
    config.retries !== undefined &&
    (config.retries < 0 || config.retries > 10)
  ) {
    errors.push("Retries must be between 0 and 10");
  }

  if (config.timeout !== undefined && config.timeout <= 0) {
    errors.push("Timeout must be positive");
  }

  return errors;
}

// Check if a string is a valid URL
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Create a configuration builder pattern
export class ConfigBuilder {
  private config: Partial<SDKConfig> = {};

  apiKey(key: string): ConfigBuilder {
    this.config.apiKey = key;
    return this;
  }

  monitorEndpoint(url: string): ConfigBuilder {
    this.config.monitorEndpoint = url;
    return this;
  }

  controlEndpoint(url: string): ConfigBuilder {
    this.config.controlEndpoint = url;
    return this;
  }

  feedbackEndpoint(url: string): ConfigBuilder {
    this.config.feedbackEndpoint = url;
    return this;
  }

  version(v: string): ConfigBuilder {
    this.config.version = v;
    return this;
  }

  retries(count: number): ConfigBuilder {
    this.config.retries = count;
    return this;
  }

  timeout(ms: number): ConfigBuilder {
    this.config.timeout = ms;
    return this;
  }

  debug(enable: boolean = true): ConfigBuilder {
    this.config.debug = enable;
    return this;
  }

  verbose(enable: boolean = true): ConfigBuilder {
    this.config.verbose = enable;
    return this;
  }

  build(): SDKConfig {
    const errors = validateConfig(this.config);
    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(", ")}`);
    }

    return {
      apiKey: "",
      monitorEndpoint: "",
      controlEndpoint: "",
      feedbackEndpoint: "",
      version: "",
      retries: 3,
      timeout: 10000,
      debug: false,
      verbose: false,
      ...this.config,
    } as SDKConfig;
  }
}

// Factory function for the builder
export function createConfig(): ConfigBuilder {
  return new ConfigBuilder();
}

/**
 * Sanitize data by replacing sensitive information with a custom placeholder
 * @param data - The data to sanitize
 * @param patterns - The patterns to replace
 * @returns The sanitized data
 */
export function sanitizeData(
  data: string,
  dataKey?: string,
  patterns?: SanitizePattern[],
): string {
  if (!patterns?.length) return data;

  let serialized = data;
  patterns.forEach((pattern) => {
    if (pattern.pattern) {
      return serialized.replace(
        pattern.pattern,
        pattern.replacement || "[REDACTED]",
      );
    } else if (pattern.key) {
      if (dataKey && dataKey.includes(pattern.key)) {
        return pattern.replacement || "[REDACTED]";
      } else {
        return data;
      }
    }
  });

  try {
    olakaiLogger(`Data successfully sanitized`, "info");
    return serialized;
  } catch {
    olakaiLogger(`Data failed to sanitize`, "warn");
    return "[SANITIZED]";
  }
}

export function createErrorInfo(error: any): {
  errorMessage: string;
  stackTrace?: string;
} {
  return {
    errorMessage: error instanceof Error ? error.message : String(error),
    stackTrace: error instanceof Error ? error.stack : undefined,
  };
}

export function toJsonValue(val: any, sanitize: boolean = false): JsonValue {
  try {
    // Handle null and undefined
    if (val === null || val === undefined) return null;

    // Handle primitives that are already JsonValue

    if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    ) {
      if (sanitize) {
        return sanitizeData(String(val), undefined, DEFAULT_SANITIZE_PATTERNS);
      }
      return val;
    }

    // Handle arrays
    if (Array.isArray(val)) {
      return val.map((item) => toJsonValue(item, sanitize)) as JsonArray;
    }

    // Handle objects
    if (val && typeof val === "object") {
      const result: JsonObject = {};
      for (const [key, value] of Object.entries(val)) {
        if (sanitize) {
          result[key] = sanitizeData(
            String(value),
            key,
            DEFAULT_SANITIZE_PATTERNS,
          );
        } else {
          result[key] = toJsonValue(value, sanitize);
        }
      }
      return result;
    }

    // Fallback for other types - convert to string
    return String(val);
  } catch (error) {
    olakaiLogger(`Error converting value to JsonValue: ${error}`, "error");
    return String(val);
  }
}

/**
 * Sleep for a given number of milliseconds
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the given number of milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  olakaiLogger(`Sleeping for ${ms}ms`, "info");
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function olakaiLogger(
  message: string,
  level: "info" | "warn" | "error" = "info",
  verbose: boolean = false,
): void {
  switch (level) {
    case "info":
      if (verbose)
        console.log(`[Olakai SDK] ${message}`);
      break;
    case "warn":
      console.warn(`[Olakai SDK] ${message}`);
      break;
    case "error":
      console.error(`[Olakai SDK] ${message}`);
      break;
  }
}

export function createId(): string {
  const removeDashes = uuidv7().replaceAll("-", "");
  return removeDashes.substring(removeDashes.length - 25);
}