# Vercel AI SDK Integration

> **Track 25+ LLM providers with a single integration**

The Olakai SDK now integrates with the [Vercel AI SDK](https://ai-sdk.dev), giving you automatic monitoring across all supported providers with zero manual tracking.

## 🎯 Why Use Vercel AI SDK Integration?

### Before: Manual Provider Integration
```typescript
// Custom wrapper for OpenAI
const trackedOpenAI = olakai.wrap(openai, { provider: 'openai' });

// Different wrapper for Anthropic
const trackedClaude = olakai.wrap(claude, { provider: 'anthropic' });

// Different wrapper for Google
const trackedGemini = olakai.wrap(gemini, { provider: 'google' });

// Lots of provider-specific code...
```

### After: One Integration, All Providers
```typescript
// Same code works for ALL providers!
const result = await olakai.generateText({
  model: openai('gpt-4'),  // Or anthropic(), google(), mistral(), etc.
  prompt: 'Hello world'
}, {
  task: 'Greeting',
  apiKey: 'your-api-key'
});

// Everything auto-tracked! ✨
```

## 📦 Installation

```bash
npm install @olakai/sdk ai
# or
pnpm add @olakai/sdk ai
# or
yarn add @olakai/sdk ai
```

**Note:** The `ai` package (Vercel AI SDK) is an optional peer dependency. Install it only if you want to use this integration.

## 🚀 Quick Start

```typescript
import { OlakaiSDK } from '@olakai/sdk';
import { openai } from '@ai-sdk/openai';

// Initialize Olakai
const olakai = new OlakaiSDK({
  apiKey: 'your-olakai-api-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});
await olakai.init();

// Use generateText with automatic tracking
const result = await olakai.generateText({
  model: openai('gpt-4'),
  prompt: 'Explain TypeScript in one sentence'
}, {
  task: 'Education'
});

console.log(result.text);
// ✅ Automatically tracked: model, tokens, timing, API key, all parameters
```

## 🌐 Supported Providers

The Vercel AI SDK supports 25+ providers. Here are the most popular:

| Provider | Package | Models |
|----------|---------|--------|
| **OpenAI** | `@ai-sdk/openai` | GPT-4, GPT-3.5, GPT-4 Turbo |
| **Anthropic** | `@ai-sdk/anthropic` | Claude 3 Opus, Sonnet, Haiku |
| **Google** | `@ai-sdk/google` | Gemini Pro, Gemini Ultra |
| **Mistral** | `@ai-sdk/mistral` | Mistral Large, Medium, Small |
| **Groq** | `@ai-sdk/groq` | Llama 3, Mixtral |
| **Cohere** | `@ai-sdk/cohere` | Command, Command Light |
| **Amazon Bedrock** | `@ai-sdk/amazon-bedrock` | Claude, Llama 2, Titan |
| **Azure OpenAI** | `@ai-sdk/azure` | GPT-4, GPT-3.5 |
| **xAI** | `@ai-sdk/xai` | Grok |
| **DeepSeek** | `@ai-sdk/deepseek` | DeepSeek Chat |

**Plus:** Community providers for Ollama, LM Studio, OpenRouter, and any OpenAI-compatible API.

[View full provider list →](https://ai-sdk.dev/providers/ai-sdk-providers)

## 📚 API Reference

### `olakai.generateText(params, context)`

Generate text using any Vercel AI SDK provider with automatic tracking.

#### Parameters

**`params`** - Vercel AI SDK generateText parameters
```typescript
{
  model: LanguageModel,        // Required: Model instance from provider
  prompt?: string,             // Simple prompt
  messages?: Message[],        // Or chat messages
  system?: string,             // System prompt
  temperature?: number,        // Model temperature
  maxTokens?: number,          // Max tokens to generate
  topP?: number,               // Top-P sampling
  topK?: number,               // Top-K sampling
  seed?: number,               // Random seed
  tools?: ToolSet,             // Function/tool definitions
  // ... and more
}
```

**`context`** - Olakai tracking context (optional)
```typescript
{
  task?: string,               // Task categorization
  subTask?: string,            // Sub-task categorization
  userEmail?: string,          // User identification
  chatId?: string,             // Session/conversation ID
  enableControl?: boolean,     // Enable Control API for this call
  sanitize?: boolean           // Enable PII redaction
}
```

#### Returns

Vercel AI SDK generateText result with:
```typescript
{
  text: string,                // Generated text
  usage: {                     // Token usage
    inputTokens: number,
    outputTokens: number,
    totalTokens: number,
    reasoningTokens?: number,
    cachedInputTokens?: number
  },
  finishReason: string,        // Why generation stopped
  response: {                  // Response metadata
    id: string,
    modelId: string,
    timestamp: Date,
    headers?: Record<string, string>
  },
  toolCalls?: ToolCall[],      // If using tools
  toolResults?: ToolResult[]
}
```

### `olakai.streamText(params, context)`

Stream text generation with automatic tracking when stream completes.

#### Parameters

Same as `generateText()`.

#### Returns

Vercel AI SDK streamText result with:
```typescript
{
  textStream: AsyncIterable<string>,  // Stream of text chunks
  fullStream: AsyncIterable<...>,     // Stream with all data
  finishPromise: Promise<...>,        // Resolves when done
  // ... and more
}
```

**Note:** Tracking happens automatically when the stream completes. You don't need to do anything special!

## 💡 Usage Examples

### Example 1: Multiple Providers

```typescript
import { OlakaiSDK } from '@olakai/sdk';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

const olakai = new OlakaiSDK({ apiKey: '...' });
await olakai.init();

// OpenAI
const gpt4 = await olakai.generateText({
  model: openai('gpt-4'),
  prompt: 'Hello'
}, { task: 'Greeting' });

// Anthropic
const claude = await olakai.generateText({
  model: anthropic('claude-3-opus'),
  prompt: 'Hello'
}, { task: 'Greeting', apiKey: process.env.ANTHROPIC_API_KEY });

// Google
const gemini = await olakai.generateText({
  model: google('gemini-pro'),
  prompt: 'Hello'
}, { task: 'Greeting', apiKey: process.env.GOOGLE_API_KEY });

// All tracked automatically with the same code!
```

### Example 2: Chat Messages

```typescript
const result = await olakai.generateText({
  model: openai('gpt-4'),
  messages: [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'What is TypeScript?' },
    { role: 'assistant', content: 'TypeScript is...' },
    { role: 'user', content: 'Give me an example' }
  ],
  temperature: 0.7,
  maxTokens: 500
}, {
  task: 'Customer Support',
  userEmail: 'user@example.com',
  chatId: 'session-123'
});
```

### Example 3: Streaming

```typescript
const result = await olakai.streamText({
  model: openai('gpt-4'),
  prompt: 'Write a long story about AI'
}, {
  task: 'Content Generation'
});

// Stream the response
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// Tracking happens automatically when stream completes!
```

### Example 4: Function Calling

```typescript
import { z } from 'zod';
import { tool } from 'ai';

const result = await olakai.generateText({
  model: openai('gpt-4'),
  prompt: 'What is the weather in San Francisco?',
  tools: {
    getWeather: tool({
      description: 'Get the weather for a location',
      parameters: z.object({
        location: z.string()
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72,
        condition: 'Sunny'
      })
    })
  },
  maxSteps: 5
}, {
  task: 'Weather Query',
  apiKey: process.env.OPENAI_API_KEY
});

console.log(result.text);
console.log(result.toolCalls); // Tool usage tracked automatically
```

### Example 5: Provider Switching

```typescript
// Easy A/B testing or fallback logic
async function generateWithFallback(prompt: string) {
  try {
    return await olakai.generateText({
      model: openai('gpt-4'),
      prompt
    }, { apiKey: process.env.OPENAI_API_KEY });
  } catch (error) {
    // Fallback to Claude
    return await olakai.generateText({
      model: anthropic('claude-3-sonnet'),
      prompt
    }, { apiKey: process.env.ANTHROPIC_API_KEY });
  }
}

// Both attempts tracked with proper error handling
```

### Example 6: Local Models (Ollama)

```typescript
import { ollama } from 'ollama-ai-provider';

// Track local model usage too!
const result = await olakai.generateText({
  model: ollama('llama3'),
  prompt: 'Explain quantum computing'
}, {
  task: 'Research',
  // No API key needed for local models
});
```

## 🔒 Control API with Vercel AI SDK

Block sensitive prompts before they reach the LLM:

```typescript
import { OlakaiSDK, OlakaiBlockedError } from '@olakai/sdk';

const olakai = new OlakaiSDK({
  apiKey: 'olakai-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt',
  enableControl: true  // Enable globally
});
await olakai.init();

try {
  const result = await olakai.generateText({
    model: openai('gpt-4'),
    prompt: userInput
  }, {
    task: 'User Query',
    enableControl: true,  // Or enable per-call
    apiKey: process.env.OPENAI_API_KEY
  });

  console.log(result.text);
} catch (error) {
  if (error instanceof OlakaiBlockedError) {
    console.error('Content blocked:', error.details);
  }
}
```

## 📊 What Gets Automatically Tracked

When using Vercel AI SDK integration, Olakai automatically captures:

| Metadata | Source | Example |
|----------|--------|---------|
| **Provider** | Inferred from model | `openai`, `anthropic`, `google` |
| **Model** | `response.modelId` | `gpt-4-0613` |
| **API Key** | Context (explicit) | `sk-...` (for cost tracking) |
| **Input Tokens** | `usage.inputTokens` | `45` |
| **Output Tokens** | `usage.outputTokens` | `120` |
| **Total Tokens** | `usage.totalTokens` | `165` |
| **Reasoning Tokens** | `usage.reasoningTokens` | `30` (if supported) |
| **Cached Tokens** | `usage.cachedInputTokens` | `15` (if cached) |
| **Request Duration** | Measured automatically | `1234ms` |
| **Finish Reason** | `finishReason` | `stop`, `length`, `tool-calls` |
| **Parameters** | Request params | `{temperature: 0.7, maxTokens: 500}` |
| **Tool Calls** | `toolCalls` | Function calling metadata |
| **Stream Mode** | Detected automatically | `true` / `false` |
| **Errors** | Exception handling | Error messages and states |

## 🔄 Hybrid Approach: Direct + Vercel AI

You can use both integration methods simultaneously:

```typescript
import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';
import { openai as vercelOpenAI } from '@ai-sdk/openai';

const olakai = new OlakaiSDK({ apiKey: '...' });
await olakai.init();

// Method 1: Direct OpenAI wrapper (extracts API key automatically)
const directOpenAI = new OpenAI({ apiKey: 'sk-...' });
const trackedDirect = olakai.wrap(directOpenAI, {
  provider: 'openai',
  defaultContext: { task: 'Direct Integration' }
});

await trackedDirect.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Method 2: Vercel AI SDK (supports 25+ providers)
await olakai.generateText({
  model: vercelOpenAI('gpt-4'),
  prompt: 'Hello'
}, {
  task: 'Vercel AI Integration',
  apiKey: 'sk-...'  // Explicit API key
});

// Both methods tracked to same Olakai backend!
```

**When to use each:**
- **Direct wrapper**: When you need automatic API key extraction from OpenAI client
- **Vercel AI SDK**: When you want multi-provider support or use Vercel AI features

## ⚠️ Limitations & Considerations

### API Key Handling

Unlike the direct OpenAI wrapper, the Vercel AI SDK integration requires **explicit API key** in context:

```typescript
// Direct wrapper: API key extracted automatically
const trackedOpenAI = olakai.wrap(new OpenAI({ apiKey: 'sk-...' }), {...});

// Vercel AI: API key must be provided in context
await olakai.generateText({...}, {
  apiKey: 'sk-...'  // Required for cost tracking
});
```

### Why?

Vercel AI SDK abstracts the underlying client, so we can't access the API key programmatically. This is a design choice by Vercel for security and flexibility.

### Streaming Metadata

Stream tracking happens when the stream completes via `finishPromise`. If the stream is interrupted or not fully consumed, metadata may be incomplete.

## 🆚 Comparison: Direct vs Vercel AI Integration

| Feature | Direct Wrapper | Vercel AI Integration |
|---------|---------------|----------------------|
| **Providers** | OpenAI only (Anthropic planned) | 25+ providers |
| **API Key Extraction** | ✅ Automatic | ⚠️ Manual (context) |
| **Setup Complexity** | Simple | Simple |
| **Code Changes** | Minimal (wrap client) | Minimal (use olakai methods) |
| **Streaming** | ✅ Supported | ✅ Supported |
| **Function Calling** | ✅ Supported | ✅ Supported |
| **Community Support** | Olakai | Vercel + Olakai |
| **Future-Proof** | New providers = new wrappers | Vercel adds = auto-supported |

## 📖 Further Reading

- [Vercel AI SDK Documentation](https://ai-sdk.dev)
- [Vercel AI SDK Providers](https://ai-sdk.dev/providers/ai-sdk-providers)
- [Olakai Main README](./README-V2.md)
- [Migration Guide](./MIGRATION.md)

## 🤝 Contributing

Found a bug or want to add a feature? [Open an issue](https://github.com/ailocalnode/olakai-sdk-typescript/issues) or submit a PR!

---

**Made with ❤️ by Olakai Corporation**
