import { BaseLLMProvider } from "./base";
import type { LLMMetadata, LLMWrapperConfig } from "../types";
import { olakaiLogger } from "../utils";

/**
 * Google Generative AI provider implementation
 * Wraps Google Generative AI client to auto-capture metadata
 */
export class GoogleProvider extends BaseLLMProvider {
  constructor(config: LLMWrapperConfig) {
    super(config);
  }

  getProviderName(): string {
    return "google";
  }

  /**
   * Wrap Google Generative AI client with automatic tracking
   */
  wrap(client: any): any {
    const self = this;

    // Create a proxy that intercepts the models property
    return new Proxy(client, {
      get(target, prop) {
        const original = target[prop];

        // Wrap the models object to intercept getGenerativeModel
        if (prop === "models" && original) {
          return self.wrapModels(original, client);
        }

        return original;
      },
    });
  }

  /**
   * Wrap the models object to intercept generateContent and generateContentStream
   */
  private wrapModels(models: any, client: any): any {
    const self = this;

    return new Proxy(models, {
      get(target, prop) {
        const original = target[prop];

        // Wrap generateContent method
        if (prop === "generateContent" && typeof original === "function") {
          return self.wrapGenerateContent(original.bind(target), client);
        }

        // Wrap generateContentStream method
        if (
          prop === "generateContentStream" &&
          typeof original === "function"
        ) {
          return self.wrapGenerateContentStream(original.bind(target), client);
        }

        return original;
      },
    });
  }

