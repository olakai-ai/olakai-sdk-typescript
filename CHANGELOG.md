# Changelog

All notable changes to the Olakai SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2026-04-09

### Added

- **`OlakaiSDK.feedback()`** — New public method for reporting explicit user feedback on a prior agent interaction. Fire-and-forget, like `event()`.
  - Parameters: `sessionId`, `rating: "UP" | "DOWN"`, and optional `turnIndex`, `comment`, `userEmail`, `customData`
  - Correlates with the original interaction via `sessionId` (+ optional `turnIndex`)
  - Emits a feedback event with well-known `customData` keys the Olakai platform recognizes — no extra correlation work required
- **`OlakaiFeedbackParams`** type exported alongside other event types

### Example

```typescript
// Report when the end user clicks thumbs up on an assistant response
olakai.feedback({
  sessionId: conversationId,
  turnIndex: 3,
  rating: "UP",
  comment: "Very helpful answer",
});
```

## [2.0.0] - 2025-01-07

### Changed

- **BREAKING:** Unified `customDimensions` and `customMetrics` into single `customData` field
  - Type: `Record<string, string | number | boolean | undefined>`
  - Allows mixed value types (strings, numbers, booleans) in a single object
  - Use descriptive keys instead of `dim1-5` and `metric1-5` patterns

### Migration

Replace separate dimension/metric objects with unified `customData`:

```typescript
// Before (1.x)
olakai("event", "ai_activity", {
  prompt,
  response,
  customDimensions: {
    dim1: "gpt-4",
    dim2: "e-commerce",
  },
  customMetrics: {
    metric1: 150,
    metric2: 2.5,
  },
});

// After (2.0)
olakai("event", "ai_activity", {
  prompt,
  response,
  customData: {
    model: "gpt-4",
    domain: "e-commerce",
    tokenCount: 150,
    processingTime: 2.5,
  },
});
```

## [1.6.0] - 2024-12-30

### Added

- **Default endpoint** - Added default endpoint `https://app.olakai.ai` for both `olakaiConfig()` and `OlakaiSDK` class
- The `endpoint` parameter in `olakaiConfig()` is now optional
- The `monitoringEndpoint` parameter in `OlakaiSDK` constructor is now optional

### Changed

- SDK no longer throws `URLConfigurationError` when endpoint is not provided - uses default instead

### Compatibility

- Fully backwards compatible - existing code with explicit endpoints continues to work
- Users can now initialize with just `olakaiConfig({ apiKey: "..." })` without specifying endpoint

## [1.5.0] - 2024-12-30

### Added

- **`userId` field** - Added `userId` to `OlakaiEventParams`, `MonitorPayload`, `VercelAIContext`, and `LLMWrapperConfig.defaultContext` for explicit user tracking
- **Flexible custom dimensions** - `customDimensions` now uses `Record<string, string | undefined>` for arbitrary key names
- **Flexible custom metrics** - `customMetrics` now uses `Record<string, number | undefined>` for arbitrary key names

### Changed

- Updated type definitions to align with backend monitoring API
- Custom dimensions/metrics no longer limited to `dim1-5` and `metric1-5` patterns

### Compatibility

- Backwards compatible with existing code using `dim1-5` and `metric1-5` keys
- New `userId` field is optional

## [2.0.0] - 2024-11-14

### 🎉 Major Release - Complete Refactor

This is a major release with breaking changes. See [MIGRATION.md](./MIGRATION.md) for upgrade instructions.

### Added

- **New `OlakaiSDK` class** - Simplified, intuitive API for wrapping LLM clients
- **Provider wrapper architecture** - Extensible system for supporting multiple LLM providers
- **OpenAI provider** - Full automatic tracking for OpenAI SDK
  - Wraps `chat.completions.create()`
  - Wraps legacy `completions.create()`
  - Auto-captures all metadata (tokens, model, timing, parameters)
