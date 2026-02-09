import { BaseLLMProvider } from "./base";
import type { LLMMetadata, LLMWrapperConfig } from "../types";
import { olakaiLogger } from "../utils";

/**
 * OpenAI provider implementation
 * Wraps OpenAI client to auto-capture metadata
 */
export class OpenAIProvider extends BaseLLMProvider {
  constructor(config: LLMWrapperConfig) {
    super(config);
  }

  getProviderName(): string {
    return "openai";
  }

  /**
   * Wrap OpenAI client with automatic tracking
   */
  wrap(client: any): any {
    const self = this;

    // Create a proxy that intercepts method calls
    return new Proxy(client, {
      get(target, prop) {
        const original = target[prop];

        // Check if this is the chat.completions or completions object
        if (prop === "chat" && typeof original === "object") {
          return new Proxy(original, {
            get(chatTarget, chatProp) {
              const chatOriginal = chatTarget[chatProp];

              // Wrap the completions object
              if (chatProp === "completions" && typeof chatOriginal === "object") {
                return new Proxy(chatOriginal, {
                  get(completionsTarget, completionsProp) {
                    const completionsOriginal = completionsTarget[completionsProp];

                    // Wrap the create method
                    if (
                      completionsProp === "create" &&
                      typeof completionsOriginal === "function"
                    ) {
                      return self.wrapCreateMethod(
                        completionsOriginal.bind(completionsTarget),
                        client,
                        "chat.completions",
                      );
                    }

                    return completionsOriginal;
                  },
                });
              }

              return chatOriginal;
            },
          });
        }

        // Handle direct completions endpoint (legacy)
        if (prop === "completions" && typeof original === "object") {
          return new Proxy(original, {
            get(completionsTarget, completionsProp) {
              const completionsOriginal = completionsTarget[completionsProp];

              if (
                completionsProp === "create" &&
                typeof completionsOriginal === "function"
              ) {
                return self.wrapCreateMethod(
                  completionsOriginal.bind(completionsTarget),
                  client,
                  "completions",
                );
              }

              return completionsOriginal;
            },
          });
        }

        return original;
      },
    });
  }

  /**
   * Wrap the create method to capture metadata
   */
  private wrapCreateMethod(
    originalMethod: Function,
    client: any,
    methodType: "chat.completions" | "completions",
  ): Function {
    const self = this;

    return async function (this: any, ...args: any[]) {
      const startTime = Date.now();
      const request = args[0] || {};

      olakaiLogger(
        `[OpenAI Wrapper] Intercepted ${methodType}.create call`,
        "info",
      );

      // Extract request metadata
      const requestMetadata = self.extractRequestMetadata(request);

      // Extract API key from client
      const apiKey = self.extractApiKey(client);

      try {
        // Call original method
        const response = await originalMethod.apply(this, args);

        const endTime = Date.now();

        // Extract response metadata
        const responseMetadata = self.extractResponseMetadata(response);

        // Combine metadata
        const metadata: LLMMetadata = {
          provider: "openai",
          model: request.model || "unknown",
          apiKey,
          ...requestMetadata,
          ...responseMetadata,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };

        olakaiLogger(
          `[OpenAI Wrapper] Captured metadata: ${JSON.stringify(metadata)}`,
          "info",
        );

        // Send to Olakai monitoring (handled by SDK class)
        // Extract prompt and response strings before calling the callback
        if (typeof (self as any).onLLMCall === "function") {
          const prompt = self.extractPrompt(request);
          const responseText = self.extractResponse(response);
          (self as any).onLLMCall(prompt, responseText, metadata);
        }

        return response;
      } catch (error) {
        const endTime = Date.now();

        // Capture error metadata
        const errorMetadata: LLMMetadata = {
          provider: "openai",
          model: request.model || "unknown",
          apiKey,
          ...requestMetadata,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };

        olakaiLogger(
          `[OpenAI Wrapper] Error during call: ${error}`,
          "error",
        );

        // Send error to monitoring
        // Extract prompt string before calling the callback
        if (typeof (self as any).onLLMError === "function") {
          const prompt = self.extractPrompt(request);
          (self as any).onLLMError(prompt, error, errorMetadata);
        }

        throw error;
      }
    };
  }

