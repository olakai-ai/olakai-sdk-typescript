import type { LLMMetadata, LLMWrapperConfig } from "../types";

/**
 * Abstract base class for LLM provider wrappers
 * Providers (OpenAI, Anthropic, etc.) extend this to implement specific wrapping logic
 */
export abstract class BaseLLMProvider<TClient = any> {
  protected config: LLMWrapperConfig;

  constructor(config: LLMWrapperConfig) {
    this.config = config;
  }

  /**
   * Wrap an LLM client to auto-capture metadata and send to Olakai
   * @param client - The LLM client instance (e.g., OpenAI client)
   * @returns Wrapped client with same interface but automatic tracking
   */
  abstract wrap(client: TClient): TClient;

  /**
   * Extract metadata from LLM request parameters
   * @param request - The request object/parameters
   * @returns Partial LLM metadata extracted from request
   */
  protected abstract extractRequestMetadata(request: any): Partial<LLMMetadata>;

  /**
   * Extract metadata from LLM response
   * @param response - The response object from the LLM
   * @returns Partial LLM metadata extracted from response
   */
  protected abstract extractResponseMetadata(
    response: any,
  ): Partial<LLMMetadata>;

  /**
   * Get the provider name
   * @returns The provider name (e.g., "openai", "anthropic")
   */
  abstract getProviderName(): string;
}