- **Automatic API key extraction** - Captures OpenAI API key for cost tracking
- **Automatic token tracking** - No manual token counting needed
- **Automatic timing measurement** - Request duration auto-calculated
- **Automatic parameter capture** - temperature, max_tokens, etc.
- **Function calling detection** - Auto-tracks tool/function usage
- **Streaming mode detection** - Identifies streaming vs regular calls
- **Finish reason tracking** - Captures why generation stopped
- **Comprehensive error tracking** - Automatic error reporting to monitoring API
- **LLM-specific types** - `LLMMetadata`, `LLMProvider`, `LLMWrapperConfig`
- **Enhanced monitoring payload** - `EnhancedMonitorPayload` with LLM metadata
- **Optional Control API** - Now disabled by default, opt-in when needed
- **Debug logging** - Improved logging throughout provider wrappers
- **Examples directory** - Working code examples:
  - `examples/basic-openai.ts` - Basic integration
  - `examples/with-control-api.ts` - Control API usage
- **Comprehensive documentation**:
  - `MIGRATION.md` - Migration guide from v1.x
  - `README-V2.md` - New README with examples
  - `REFACTOR-SUMMARY.md` - Technical summary of changes

### Changed

- **BREAKING:** Minimum Node.js version is now 18.0.0
- **BREAKING:** Removed browser support (Node.js only)
- **BREAKING:** New initialization pattern (`new OlakaiSDK()` vs `initClient()`)
- **BREAKING:** Control API disabled by default (was always enabled)
- **Simplified `client.ts`** - Removed browser online/offline detection
- **Updated `tsconfig.json`** - Removed DOM library (Node.js only)
- **Enhanced `types.ts`** - Added LLM-specific type definitions
- **Updated `package.json`** - Added Node.js engine requirement
- **Refactored index.ts** - New exports with clear deprecation markers

### Deprecated

- `initClient()` - Use `new OlakaiSDK().init()` instead
- `olakai()` - Use `OlakaiSDK.wrap()` instead
- `olakaiReport()` - Use `OlakaiSDK.wrap()` instead
- `olakaiMonitor()` - Use `OlakaiSDK.wrap()` instead
- `olakaiConfig()` - Use `new OlakaiSDK()` instead

**⚠️ These deprecated APIs will be removed in v3.0.0**

### Removed

- **Browser support** - Online/offline detection removed
- **DOM library** - No longer needed for Node.js-only
- **Batching logic** - Never fully implemented, removed dead code
- **Dual runtime patterns** - `typeof window` checks removed

### Fixed

- Fixed TypeScript strict mode compliance
- Fixed circular dependency issues
- Improved error handling in monitoring flow
- Better handling of Control API failures (allows execution to continue)

### Security

- API keys are now automatically captured for cost tracking
- Sanitization still available via `sanitize` option
- Control API provides content blocking when enabled

### Performance

- Removed browser-specific code reduces bundle size
- Simplified Node.js-only patterns improve performance
- Proxy-based wrapping has minimal overhead

## [1.4.5] - Previous Release

### Features (v1.x)

- Event-based tracking with `olakai()`
- Direct reporting with `olakaiReport()`
- Function wrapping with `olakaiMonitor()`
- Browser and Node.js support
- Control API (always enabled)
- Monitoring API
- Retry logic with exponential backoff
- Custom dimensions and metrics
- Data sanitization

---

## Migration Path

### From 1.x to 2.0

See [MIGRATION.md](./MIGRATION.md) for detailed instructions.

**Quick summary:**

```typescript
// Before (1.x)
await initClient('key', 'https://app.olakai.ai');
olakai("event", "ai_activity", {
  prompt, response, tokens, task
});

// After (2.0)
const olakai = new OlakaiSDK({
  apiKey: 'key',
  monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt'
});
await olakai.init();

const trackedOpenAI = olakai.wrap(openai, {
  provider: 'openai',
  defaultContext: { task }
});

await trackedOpenAI.chat.completions.create({...});
// Everything auto-tracked!
```

## Versioning Policy

- **Major version (X.0.0)** - Breaking changes
- **Minor version (1.X.0)** - New features, backwards compatible
- **Patch version (1.0.X)** - Bug fixes, backwards compatible

## Support

- **v2.x** - Active development and support
- **v1.x** - Deprecated, legacy APIs maintained until v3.0
- **v0.x** - No longer supported

## Links

- [GitHub Repository](https://github.com/ailocalnode/olakai-sdk-typescript)
- [Issue Tracker](https://github.com/ailocalnode/olakai-sdk-typescript/issues)
- [Migration Guide](./MIGRATION.md)
- [Documentation](./README-V2.md)
