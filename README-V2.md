# Olakai SDK v2.0 - TypeScript

> **Node.js-focused LLM monitoring SDK with automatic metadata capture**

Track AI interactions with zero manual effort. Wrap your OpenAI (and soon Anthropic) clients for automatic capture of tokens, costs, timing, and model parameters.

## 🚀 What's New in v2.0

- ✅ **Automatic metadata capture** - No more manual token counting, timing, or model tracking
- ✅ **Provider wrappers** - Seamless OpenAI integration with drop-in wrapping
- ✅ **API key tracking** - Automatic cost tracking and ROI measurement
- ✅ **Node.js focused** - Removed browser code for simpler, faster performance
- ✅ **Optional Control API** - Disabled by default, opt-in for content blocking
- ✅ **90% less code** - Simplified integration compared to v1.x

## 📦 Installation

```bash
npm install @olakai/sdk openai
# or
pnpm add @olakai/sdk openai
# or
yarn add @olakai/sdk openai
```

**Requirements:**
- Node.js 18.0.0 or higher
- TypeScript 4.8+ (for TypeScript projects)

## 🎯 Quick Start

### Basic Usage (5 lines of code!)

```typescript
import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';

// 1. Initialize Olakai SDK
//    `host` defaults to "app.olakai.ai"; for on-prem set OLAKAI_HOST or pass `host`.
const olakai = new OlakaiSDK({
  apiKey: 'your-olakai-api-key'
});
await olakai.init();

// 2. Wrap your OpenAI client
const openai = new OpenAI({ apiKey: 'your-openai-api-key' });
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    userEmail: 'user@example.com',
    task: 'Content Generation'
  }
});

// 3. Use normally - everything is auto-tracked! ✨
const response = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Write a haiku about code' }]
});

// That's it! All metadata automatically sent to Olakai:
// ✅ Model name (gpt-4)
// ✅ Token usage (prompt, completion, total)
// ✅ Request timing (duration)
// ✅ API key (for cost tracking)
// ✅ Temperature, max_tokens, and all parameters
// ✅ Error tracking
```

## 📚 Core Concepts

### What Gets Automatically Tracked

When you wrap an LLM client, Olakai automatically captures:

| Metadata | Description | Example |
|----------|-------------|---------|
| **Model** | Model name used | `gpt-4`, `gpt-3.5-turbo` |
| **Tokens** | Detailed token usage | `{prompt: 45, completion: 120, total: 165}` |
| **Timing** | Request duration | `{startTime, endTime, duration: 1234ms}` |
| **API Key** | Provider API key | `sk-...` (for cost tracking) |
| **Parameters** | All model params | `{temperature: 0.7, max_tokens: 500}` |
| **Function Calls** | Tool/function usage | Function calling metadata |
| **Stream Mode** | Streaming detection | `true/false` |
| **Finish Reason** | Stop reason | `stop`, `length`, `function_call` |
| **Errors** | API errors | Rate limits, failures |

### SDK Configuration

```typescript
const olakai = new OlakaiSDK({
  // Required
  apiKey: 'your-olakai-api-key',

  // Optional — host configuration
  host: 'app.olakai.ai',        // Hostname only. Default: "app.olakai.ai".
                                // For on-prem, set `OLAKAI_HOST` env var
                                // or pass an on-prem host (e.g. "olakai.acme.com").
                                // Used to derive monitoring, control, and feedback endpoints.

  // Optional — full endpoint overrides (rarely needed; `host` is preferred)
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt',
  controlEndpoint: 'https://app.olakai.ai/api/control/prompt',

  // Optional — behavior
  enableControl: false,  // Enable Control API globally (default: false)
  retries: 4,            // API retry attempts (default: 4)
  timeout: 30000,        // Request timeout in ms (default: 30000)
  debug: false,          // Enable debug logging (default: false)
  verbose: false         // Verbose logging (default: false)
});
```

#### On-prem deployments

For on-prem (self-hosted) Olakai installations, point the SDK at your on-prem host
in any of three ways (precedence: explicit `host` → `OLAKAI_HOST` env var → default):

```typescript
// 1. Pass `host` explicitly
new OlakaiSDK({ apiKey, host: 'olakai.acme.com' });

// 2. Set OLAKAI_HOST in the environment (Node.js)
//    OLAKAI_HOST=olakai.acme.com node app.js
new OlakaiSDK({ apiKey });

// 3. SaaS default — no configuration needed
new OlakaiSDK({ apiKey });
```

The resolved host is used for the monitoring, control, and feedback endpoints
in one place. Use `monitoringEndpoint` / `controlEndpoint` only when you need
each endpoint to point at a different URL.

### Wrapper Configuration

```typescript
const trackedOpenAI = olakai.wrap(openai, {
  // Required
  provider: 'openai',  // Currently: 'openai' | 'anthropic' | 'custom'

  // Optional
  defaultContext: {
    userEmail: 'user@example.com',  // User identification
    chatId: 'session-123',          // Session/conversation ID
    task: 'Content Generation',     // Task categorization
    subTask: 'Blog Post Writing'    // Sub-task categorization
  },
  enableControl: false,  // Override global Control API setting
  sanitize: false        // Enable data sanitization (PII redaction)
});
```

## 🎨 Usage Examples

### Example 1: E-commerce Product Descriptions