  /**
   * Wrap the generateContent method to capture metadata
   */
  private wrapGenerateContent(originalMethod: Function, client: any): Function {
    const self = this;

    return async function (this: any, ...args: any[]) {
      const startTime = Date.now();
      const request = args[0] || {};

      olakaiLogger(`[Google Wrapper] Intercepted generateContent call`, "info");

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
          provider: "google",
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
          `[Google Wrapper] Captured metadata: ${JSON.stringify(metadata)}`,
          "info",
        );

        // Send to Olakai monitoring
        if (typeof (self as any).onLLMCall === "function") {
          const prompt =
            typeof request.contents === "string"
              ? request.contents
              : JSON.stringify(request.contents);
          (self as any).onLLMCall(prompt, response.text, metadata);
        }

        return response;
      } catch (error) {
        const endTime = Date.now();

        // Capture error metadata
        const errorMetadata: LLMMetadata = {
          provider: "google",
          model: request.model || "unknown",
          apiKey,
          ...requestMetadata,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };

        olakaiLogger(`[Google Wrapper] Error during call: ${error}`, "error");

        // Send error to monitoring
        if (typeof (self as any).onLLMError === "function") {
          (self as any).onLLMError(request.contents, error, errorMetadata);
        }

        throw error;
      }
    };
  }

  /**
   * Wrap the generateContentStream method to capture metadata
   */
  private wrapGenerateContentStream(
    originalMethod: Function,
    client: any,
  ): Function {
    const self = this;

    return async function (this: any, ...args: any[]) {
      const startTime = Date.now();
      const request = args[0] || {};

      olakaiLogger(
        `[Google Wrapper] Intercepted generateContentStream call`,
        "info",
      );

      // Extract request metadata
      const requestMetadata = self.extractRequestMetadata(request);
      requestMetadata.streamMode = true;

      // Extract API key from client
      const apiKey = self.extractApiKey(client);

      try {
        // Call original method
        const response = await originalMethod.apply(this, args);

        // Wrap the response to capture chunks as they're consumed
        const wrappedResponse = self.wrapStreamResponse(
          response,
          request,
          apiKey,
          requestMetadata,
          startTime,
        );

        return wrappedResponse;
      } catch (error) {
        const endTime = Date.now();

        const errorMetadata: LLMMetadata = {
          provider: "google",
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

        olakaiLogger(`[Google Wrapper] Stream error: ${error}`, "error");

        if (typeof (self as any).onLLMError === "function") {
          (self as any).onLLMError(request.contents, error, errorMetadata);
        }

        throw error;
      }
    };
  }

  /**
   * Wrap a stream response to capture chunks and call onLLMCall when complete
   */
  private wrapStreamResponse(
    response: any,
    request: any,
    apiKey: string | undefined,
    requestMetadata: Partial<LLMMetadata>,
    startTime: number,
  ): any {
    const self = this;
    let accumulatedText = "";
    let callbackFired = false;

    // Helper to fire the callback once when streaming is complete
    const fireCallback = (finalResponse?: any) => {
      if (callbackFired) return;
      callbackFired = true;

      const endTime = Date.now();

      // Extract response metadata if available
      const responseMetadata = finalResponse
        ? self.extractResponseMetadata(finalResponse)
        : {};

      const metadata: LLMMetadata = {
        provider: "google",
        model: request.model || "unknown",
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
        `[Google Wrapper] Stream complete, captured ${accumulatedText.length} chars`,
        "info",
      );

      if (typeof (self as any).onLLMCall === "function") {
        (self as any).onLLMCall(request.contents, accumulatedText, metadata);
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
            // Extract text from chunk and accumulate
            const chunk = result.value;
            const chunkText = self.extractTextFromChunk(chunk);
            if (chunkText) {
              accumulatedText += chunkText;
            }
          }

          return result;
        },
        async return(value?: any): Promise<IteratorResult<any>> {
          // Called when iteration is terminated early (break, return, throw)
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

    // Create a proxy that intercepts the stream property
    return new Proxy(response, {
      get(target, prop) {
        const original = target[prop];

        // Wrap the stream property (async iterable)
        if (prop === "stream" && original) {
          // If it's an async iterable, wrap it
          if (typeof original[Symbol.asyncIterator] === "function") {
            return {
              [Symbol.asyncIterator]() {
                const originalIterator = original[Symbol.asyncIterator]();
                return createWrappedIterator(originalIterator);
              },
            };
          }
        }

        // Wrap the response promise to fire callback when it resolves
        if (prop === "response" && original instanceof Promise) {
          return original.then((finalResponse: any) => {
            // Extract accumulated text from final response if we haven't already
            if (!callbackFired && finalResponse) {
              const text = self.extractTextFromResponse(finalResponse);
              if (text && !accumulatedText) {
                accumulatedText = text;
              }
            }
            fireCallback(finalResponse);
            return finalResponse;
          });
        }

        // For Symbol.asyncIterator directly on response (some versions)
        if (prop === Symbol.asyncIterator && typeof original === "function") {
          return function () {
            const originalIterator = original.call(target);
            return createWrappedIterator(originalIterator);
          };
        }

        return original;
      },
    });
  }

  /**
   * Extract text content from a stream chunk
   */
  private extractTextFromChunk(chunk: any): string {
    try {
      // Google AI chunks typically have candidates[].content.parts[].text
      if (chunk?.candidates?.[0]?.content?.parts) {
        return chunk.candidates[0].content.parts
          .map((part: any) => part.text || "")
          .join("");
      }
      // Some versions have a text() method
      if (typeof chunk?.text === "function") {
        return chunk.text();
      }
      // Or a text property
      if (typeof chunk?.text === "string") {
        return chunk.text;
      }
      return "";
    } catch {
      return "";
    }
  }

  /**
   * Extract text content from a final response object
   */
  private extractTextFromResponse(response: any): string {
    try {
      if (typeof response?.text === "function") {
        return response.text();
      }
      if (typeof response?.text === "string") {
        return response.text;
      }
      if (response?.candidates?.[0]?.content?.parts) {
        return response.candidates[0].content.parts
          .map((part: any) => part.text || "")
          .join("");
      }
      return "";
    } catch {
      return "";
    }
  }

  /**
   * Extract metadata from Google Generative AI request
   */
  protected extractRequestMetadata(request: any): Partial<LLMMetadata> {
    const parameters: Record<string, any> = {};

    // Google uses generationConfig for parameters
    const config = request.generationConfig || {};

    if (config.temperature !== undefined) {
      parameters.temperature = config.temperature;
    }
    if (config.maxOutputTokens !== undefined) {
      parameters.max_tokens = config.maxOutputTokens;
    }
    if (config.topP !== undefined) {
      parameters.top_p = config.topP;
    }
    if (config.topK !== undefined) {
      parameters.top_k = config.topK;
    }
    if (config.candidateCount !== undefined) {
      parameters.n = config.candidateCount;
    }
    if (config.stopSequences !== undefined) {
      parameters.stop = config.stopSequences;
    }

    // Check for function calling (tools)
    const functionCalls = request.tools ? { tools: request.tools } : undefined;

    return {
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      functionCalls: functionCalls ? [functionCalls] : undefined,
    };
  }

  /**
   * Extract metadata from Google Generative AI response
   */
  protected extractResponseMetadata(response: any): Partial<LLMMetadata> {
    const metadata: Partial<LLMMetadata> = {};

    // Extract token usage from usageMetadata
    const usage = response?.response?.usageMetadata || response?.usageMetadata;
    if (usage) {
      metadata.tokens = {
        prompt: usage.promptTokenCount,
        completion: usage.candidatesTokenCount,
        total: usage.totalTokenCount,
      };
    }

    // Extract finish reason from candidates
    const candidates =
      response?.response?.candidates || response?.candidates || [];
    if (candidates.length > 0 && candidates[0].finishReason) {
      metadata.finishReason = candidates[0].finishReason;
    }

    return metadata;
  }

  /**
   * Extract API key from Google Generative AI client
   */
  protected extractApiKey(client: any): string | undefined {
    try {
      // GoogleGenerativeAI stores API key in various ways
      if (client.apiKey) {
        return client.apiKey;
      }
      if (client._apiKey) {
        return client._apiKey;
      }
      // Check internal options
      if (client._options?.apiKey) {
        return client._options.apiKey;
      }

      olakaiLogger(
        "[Google Wrapper] Could not extract API key from client",
        "warn",
      );
      return undefined;
    } catch (error) {
      olakaiLogger(
        `[Google Wrapper] Error extracting API key: ${error}`,
        "error",
      );
      return undefined;
    }
  }
}
