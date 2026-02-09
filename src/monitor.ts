import { sendToAPI, getConfig } from "./client";
import type {
  MonitorOptions,
  ControlPayload,
  SDKConfig,
  ControlAPIResponse,
  MonitorPayload,
} from "./types";
import { olakaiLogger, toJsonValue, createErrorInfo } from "./utils";
import { OlakaiBlockedError } from "./exceptions";

async function shouldAllowCall<TArgs extends any[]>(
  options: MonitorOptions<TArgs, any>,
  args: TArgs,
): Promise<ControlAPIResponse> {
  try {
    const { chatId, email } = resolveIdentifiers(options, args);

    // Create control payload
    const payload: ControlPayload = {
      prompt: toJsonValue(args.length === 1 ? args[0] : args),
      chatId: chatId,
      task: options.task,
      subTask: options.subTask,
      tokens: 0,
      email: email,
      overrideControlCriteria: options.askOverride,
    };

    // Send control request
    await sendToAPI(payload, "control");

    // For now, assume allowed if no error thrown
    return {
      allowed: true,
      details: {
        detectedSensitivity: [],
        isAllowedPersona: true,
      },
    };
  } catch (error) {
    olakaiLogger(
      `Control call failed, disallowing execution ${error}`,
      "error",
    );
    return {
      allowed: false,
      details: {
        detectedSensitivity: [],
        isAllowedPersona: false,
      },
    };
  }
}

/**
 * Resolve dynamic chatId and userId from options
 * @param options - Monitor options
 * @param args - Function arguments
 * @returns Object with resolved chatId and userId
 */
function resolveIdentifiers<TArgs extends any[]>(
  options: MonitorOptions<TArgs, any>,
  args: TArgs,
): { chatId: string; email: string } {
  let chatId = "123";
  let email = "anonymous@olakai.ai";
  if (typeof options.chatId === "function") {
    try {
      chatId = options.chatId(args);
      olakaiLogger("ChatId resolved...", "info");
    } catch (error) {
      olakaiLogger(
        `Error during chatId resolution: ${error}. \n Continuing execution...`,
        "error",
      );
    }
  } else {
    chatId = options.chatId || "123";
  }
  if (typeof options.email === "function") {
    try {
      email = options.email(args);
      olakaiLogger("Email resolved...", "info");
    } catch (error) {
      olakaiLogger(
        `Error during userId resolution: ${error}. \n Continuing execution...`,
        "error",
      );
    }
  } else {
    email = options.email || "anonymous@olakai.ai";
  }

  return { chatId, email };
}

/**
 * Monitor a function and send the data to the Olakai API
 * Always returns an async function, but can monitor both sync and async functions
 * @param options - The options for the monitored function
 * @param fn - The function to monitor (sync or async)
 * @returns The monitored async function
 * @throws {OlakaiBlockedError} if the function is blocked by Olakai's Control API
 * @throws {Error} throw the original function's error if the function fails
 */

// Curried version
export function monitor<TArgs extends any[], TResult>(
  options: MonitorOptions<TArgs, TResult>,
): (
  fn: (...args: TArgs) => TResult | Promise<TResult>,
) => (...args: TArgs) => Promise<TResult>;

// Direct version
export function monitor<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  options: MonitorOptions<TArgs, TResult>,
): (...args: TArgs) => Promise<TResult>;

