/**
 * Vercel AI SDK Integration
 *
 * Wraps Vercel AI SDK's generateText and streamText functions
 * to automatically track all LLM interactions across 25+ providers
 */

import type {
  VercelAIContext,
  VercelAIUsage,
  LLMMetadata,
  MonitorPayload,
  EnhancedMonitorPayload,
  ControlPayload,
  ControlAPIResponse,
} from "../types";
import { sendToAPI } from "../client";
import { olakaiLogger, toJsonValue } from "../utils";
import { OlakaiBlockedError } from "../exceptions";

// Dynamic imports to make Vercel AI SDK optional
type GenerateTextParams = any;
type GenerateTextResult = any;
type StreamTextParams = any;
type StreamTextResult = any;

/**
 * Configuration for Vercel AI integration
 */
export interface VercelAIConfig {
  enableControl?: boolean;
  debug?: boolean;
}

/**
 * Vercel AI SDK Integration Class
 */
export class VercelAIIntegration {
  private config: VercelAIConfig;

  constructor(config: VercelAIConfig = {}) {
    this.config = config;
  }

  /**
   * Wrap Vercel AI SDK's generateText function
   * Automatically tracks all metadata and sends to Olakai
   */
  async generateText(
    params: GenerateTextParams,
    context: VercelAIContext = {},
  ): Promise<GenerateTextResult> {
    const startTime = Date.now();

    // Check if 'ai' package is available
    let generateTextFn: any;
    try {
      const aiModule = await import("ai");
      generateTextFn = aiModule.generateText;
    } catch (error) {
      throw new Error(
        "[Olakai SDK] Vercel AI SDK ('ai' package) is not installed. Install with: npm install ai",
      );
    }

    olakaiLogger(
      "[Vercel AI Integration] Intercepted generateText call",
      "info",
    );

    // Extract prompt from params
    const prompt = this.extractPrompt(params);

    // Check Control API if enabled
    const enableControl = context.enableControl ?? this.config.enableControl;
    if (enableControl) {
      await this.checkControlAPI(prompt, params, context);
    }

    try {
      // Call original Vercel AI generateText
      const result = await generateTextFn(params);

      const endTime = Date.now();

      // Extract metadata from result
      const metadata = this.extractMetadata(result, params, startTime, endTime, context);

      olakaiLogger(
        `[Vercel AI Integration] Captured metadata: ${JSON.stringify(metadata)}`,
        "info",
      );

      // Send to monitoring API
      await this.sendMonitoring(
        prompt,
        result.text || "",
        metadata,
        context,
        false, // not blocked
      );

      return result;
    } catch (error) {
      const endTime = Date.now();

      // Extract metadata even on error
      const metadata = this.extractMetadata(null, params, startTime, endTime, context);

      olakaiLogger(`[Vercel AI Integration] Error during call: ${error}`, "error");

      // Send error to monitoring
      await this.sendMonitoring(
        prompt,
        "",
        metadata,
        context,
        false,
        (error as Error)?.message || String(error),
      );

      throw error;
    }
  }

  /**
   * Wrap Vercel AI SDK's streamText function
   * Tracks streaming LLM calls
   */
  async streamText(
    params: StreamTextParams,
    context: VercelAIContext = {},
  ): Promise<StreamTextResult> {
    const startTime = Date.now();

    // Check if 'ai' package is available
    let streamTextFn: any;
    try {
      const aiModule = await import("ai");
      streamTextFn = aiModule.streamText;
    } catch (error) {
      throw new Error(
        "[Olakai SDK] Vercel AI SDK ('ai' package) is not installed. Install with: npm install ai",
      );
    }

    olakaiLogger(
      "[Vercel AI Integration] Intercepted streamText call",
      "info",
    );

    // Extract prompt from params
    const prompt = this.extractPrompt(params);

    // Check Control API if enabled
    const enableControl = context.enableControl ?? this.config.enableControl;
    if (enableControl) {
      await this.checkControlAPI(prompt, params, context);
    }

    try {
      // Call original Vercel AI streamText
      const result = await streamTextFn(params);

      // Track stream completion
      // Note: We'll track when the stream completes, not during streaming
      this.trackStreamCompletion(result, prompt, params, context, startTime);

      return result;
    } catch (error) {
      const endTime = Date.now();

      // Extract metadata even on error
      const metadata = this.extractMetadata(null, params, startTime, endTime, context);

      olakaiLogger(`[Vercel AI Integration] Error during stream: ${error}`, "error");

      // Send error to monitoring
      await this.sendMonitoring(
        prompt,
        "",
        metadata,
        context,
        false,
        (error as Error)?.message || String(error),
      );

      throw error;
    }
  }