```typescript
import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';

const olakai = new OlakaiSDK({
  apiKey: process.env.OLAKAI_API_KEY,
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});
await olakai.init();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'E-commerce',
    subTask: 'Product Description'
  }
});

async function generateProductDescription(product) {
  const response = await trackedOpenAI.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are an expert copywriter for e-commerce products.'
      },
      {
        role: 'user',
        content: `Write a compelling description for: ${product.name}`
      }
    ],
    temperature: 0.7,
    max_tokens: 300
  });

  return response.choices[0].message.content;
}

// All calls are automatically tracked with full metadata!
const description = await generateProductDescription({
  name: 'Wireless Headphones',
  category: 'Electronics'
});
```

### Example 2: Customer Support Chatbot

```typescript
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'Customer Support',
    subTask: 'Live Chat'
  }
});

async function handleCustomerQuery(sessionId, userMessage, email) {
  const response = await trackedOpenAI.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful customer support agent.'
      },
      {
        role: 'user',
        content: userMessage
      }
    ]
  });

  return response.choices[0].message.content;
}
```

### Example 3: With Control API (Content Blocking)

```typescript
import { OlakaiSDK, OlakaiBlockedError } from '@olakai/sdk';

const olakai = new OlakaiSDK({
  apiKey: process.env.OLAKAI_API_KEY,
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt',
  controlEndpoint: 'https://app.olakai.ai/api/control/prompt',
  enableControl: true  // Enable Control API
});
await olakai.init();

const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'Content Moderation'
  },
  enableControl: true  // Can also enable per-wrapper
});

try {
  const response = await trackedOpenAI.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: userPrompt }]
  });

  console.log('Response:', response.choices[0].message.content);
} catch (error) {
  if (error instanceof OlakaiBlockedError) {
    console.error('Content blocked by Olakai Control API');
    console.error('Detected sensitivity:', error.details.detectedSensitivity);
    console.error('User authorized:', error.details.isAllowedPersona);
  }
}
```

### Example 4: Multiple Wrappers for Different Tasks

```typescript
// Marketing wrapper
const marketingAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'Marketing',
    subTask: 'Ad Copy'
  }
});

// Engineering wrapper
const engineeringAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'Engineering',
    subTask: 'Code Generation'
  }
});

// Each wrapper tracks to different task categories
await marketingAI.chat.completions.create({...});  // Tracked as Marketing
await engineeringAI.chat.completions.create({...}); // Tracked as Engineering
```

## 🔒 Control API

The Control API allows you to block LLM calls before execution based on:
- Sensitive content detection
- User persona authorization
- Custom control criteria

**Note:** Control API is **disabled by default** in v2.0. Enable it when you need governance and content blocking.

```typescript
const olakai = new OlakaiSDK({
  apiKey: 'your-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt',
  enableControl: true  // Enable globally
});

// Or enable per-wrapper
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  enableControl: true  // Enable for this wrapper only
});
```

## 🔄 Migration from v1.x

See [MIGRATION.md](./MIGRATION.md) for detailed migration guide.

**Quick summary:**

**Before (v1.x):**
```typescript
import { initClient, olakai } from '@olakai/sdk';

await initClient('key', 'https://app.olakai.ai');

const response = await openai.chat.completions.create({...});
olakai("event", "ai_activity", {
  prompt: "...",
  response: "...",
  tokens: response.usage.total_tokens,  // Manual!
  task: "Content Generation"
});
```

**After (v2.0):**
```typescript
import { OlakaiSDK } from '@olakai/sdk';

const olakai = new OlakaiSDK({
  apiKey: 'key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});
await olakai.init();

const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: { task: 'Content Generation' }
});

const response = await trackedOpenAI.chat.completions.create({...});
// Everything auto-tracked! ✨
```

## 📊 API Key Tracking for Cost Analysis

v2.0 automatically captures OpenAI API keys, enabling:
- **Per-key cost tracking** - Track costs by team, project, or environment
- **ROI measurement** - Measure agent implementation effectiveness
- **Budget monitoring** - Alert on cost thresholds
- **Usage attribution** - Understand which implementations drive costs

The API key is securely transmitted to your Olakai backend for cost calculation based on token usage and OpenAI pricing.

## 🛠️ Advanced Features

### Custom Dimensions & Metrics

```typescript
// Dimensions and metrics are auto-populated with LLM metadata,
// but you can still add custom data via the monitoring API
```

### Data Sanitization

```typescript
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  sanitize: true  // Enable PII redaction
});

// Automatically redacts:
// - Email addresses
// - Credit card numbers
// - SSNs
// - API keys/tokens
// - Passwords
```

### Error Tracking

Errors are automatically captured and sent to monitoring:

```typescript
try {
  const response = await trackedOpenAI.chat.completions.create({...});
} catch (error) {
  // Error automatically tracked with:
  // - Error message
  // - Request metadata
  // - Timing information
  throw error;  // Original error re-thrown
}
```

## 🔧 TypeScript Support

Full TypeScript support with type inference:

```typescript
import { OlakaiSDK, LLMMetadata, LLMWrapperConfig } from '@olakai/sdk';

const olakai = new OlakaiSDK({...});
const config: LLMWrapperConfig = {
  provider: 'openai',
  defaultContext: {
    task: 'Content Generation'
  }
};
```

## 🧪 Testing

```bash
pnpm test  # Currently no tests - coming soon!
```

## 📦 Building

```bash
pnpm run build   # Compile TypeScript to dist/
pnpm run clean   # Clean build artifacts
```

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📄 License

MIT

## 🔗 Links

- [GitHub Repository](https://github.com/ailocalnode/olakai-sdk-typescript)
- [Migration Guide](./MIGRATION.md)
- [Examples](./examples/)
- [Report Issues](https://github.com/ailocalnode/olakai-sdk-typescript/issues)

---

**Made with ❤️ by Olakai Corporation**