// Implementation
export function monitor<TArgs extends any[], TResult>(
  arg1: any,
  arg2?: any,
): any {
  if (typeof arg1 === "function" && arg2) {
    // Direct form: monitor(fn, options)
    const fn = arg1;
    const options = arg2 as MonitorOptions<TArgs, TResult>;
    return monitor(options)(fn);
  }
  // Curried form: monitor(options)(fn)
  const options = arg1 as MonitorOptions<TArgs, TResult>;

  return (fn: (...args: TArgs) => TResult | Promise<TResult>) => {
    return async (...args: TArgs): Promise<TResult> => {
      olakaiLogger(`Monitoring function: ${fn.name}`, "info");
      olakaiLogger(`Monitoring options: ${JSON.stringify(options)}`, "info");
      olakaiLogger(`Monitoring arguments: ${JSON.stringify(args)}`, "info");

      let config: SDKConfig;
      let start: number;
      let processedArgs = args;

      // Safely initialize monitoring data
      try {
        config = getConfig();
        start = Date.now();
      } catch (error) {
        olakaiLogger(`Monitoring initialization failed: \n${error}`, "error");
        // If monitoring setup fails, still execute the function
        const result = await Promise.resolve(fn(...args));
        return result;
      }
      olakaiLogger("Monitoring initialization completed...", "info");

      olakaiLogger("Checking if we should control this call...", "info");

      const shouldAllow = await shouldAllowCall(options, args);

      olakaiLogger("Should control check completed...", "info");

      //If we should control (block execution), throw an error
      if (!shouldAllow.allowed) {
        olakaiLogger(
          "Function execution blocked by Olakai's Control API",
          "error",
        );
        const { chatId, email } = resolveIdentifiers(options, args);

        const payload: MonitorPayload = {
          prompt: toJsonValue(args.length === 1 ? args[0] : args, false),
          response: "",
          chatId: chatId,
          email: email,
          taskExecutionId: options.taskExecutionId,
          task: options.task,
          subTask: options.subTask,
          blocked: true,
          tokens: 0,
          sensitivity: shouldAllow.details.detectedSensitivity,
        };

        sendToAPI(payload, "monitoring");

        throw new OlakaiBlockedError(
          "Function execution blocked by Olakai's Control API",
          shouldAllow.details,
        );
      }

      let result: TResult;

      olakaiLogger("Executing the original function...", "info");
      try {
        // Handle both sync and async functions uniformly
        const functionResult = fn(...args);
        result = await Promise.resolve(functionResult);

        olakaiLogger("Original function executed successfully...", "info");
      } catch (error) {
        olakaiLogger(
          `Original function failed: ${error}. \n Continuing execution...`,
          "error",
        );
        // Handle error case monitoring
        reportError(
          error,
          args,
          options,
          config,
          shouldAllow.details.detectedSensitivity,
        );

        throw error; // Re-throw the original error to be handled by the caller
      }
      // Handle success case asynchronously
      makeMonitoringCall(
        result,
        args,
        args,
        options,
        shouldAllow.details.detectedSensitivity,
        config,
        start,
      );
      return result; // We know result is defined if we get here (no function error)
    };
  };
}

/**
 * Make the monitoring call
 * @param result - The result of the monitored function
 * @param processedArgs - The processed arguments
 * @param args - The original arguments
 * @param options - The options for the monitored function
 * @param config - The configuration for the monitored function
 * @param start - The start time of the monitored function
 */
async function makeMonitoringCall<TArgs extends any[], TResult>(
  result: TResult,
  processedArgs: TArgs,
  args: TArgs,
  options: MonitorOptions<TArgs, TResult>,
  detectedSensitivity: string[],
  config: SDKConfig,
  start: number,
) {
  olakaiLogger("Resolving identifiers...", "info");

  const { chatId, email } = resolveIdentifiers(options, args);

  olakaiLogger("Creating payload...", "info");

  const payload: MonitorPayload = {
    prompt: toJsonValue(processedArgs, options.sanitize),
    response: toJsonValue(result, options.sanitize),
    chatId: chatId,
    email: email,
    taskExecutionId: options.taskExecutionId,
    tokens: 0,
    requestTime: Number(Date.now() - start),
    ...(options.task !== undefined && options.task !== ""
      ? { task: options.task }
      : {}),
    ...(options.subTask !== undefined && options.subTask !== ""
      ? { subTask: options.subTask }
      : {}),
    blocked: false,
    sensitivity: detectedSensitivity,
  };

  olakaiLogger(
    `Successfully defined payload: ${JSON.stringify(payload)}`,
    "info",
  );

  // Send to API (with retry logic handled in client)
  try {
    await sendToAPI(payload, "monitoring");
  } catch (error) {
    olakaiLogger(`Error during api call: ${error}.`, "error");
  }
  olakaiLogger("API call completed...", "info");

  //End of monitoring operations

  olakaiLogger("Monitoring operations completed...", "info");
}

/**
 * Report an error to the API
 * @param functionError - The error from the monitored function
 * @param args - The original arguments
 * @param options - The options for the monitored function
 * @param config - The configuration for the monitored function
 */
async function reportError<TArgs extends any[], TResult>(
  functionError: any,
  args: TArgs,
  options: MonitorOptions<TArgs, TResult>,
  config: SDKConfig,
  detectedSensitivity: string[],
) {
  if (options.onMonitoredFunctionError ?? true) {
    try {
      const errorInfo = createErrorInfo(functionError);
      const { chatId, email } = resolveIdentifiers(options, args);
      const payload: MonitorPayload = {
        prompt: "",
        response: "",
        errorMessage:
          errorInfo.errorMessage +
          (errorInfo.stackTrace ? `\n${errorInfo.stackTrace}` : ""),
        chatId: chatId,
        email: email,
        taskExecutionId: options.taskExecutionId,
        sensitivity: detectedSensitivity,
      };

      await sendToAPI(payload, "monitoring");
    } catch (error) {
      olakaiLogger(`Error during error monitoring: ${error}.`, "error");
    }
    olakaiLogger("Error monitoring completed...", "info");
  }
}
