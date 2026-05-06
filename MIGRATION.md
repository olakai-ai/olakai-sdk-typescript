# Migration Guide: Olakai SDK v2.0

This guide helps you migrate from the old Olakai SDK to the new v2.0 with improved DX and automatic LLM tracking.

## What's New in v2.0

✅ **Automatic metadata capture** - No more manual token counting, timing, or model tracking
✅ **LLM provider wrappers** - Wrap OpenAI (and soon Anthropic) clients for seamless integration
✅ **Node.js focused** - Removed browser support for simpler, more reliable Node.js performance
✅ **Optional Control API** - Disabled by default, opt-in when you need content blocking
✅ **API key tracking** - Automatically capture API keys for cost analysis and ROI measurement
✅ **Simplified API** - One primary SDK class instead of 3 different methods

## Breaking Changes

### 1. Node.js 18+ Required

**Before:** Worked in browsers and older Node.js versions
**Now:** Requires Node.js 18.0.0 or higher

```json
// package.json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 2. Browser Support Removed

The SDK now focuses exclusively on Node.js server-side applications. Browser-specific features (online/offline detection) have been removed.

### 3. New Initialization Pattern

**Old Way:**
```typescript
import { initClient, olakai } from '@olakai/sdk';

await initClient('your-api-key', 'https://app.olakai.ai');

olakai("event", "ai_activity", {
  prompt: "...",
  response: "...",
  tokens: 150, // Manual
  task: "Content Generation"
});
```

**New Way:**
```typescript
import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';

// Initialize SDK.
// `host` defaults to "app.olakai.ai" (SaaS). For on-prem, set the
// `OLAKAI_HOST` env var or pass `host: "olakai.acme.com"` explicitly.
const olakai = new OlakaiSDK({
  apiKey: 'your-olakai-api-key',
  enableControl: false // Optional Control API (default: false)
});

await olakai.init();

// Wrap OpenAI client
const openai = new OpenAI({ apiKey: 'your-openai-api-key' });
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    userEmail: 'user@example.com',
    task: 'Content Generation'
  }
});

// Use normally - all metadata automatically captured!
const response = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
// ✅ Model, tokens, timing, API key - all auto-tracked!
```

## Migration Steps

### Step 1: Update Dependencies

```bash
npm install @olakai/sdk@latest openai@latest
```

Ensure your Node.js version:
```bash
node --version  # Should be v18.0.0 or higher
```

### Step 2: Replace Old Initialization

**Before:**
```typescript
import { initClient } from '@olakai/sdk';
await initClient(apiKey, domainUrl);
```

**After:**
```typescript
import { OlakaiSDK } from '@olakai/sdk';

const olakai = new OlakaiSDK({
  apiKey: 'your-olakai-api-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});

await olakai.init();
```

### Step 3: Replace Manual Tracking with Wrapper

**Before (Manual Event Tracking):**
```typescript
import { olakai } from '@olakai/sdk';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: 'sk-...' });

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
});

const description = response.choices[0].message.content;

// Manually track everything
olakai("event", "ai_activity", {
  prompt,
  response: description,
  task: "Content Generation",
  tokens: response.usage?.total_tokens || 0, // Manual!
  customData: {
    model: "gpt-4" // Manual!
  }
});
```

**After (Automatic Tracking):**
```typescript
import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';

const olakai = new OlakaiSDK({
  apiKey: 'your-olakai-api-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});
await olakai.init();

const openai = new OpenAI({ apiKey: 'sk-...' });
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'Content Generation',
    userEmail: 'user@example.com'
  }
});

// Just use it normally - everything is tracked automatically!
const response = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
});

// No manual tracking needed! ✅
// - Model: auto-captured
// - Tokens: auto-captured
// - Timing: auto-captured
// - API key: auto-captured
```

### Step 4: Enable Control API (Optional)

If you were using the Control API for content blocking:

**Before:**
```typescript
// Control API was always enabled
```

**After:**
```typescript
const olakai = new OlakaiSDK({
  apiKey: 'your-api-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt',
  enableControl: true // Opt-in to Control API
});