  /**
   * Track stream completion and send final metrics
   */
  private async trackStreamCompletion(
    streamResult: any,
    prompt: string,
    params: any,
    context: VercelAIContext,
    startTime: number,
  ): Promise<void> {
    try {
      // Wait for stream to complete
      // The streamText result has a finishPromise we can await
      if (streamResult.finishPromise) {
        streamResult.finishPromise.then(async (finalResult: any) => {
          const endTime = Date.now();

          // Extract metadata from completed stream
          const metadata = this.extractMetadata(
            finalResult,
            params,
            startTime,
            endTime,
            context,
          );

          olakaiLogger(
            `[Vercel AI Integration] Stream completed, metadata: ${JSON.stringify(metadata)}`,
            "info",
          );

          // Send to monitoring API
          await this.sendMonitoring(
            prompt,
            finalResult.text || "",
            metadata,
            context,
            false,
          );
        }).catch((error: Error) => {
          olakaiLogger(
            `[Vercel AI Integration] Error tracking stream completion: ${error}`,
            "error",
          );
        });
      }
    } catch (error) {
      olakaiLogger(
        `[Vercel AI Integration] Error setting up stream tracking: ${error}`,
        "error",
      );
    }
  }

  /**
   * Extract prompt from Vercel AI params
   */
  private extractPrompt(params: any): string {
    try {
      // Check for simple prompt
      if (params.prompt && typeof params.prompt === "string") {
        return params.prompt;
      }

      // Check for messages array (chat format)
      if (params.messages && Array.isArray(params.messages)) {
        return params.messages
          .map((msg: any) => {
            const role = msg.role || "user";
            const content = msg.content || "";
            return `${role}: ${content}`;
          })
          .join("\n");
      }

      // Check for system + prompt
      if (params.system && params.prompt) {
        return `system: ${params.system}\nuser: ${params.prompt}`;
      }

      return "Unable to extract prompt";
    } catch (error) {
      olakaiLogger(
        `[Vercel AI Integration] Error extracting prompt: ${error}`,
        "error",
      );
      return "Error extracting prompt";
    }
  }

  /**
   * Extract metadata from Vercel AI result
   */
  private extractMetadata(
    result: any,
    params: any,
    startTime: number,
    endTime: number,
    context: VercelAIContext,
  ): LLMMetadata {
    const metadata: LLMMetadata = {
      provider: this.inferProvider(params),
      model: this.extractModelName(params),
      apiKey: context.apiKey,
      timing: {
        startTime,
        endTime,
        duration: endTime - startTime,
      },
    };

    // Extract tokens from result if available
    if (result?.usage) {
      metadata.tokens = {
        prompt: result.usage.inputTokens,
        completion: result.usage.outputTokens,
        total: result.usage.totalTokens,
      };
    }

    // Extract finish reason
    if (result?.finishReason) {
      metadata.finishReason = result.finishReason;
    }

    // Extract parameters from request
    const parameters: Record<string, any> = {};
    if (params.temperature !== undefined) parameters.temperature = params.temperature;
    if (params.topP !== undefined) parameters.topP = params.topP;
    if (params.topK !== undefined) parameters.topK = params.topK;
    if (params.maxTokens !== undefined) parameters.maxTokens = params.maxTokens;
    if (params.seed !== undefined) parameters.seed = params.seed;

    if (Object.keys(parameters).length > 0) {
      metadata.parameters = parameters;
    }

    // Detect streaming mode
    if (result?.stream) {
      metadata.streamMode = true;
    }

    // Extract function/tool calls if present
    if (result?.toolCalls && result.toolCalls.length > 0) {
      metadata.functionCalls = result.toolCalls;
    }

    return metadata;
  }

