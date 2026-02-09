import { BaseLLMProvider } from "./base";
import type { LLMMetadata, LLMWrapperConfig } from "../types";
import { olakaiLogger } from "../utils";

/**
 * Anthropic provider implementation
 * Wraps Anthropic client to auto-capture metadata
 */
export class AnthropicProvider extends BaseLLMProvider {
  constructor(config: LLMWrapperConfig) {
    super(config);
  }

  getProviderName(): string {
    return "anthropic";
  }

  /**
   * Wrap Anthropic client with automatic tracking
   */
  wrap(client: any): any {
    const self = this;

    // Create a proxy that intercepts method calls
    return new Proxy(client, {
      get(target, prop) {
        const original = target[prop];

        // Check if this is the messages object
        if (prop === "messages" && typeof original === "object") {
          return new Proxy(original, {
            get(messagesTarget, messagesProp) {
              const messagesOriginal = messagesTarget[messagesProp];

              // Wrap the create method
              if (
                messagesProp === "create" &&
                typeof messagesOriginal === "function"
              ) {
                return self.wrapCreateMethod(
                  messagesOriginal.bind(messagesTarget),
                  client,
                );
              }

              // Wrap the stream method (if available in the SDK)
              if (
                messagesProp === "stream" &&
                typeof messagesOriginal === "function"
              ) {
                return self.wrapStreamMethod(
                  messagesOriginal.bind(messagesTarget),
                  client,
                );
              }

              return messagesOriginal;
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
  private wrapCreateMethod(originalMethod: Function, client: any): Function {
    const self = this;

    return async function (this: any, ...args: any[]) {
      const startTime = Date.now();
      const request = args[0] || {};

      olakaiLogger(
        `[Anthropic Wrapper] Intercepted messages.create call`,
        "info",
      );

      // Extract request metadata
      const requestMetadata = self.extractRequestMetadata(request);

      // Extract API key from client
      const apiKey = self.extractApiKey(client);

      // Check if this is a streaming request
      if (request.stream === true) {
        return self.handleStreamingCreate(
          originalMethod,
          args,
          request,
          apiKey,
          requestMetadata,
          startTime,
        );
      }

      try {
        // Call original method
        const response = await originalMethod.apply(this, args);

        const endTime = Date.now();

        // Extract response metadata
        const responseMetadata = self.extractResponseMetadata(response);

        // Combine metadata
        const metadata: LLMMetadata = {
          provider: "anthropic",
          model: response.model || request.model || "unknown",
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
          `[Anthropic Wrapper] Captured metadata: ${JSON.stringify(metadata)}`,
          "info",
        );

        // Send to Olakai monitoring
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
          provider: "anthropic",
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
          `[Anthropic Wrapper] Error during call: ${error}`,
          "error",
        );

        // Send error to monitoring
        if (typeof (self as any).onLLMError === "function") {
          const prompt = self.extractPrompt(request);
          (self as any).onLLMError(prompt, error, errorMetadata);
        }

        throw error;
      }
    };
  }

  /**
   * Wrap the stream method to capture metadata
   */
  private wrapStreamMethod(originalMethod: Function, client: any): Function {
    const self = this;

    return function (this: any, ...args: any[]) {
      const startTime = Date.now();
      const request = args[0] || {};

      olakaiLogger(
        `[Anthropic Wrapper] Intercepted messages.stream call`,
        "info",
      );

      // Extract request metadata
      const requestMetadata = self.extractRequestMetadata(request);
      requestMetadata.streamMode = true;

      // Extract API key from client
      const apiKey = self.extractApiKey(client);

      try {
        // Call original method
        const stream = originalMethod.apply(this, args);

        // Wrap the stream to capture events
        return self.wrapStream(stream, request, apiKey, requestMetadata, startTime);
      } catch (error) {
        const endTime = Date.now();

        const errorMetadata: LLMMetadata = {
          provider: "anthropic",
          model: request.model || "unknown",
          apiKey,
          ...requestMetadata,
          streamMode: true,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };

        olakaiLogger(`[Anthropic Wrapper] Stream error: ${error}`, "error");

        if (typeof (self as any).onLLMError === "function") {
          const prompt = self.extractPrompt(request);
          (self as any).onLLMError(prompt, error, errorMetadata);
        }

        throw error;
      }
    };
  }

  /**
   * Handle streaming requests via messages.create({ stream: true })
   */
  private async handleStreamingCreate(
    originalMethod: Function,
    args: any[],
    request: any,
    apiKey: string | undefined,
    requestMetadata: Partial<LLMMetadata>,
    startTime: number,
  ): Promise<any> {
    const self = this;

    try {
      // Call original method - returns a stream
      const stream = await originalMethod.apply(null, args);

      // Wrap the stream to capture events
      return self.wrapStream(stream, request, apiKey, { ...requestMetadata, streamMode: true }, startTime);
    } catch (error) {
      const endTime = Date.now();

      const errorMetadata: LLMMetadata = {
        provider: "anthropic",
        model: request.model || "unknown",
        apiKey,
        ...requestMetadata,
        streamMode: true,
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      };

      olakaiLogger(`[Anthropic Wrapper] Stream error: ${error}`, "error");

      if (typeof (self as any).onLLMError === "function") {
        const prompt = self.extractPrompt(request);
        (self as any).onLLMError(prompt, error, errorMetadata);
      }

      throw error;
    }
  }

  /**
   * Wrap a stream to capture events and call onLLMCall when complete
   */
  private wrapStream(
    stream: any,
    request: any,
    apiKey: string | undefined,
    requestMetadata: Partial<LLMMetadata>,
    startTime: number,
  ): any {
    const self = this;
    let accumulatedText = "";
    let callbackFired = false;
    let finalMessage: any = null;

    // Helper to fire the callback once when streaming is complete
    const fireCallback = () => {
      if (callbackFired) return;
      callbackFired = true;

      const endTime = Date.now();

      // Extract response metadata from final message if available
      const responseMetadata = finalMessage
        ? self.extractResponseMetadata(finalMessage)
        : {};

      const metadata: LLMMetadata = {
        provider: "anthropic",
        model: finalMessage?.model || request.model || "unknown",
        apiKey,
        ...requestMetadata,
        ...responseMetadata,
        streamMode: true,
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      };

      olakaiLogger(
        `[Anthropic Wrapper] Stream complete, captured ${accumulatedText.length} chars`,
        "info",
      );

      if (typeof (self as any).onLLMCall === "function") {
        const prompt = self.extractPrompt(request);
        (self as any).onLLMCall(prompt, accumulatedText, metadata);
      }
    };

    // Create wrapped async iterator that accumulates text
    const createWrappedIterator = (originalIterator: AsyncIterator<any>) => {
      return {
        async next(): Promise<IteratorResult<any>> {
          const result = await originalIterator.next();

          if (result.done) {
            // Stream complete - fire the callback
            fireCallback();
          } else if (result.value) {
            // Extract text from event and accumulate
            const event = result.value;
            const eventText = self.extractTextFromEvent(event);
            if (eventText) {
              accumulatedText += eventText;
            }

            // Capture final message event for metadata
            if (event.type === "message_stop" && event.message) {
              finalMessage = event.message;
            } else if (event.type === "message" && event.message) {
              finalMessage = event.message;
            }
          }

          return result;
        },
        async return(value?: any): Promise<IteratorResult<any>> {
          // Called when iteration is terminated early
          fireCallback();
          if (originalIterator.return) {
            return originalIterator.return(value);
          }
          return { done: true, value };
        },
        async throw(error?: any): Promise<IteratorResult<any>> {
          if (originalIterator.throw) {
            return originalIterator.throw(error);
          }
          throw error;
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    };

    // Create a proxy that wraps async iteration and other properties
    return new Proxy(stream, {
      get(target, prop) {
        const original = target[prop];

        // Wrap Symbol.asyncIterator to intercept iteration
        if (prop === Symbol.asyncIterator && typeof original === "function") {
          return function () {
            const originalIterator = original.call(target);
            return createWrappedIterator(originalIterator);
          };
        }

        // Wrap finalMessage or getFinalMessage to fire callback
        if (prop === "finalMessage" && original instanceof Promise) {
          return original.then((msg: any) => {
            finalMessage = msg;
            if (msg) {
              const text = self.extractResponse(msg);
              if (text && !accumulatedText) {
                accumulatedText = text;
              }
            }
            fireCallback();
            return msg;
          });
        }

        if (prop === "getFinalMessage" && typeof original === "function") {
          return async function (...fnArgs: any[]) {
            const msg = await original.apply(target, fnArgs);
            finalMessage = msg;
            if (msg) {
              const text = self.extractResponse(msg);
              if (text && !accumulatedText) {
                accumulatedText = text;
              }
            }
            fireCallback();
            return msg;
          };
        }

        // Wrap text() method to return accumulated text
        if (prop === "text" && typeof original === "function") {
          return async function (...fnArgs: any[]) {
            const text = await original.apply(target, fnArgs);
            accumulatedText = text;
            fireCallback();
            return text;
          };
        }

        // Handle on() for event-based streaming
        if (prop === "on" && typeof original === "function") {
          return function (eventName: string, handler: Function) {
            if (eventName === "text") {
              // Wrap text event handler to accumulate
              const wrappedHandler = (text: string) => {
                accumulatedText += text;
                return handler(text);
              };
              return original.call(target, eventName, wrappedHandler);
            }

            if (eventName === "message" || eventName === "end" || eventName === "finalMessage") {
              // Wrap message/end event handler to fire callback
              const wrappedHandler = (...eventArgs: any[]) => {
                if (eventArgs[0]) {
                  finalMessage = eventArgs[0];
                }
                fireCallback();
                return handler(...eventArgs);
              };
              return original.call(target, eventName, wrappedHandler);
            }

            return original.call(target, eventName, handler);
          };
        }

        return original;
      },
    });
  }

  /**
   * Extract text content from a stream event
   */
  private extractTextFromEvent(event: any): string {
    try {
      // content_block_delta event with text delta
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        return event.delta.text || "";
      }

      // Some SDK versions use different event structures
      if (event.type === "text" && typeof event.text === "string") {
        return event.text;
      }

      return "";
    } catch {
      return "";
    }
  }

  /**
   * Extract metadata from Anthropic request
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
    if (request.top_k !== undefined) {
      parameters.top_k = request.top_k;
    }
    if (request.stop_sequences !== undefined) {
      parameters.stop = request.stop_sequences;
    }

    // Check for streaming
    const streamMode = request.stream === true;

    // Check for tool use
    const functionCalls = request.tools
      ? { tools: request.tools }
      : undefined;

    return {
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      streamMode,
      functionCalls: functionCalls ? [functionCalls] : undefined,
    };
  }

  /**
   * Extract metadata from Anthropic response
   */
  protected extractResponseMetadata(response: any): Partial<LLMMetadata> {
    const metadata: Partial<LLMMetadata> = {};

    // Extract token usage
    if (response.usage) {
      metadata.tokens = {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total:
          (response.usage.input_tokens || 0) +
          (response.usage.output_tokens || 0),
      };
    }

    // Extract stop reason
    if (response.stop_reason) {
      metadata.finishReason = response.stop_reason;
    }

    // Extract model (actual model used)
    if (response.model) {
      metadata.model = response.model;
    }

    return metadata;
  }

  /**
   * Extract API key from Anthropic client
   */
  protected extractApiKey(client: any): string | undefined {
    try {
      // Anthropic client stores API key in various ways depending on version
      if (client.apiKey) {
        return client.apiKey;
      }
      if (client._apiKey) {
        return client._apiKey;
      }
      // For newer Anthropic SDK versions
      if (client._options?.apiKey) {
        return client._options.apiKey;
      }
      // Check auth header pattern
      if (client.authToken) {
        return client.authToken;
      }

      olakaiLogger(
        "[Anthropic Wrapper] Could not extract API key from client",
        "warn",
      );
      return undefined;
    } catch (error) {
      olakaiLogger(
        `[Anthropic Wrapper] Error extracting API key: ${error}`,
        "error",
      );
      return undefined;
    }
  }

  /**
   * Extract prompt from Anthropic request (user messages only)
   */
  extractPrompt(request: any): string {
    try {
      const userMessages: string[] = [];

      if (request.messages && Array.isArray(request.messages)) {
        for (const msg of request.messages) {
          if (msg.role !== "user") continue;

          if (typeof msg.content === "string") {
            userMessages.push(msg.content);
          } else if (Array.isArray(msg.content)) {
            // Handle content blocks (text, image, etc.)
            const text = msg.content
              .map((block: any) => {
                if (block.type === "text") {
                  return block.text;
                }
                return "";
              })
              .filter(Boolean)
              .join(" ");
            if (text) {
              userMessages.push(text);
            }
          }
        }
      }

      return userMessages.join("\n");
    } catch (error) {
      olakaiLogger(`Error extracting prompt: ${error}`, "error");
      return "Error extracting prompt";
    }
  }

  /**
   * Extract response text from Anthropic response
   */
  extractResponse(response: any): string {
    try {
      // Response has content array with content blocks
      if (response.content && Array.isArray(response.content)) {
        return response.content
          .map((block: any) => {
            if (block.type === "text") {
              return block.text;
            }
            if (block.type === "tool_use") {
              return `[tool_use: ${block.name}(${JSON.stringify(block.input)})]`;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n");
      }

      // Some responses may have direct text property
      if (typeof response.text === "string") {
        return response.text;
      }

      return "Unable to extract response";
    } catch (error) {
      olakaiLogger(`Error extracting response: ${error}`, "error");
      return "Error extracting response";
    }
  }
}
