export type OlakaiEventParams = {
  prompt: string;
  response: string;
  userEmail?: string;
  sessionId?: string; // Groups activities into a session/conversation — maps to chatId on the wire
  taskExecutionId?: string; // Groups prompt requests by task execution
  task?: string;
  subTask?: string;
  tokens?: number;
  requestTime?: number;
  shouldScore?: boolean; // Whether to score this activity
  modelName?: string; // LLM model name (e.g., "gpt-4o", "claude-sonnet-4-20250514")
  customData?: Record<string, string | number | boolean | undefined>;
};

/**
 * Parameters for reporting explicit user feedback on a prior agent interaction.
 *
 * Use this when your end user gives an explicit rating (thumbs up/down) on
 * an assistant response. Feedback is correlated with the original interaction
 * via `sessionId` — and optionally `turnIndex` — so the analytics layer can
 * slice feedback by the turn it applies to.
 */
export type OlakaiFeedbackParams = {
  /** Session/conversation ID of the interaction being rated. Must match
   *  the `sessionId` used when reporting the original event. */
  sessionId: string;
  /** The rating itself. */
  rating: "UP" | "DOWN";
  /** Optional zero-based turn index within the session for turn-level correlation. */
  turnIndex?: number;
  /** Optional free-text comment alongside the rating. */
  comment?: string;
  /** Optional override for the user who gave the feedback. */
  userEmail?: string;
  /** Optional customer-defined fields for domain context. */
  customData?: Record<string, string | number | boolean | undefined>;
};

export type MonitorPayload = {
  email?: string;
  userId?: string; // SDK client's user ID for tracking
  chatId?: string;
  taskExecutionId?: string; // Groups prompt requests by task execution
  task?: string;
  subTask?: string;
  prompt: JsonValue;
  response: JsonValue;
  tokens?: number;
  requestTime?: number;
  errorMessage?: string;
  blocked?: boolean;
  sensitivity?: string[];
  shouldScore?: boolean;
  modelName?: string; // LLM model name (e.g., "gpt-4o", "claude-sonnet-4-20250514")
  customData?: Record<string, string | number | boolean | undefined>;
};

/**
 * Global SDK configuration
 */
export type SDKConfig = {
  apiKey: string;
  monitorEndpoint: string;
  controlEndpoint: string;
  version: string;
  retries: number;
  timeout: number;
  debug: boolean;
  verbose: boolean;
};

/**
 * Response for monitoring API
 */
export type MonitoringAPIResponse = {
  success: boolean;
  message: string;
  // New batch response format fields
  totalRequests: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    index: number;
    success: boolean;
    promptRequestId: string | null;
    error: string | null;
  }>;
};

/**
 * Response for control API
 */
export type ControlAPIResponse = {
  allowed: boolean;
  details: {
    detectedSensitivity: string[];
    isAllowedPersona: boolean;
  };
  message?: string;
};

export type SanitizePattern = {
  pattern?: RegExp;
  key?: string;
  replacement?: string;
};

/**
 * Payload for control API
 */
export type ControlPayload = {
  prompt: JsonValue;
  email?: string;
  chatId?: string;
  task?: string;
  subTask?: string;
  tokens?: number;
  overrideControlCriteria?: string[];
};

/**
 * Configuration for each monitored function
 */
export type MonitorOptions<TArgs extends any[], TResult> = {
  onMonitoredFunctionError?: boolean; // Whether to throw an error if the monitored function fails
  // Dynamic chat and user identification
  chatId?: string | ((args: TArgs) => string);
  email?: string | ((args: TArgs) => string);
  taskExecutionId?: string; // Groups prompt requests by task execution
  task?: string;
  subTask?: string;
  tokens?: number; // Token count for the LLM call
  modelName?: string; // LLM model name (e.g., "gpt-4o", "claude-sonnet-4-20250514")
  sanitize?: boolean; // Whether to sanitize sensitive data
  priority?: "low" | "normal" | "high"; // Priority for batching
  askOverride?: string[]; // List of parameters to override the control check
};

export enum ErrorCode {
  SUCCESS = 201,
  PARTIAL_SUCCESS = 207,
  FAILED = 500,
  BAD_REQUEST = 400,
  UNREACHABLE = 404,
}

/**
 * Represents any valid JSON value.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonArray
  | JsonObject;

/**
 * Represents an array of JSON values.
 */
export type JsonArray = JsonValue[];

/**
 * Represents a JSON object, which is a key-value map where keys are strings and
 * values are any valid JSON value.
 */
export type JsonObject = { [key: string]: undefined | JsonValue };

/**
 * LLM Provider types
 */
export type LLMProvider = "openai" | "anthropic" | "google" | "custom";

/**
 * Metadata automatically extracted from LLM calls
 */
export type LLMMetadata = {
  provider: LLMProvider;
  model: string;
  apiKey?: string; // Optional API key for cost tracking
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  parameters?: Record<string, any>; // temperature, max_tokens, etc.
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
  };
  functionCalls?: any[];
  streamMode?: boolean;
  finishReason?: string;
};

/**
 * Enhanced MonitorPayload with LLM metadata
 */
export type EnhancedMonitorPayload = MonitorPayload & {
  llmMetadata?: LLMMetadata;
};

/**
 * Configuration for LLM SDK wrapper
 */
export type LLMWrapperConfig = {
  provider: LLMProvider;
  defaultContext?: {
    userEmail?: string;
    userId?: string; // SDK client's user ID for tracking
    chatId?: string;
    taskExecutionId?: string; // Groups prompt requests by task execution
    task?: string;
    subTask?: string;
    customData?: Record<string, string | number | boolean | undefined>;
  };
  enableControl?: boolean; // Whether to use Control API (default: false)
  sanitize?: boolean;
};

/**
 * Enhanced SDK configuration with Control API option
 */
export type EnhancedSDKConfig = SDKConfig & {
  enableControl?: boolean; // Global control API setting (default: false)
};

/**
 * Context for Vercel AI SDK integration
 */
export type VercelAIContext = {
  userEmail?: string;
  userId?: string; // SDK client's user ID for tracking
  chatId?: string;
  taskExecutionId?: string; // Groups prompt requests by task execution
  task?: string;
  subTask?: string;
  apiKey?: string; // Provider API key for cost tracking
  enableControl?: boolean; // Override global Control API setting
  sanitize?: boolean;
  customData?: Record<string, string | number | boolean | undefined>;
};

/**
 * Extended usage information from Vercel AI SDK
 */
export type VercelAIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number; // New in AI SDK 5
  cachedInputTokens?: number;
};