  /**
   * Extract metadata from OpenAI request
   */
  protected extractRequestMetadata(request: any): Partial<LLMMetadata> {
    const parameters: Record<string, any> = {};

    // Extract common parameters
    if (request.temperature !== undefined) {
      parameters.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      parameters.max_tokens = request.max_tokens;
    }
    if (request.top_p !== undefined) {
      parameters.top_p = request.top_p;
    }
    if (request.frequency_penalty !== undefined) {
      parameters.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty !== undefined) {
      parameters.presence_penalty = request.presence_penalty;
    }
    if (request.n !== undefined) {
      parameters.n = request.n;
    }

    // Check for streaming
    const streamMode = request.stream === true;

    // Check for function calling
    const functionCalls =
      request.functions || request.tools
        ? { functions: request.functions, tools: request.tools }
        : undefined;

    return {
      parameters,
      streamMode,
      functionCalls: functionCalls ? [functionCalls] : undefined,
    };
  }

  /**
   * Extract metadata from OpenAI response
   */
  protected extractResponseMetadata(response: any): Partial<LLMMetadata> {
    const metadata: Partial<LLMMetadata> = {};

    // Extract token usage
    if (response.usage) {
      metadata.tokens = {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      };
    }

    // Extract finish reason
    if (response.choices && response.choices[0]?.finish_reason) {
      metadata.finishReason = response.choices[0].finish_reason;
    }

    // Extract model (actual model used, may differ from request)
    if (response.model) {
      metadata.model = response.model;
    }

    return metadata;
  }

  /**
   * Extract API key from OpenAI client
   */
  protected extractApiKey(client: any): string | undefined {
    try {
      // OpenAI client stores API key in various ways depending on version
      // Try common patterns
      if (client.apiKey) {
        return client.apiKey;
      }
      if (client._apiKey) {
        return client._apiKey;
      }
      if (client.auth) {
        return client.auth;
      }
      // For newer OpenAI SDK versions
      if (client._options?.apiKey) {
        return client._options.apiKey;
      }

      olakaiLogger(
        "[OpenAI Wrapper] Could not extract API key from client",
        "warn",
      );
      return undefined;
    } catch (error) {
      olakaiLogger(
        `[OpenAI Wrapper] Error extracting API key: ${error}`,
        "error",
      );
      return undefined;
    }
  }

  /**
   * Extract prompt from OpenAI request (works for chat and completion endpoints)
   */
  extractPrompt(request: any): string {
    try {
      // Chat completion format
      if (request.messages && Array.isArray(request.messages)) {
        return request.messages
          .map((msg: any) => {
            const role = msg.role || "user";
            const content = msg.content || "";
            return `${role}: ${content}`;
          })
          .join("\n");
      }

      // Legacy completion format
      if (request.prompt) {
        return String(request.prompt);
      }

      return "Unable to extract prompt";
    } catch (error) {
      olakaiLogger(
        `Error extracting prompt: ${error}`,
        "error",
      );
      return "Error extracting prompt";
    }
  }

  /**
   * Extract response text from OpenAI response
   */
  extractResponse(response: any): string {
    try {
      // Chat completion format
      if (response.choices && response.choices[0]?.message?.content) {
        return response.choices[0].message.content;
      }

      // Legacy completion format
      if (response.choices && response.choices[0]?.text) {
        return response.choices[0].text;
      }

      return "Unable to extract response";
    } catch (error) {
      olakaiLogger(
        `Error extracting response: ${error}`,
        "error",
      );
      return "Error extracting response";
    }
  }
}