  /**
   * Infer provider from model parameter
   */
  private inferProvider(params: any): "openai" | "anthropic" | "custom" {
    try {
      // Vercel AI SDK uses model objects with a constructor name
      const modelObj = params.model;
      if (!modelObj) return "custom";

      // Check provider property if available
      if (modelObj.provider) {
        return modelObj.provider.toLowerCase();
      }

      // Try to infer from model ID or constructor
      const modelId = modelObj.modelId || modelObj.id || "";
      if (modelId.includes("gpt") || modelId.includes("openai")) {
        return "openai";
      }
      if (modelId.includes("claude") || modelId.includes("anthropic")) {
        return "anthropic";
      }

      return "custom";
    } catch (error) {
      return "custom";
    }
  }

  /**
   * Extract model name from params
   */
  private extractModelName(params: any): string {
    try {
      const modelObj = params.model;
      if (!modelObj) return "unknown";

      return (
        modelObj.modelId ||
        modelObj.id ||
        modelObj.model ||
        "unknown"
      );
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Check Control API before execution
   */
  private async checkControlAPI(
    prompt: string,
    params: any,
    context: VercelAIContext,
  ): Promise<void> {
    const controlPayload: ControlPayload = {
      prompt: toJsonValue(prompt),
      email: context.userEmail,
      chatId: context.chatId,
      task: context.task,
      subTask: context.subTask,
    };

    try {
      const response = (await sendToAPI(
        controlPayload,
        "control",
      )) as unknown as ControlAPIResponse;

      if (!response.allowed) {
        // Send blocked monitoring event
        const metadata = this.extractMetadata(null, params, Date.now(), Date.now(), context);
        await this.sendMonitoring(prompt, "", metadata, context, true);

        throw new OlakaiBlockedError(
          "LLM call blocked by Olakai Control API",
          {
            detectedSensitivity: response.details.detectedSensitivity,
            isAllowedPersona: response.details.isAllowedPersona,
          },
        );
      }
    } catch (error) {
      if (error instanceof OlakaiBlockedError) {
        throw error;
      }
      // Log control API errors but allow execution to continue
      olakaiLogger(
        `[Vercel AI Integration] Control API error (allowing execution): ${error}`,
        "warn",
      );
    }
  }

  /**
   * Send monitoring data to Olakai API
   */
  private async sendMonitoring(
    prompt: string,
    response: string,
    metadata: LLMMetadata,
    context: VercelAIContext,
    blocked: boolean = false,
    errorMessage?: string,
  ): Promise<void> {
    const payload: EnhancedMonitorPayload = {
      prompt: toJsonValue(prompt),
      response: toJsonValue(response),
      email: context.userEmail,
      chatId: context.chatId,
      taskExecutionId: context.taskExecutionId,
      task: context.task,
      subTask: context.subTask,
      tokens: metadata.tokens?.total,
      requestTime: metadata.timing?.duration,
      blocked,
      errorMessage,
      llmMetadata: metadata,
    };

    try {
      await sendToAPI(payload as MonitorPayload, "monitoring");
      olakaiLogger(
        "[Vercel AI Integration] Monitoring data sent successfully",
        "info",
      );
    } catch (error) {
      olakaiLogger(
        `[Vercel AI Integration] Failed to send monitoring data: ${error}`,
        "error",
      );
      // Don't throw - monitoring failures shouldn't break user's code
    }
  }
}