// Or enable per-wrapper
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  enableControl: true,
  defaultContext: { ... }
});
```

## API Comparison

### Old API Methods (Deprecated but Still Supported)

| Old Method | Status | Replacement |
|------------|--------|-------------|
| `initClient()` | ⚠️ Deprecated | `new OlakaiSDK().init()` |
| `olakai()` | ⚠️ Deprecated | `OlakaiSDK.wrap()` |
| `olakaiReport()` | ⚠️ Deprecated | `OlakaiSDK.wrap()` |
| `olakaiMonitor()` | ⚠️ Deprecated | `OlakaiSDK.wrap()` |

### What's Automatically Captured Now

The new SDK automatically captures:

- ✅ **Model name** (e.g., "gpt-4", "gpt-3.5-turbo")
- ✅ **Token usage** (prompt_tokens, completion_tokens, total_tokens)
- ✅ **Request timing** (start time, end time, duration)
- ✅ **Model parameters** (temperature, max_tokens, top_p, etc.)
- ✅ **Function calling** (if using tools/functions)
- ✅ **Streaming mode** detection
- ✅ **Finish reason** (stop, length, function_call, etc.)
- ✅ **OpenAI API key** (for cost tracking and ROI analysis)
- ✅ **Error states** (rate limits, API errors)

## Full Example: Before & After

### Before (v1.x)

```typescript
import { initClient, olakai } from '@olakai/sdk';
import OpenAI from 'openai';

// Initialize
await initClient('olakai-key', 'https://app.olakai.ai');

// Create OpenAI client
const openai = new OpenAI({ apiKey: 'sk-...' });

// Make request
const startTime = Date.now(); // Manual timing!
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Write a haiku about code' }],
  temperature: 0.7
});
const endTime = Date.now();

// Manually extract everything
const result = response.choices[0].message.content;
const tokens = response.usage?.total_tokens || 0;
const requestTime = endTime - startTime;

// Manually track
olakai("event", "ai_activity", {
  prompt: 'Write a haiku about code',
  response: result,
  task: 'Creative Writing',
  userEmail: 'user@example.com',
  tokens, // Manual
  requestTime, // Manual
  customData: {
    model: 'gpt-4',    // Manual
    temperature: 0.7,  // Manual
    tokenCount: tokens // Manual duplicate
  }
});
```

### After (v2.0)

```typescript
import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';

// Initialize SDK
const olakai = new OlakaiSDK({
  apiKey: 'olakai-key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});
await olakai.init();

// Wrap OpenAI client
const openai = new OpenAI({ apiKey: 'sk-...' });
const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: {
    task: 'Creative Writing',
    userEmail: 'user@example.com'
  }
});

// Just use it - everything auto-tracked! ✨
const response = await trackedOpenAI.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Write a haiku about code' }],
  temperature: 0.7
});

// That's it! No manual tracking needed.
// All metadata (model, tokens, timing, API key, temperature) automatically captured!
```

## Backwards Compatibility

The old API methods still work but are deprecated:

```typescript
// Still works, but deprecated
import { initClient, olakai, olakaiReport, olakaiMonitor } from '@olakai/sdk';

await initClient('key', 'https://app.olakai.ai');
olakai("event", "ai_activity", { ... });
```

**⚠️ Warning:** These will be removed in v3.0. Migrate to the new `OlakaiSDK` class.

## Benefits of Migrating

1. **90% less code** - No manual extraction of tokens, timing, model names
2. **Automatic cost tracking** - API keys captured for ROI analysis
3. **Type safety** - Better TypeScript support with generic types
4. **Error resilience** - Monitoring failures don't break your app
5. **Future-proof** - Easy to add Anthropic, Cohere, and other providers

## Need Help?

- 📚 [Full documentation](https://github.com/ailocalnode/olakai-sdk-typescript#readme)
- 🐛 [Report issues](https://github.com/ailocalnode/olakai-sdk-typescript/issues)
- 💬 Contact support at support@olakai.ai
