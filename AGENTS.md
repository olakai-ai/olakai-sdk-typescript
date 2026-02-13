# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Olakai SDK** - a TypeScript SDK for tracking AI interactions with monitoring and content control capabilities. The SDK provides three main APIs:

1. **Event-based API** (`olakai()`) - Fire-and-forget tracking via simple event calls
2. **Direct reporting** (`olakaiReport()`) - Awaitable direct reporting without function wrapping
3. **Function wrapping** (`olakaiMonitor()`) - Automatic monitoring with control checks and error reporting

The SDK sends data to two Olakai API endpoints:
- **Monitoring API** (`/api/monitoring/prompt`) - Records AI interactions for analytics
- **Control API** (`/api/control/prompt`) - Pre-execution validation to block sensitive content or unauthorized users

## Build and Development Commands

```bash
# Build the SDK (compiles TypeScript to dist/)
npm run build

# Clean build artifacts
npm run clean

# Full rebuild
npm run build

# Prepare for publishing (automatically runs build)
npm run prepublishOnly
```

**Note**: This project currently has no tests (`npm test` exits with error). When adding tests, update the test script in package.json.

## Architecture

### Entry Point (`index.ts`)
Re-exports all public APIs from `src/`:
- Helper functions: `olakaiMonitor`, `olakaiReport`, `olakai`, `olakaiConfig`
- Types: All TypeScript types from `src/types.ts`
- Utilities: `DEFAULT_SANITIZE_PATTERNS`
- Exceptions: `OlakaiBlockedError`, `OlakaiSDKError`
- Client: `initClient`

### Core Modules

**`src/client.ts`** - HTTP client and configuration management
- `initClient()`: Initializes SDK with API key, endpoints, retries, timeout, debug mode
- `getConfig()`: Returns current SDK configuration (throws if not initialized)
- `sendToAPI()`: Sends payloads to monitoring or control endpoints with retry logic
- Online/offline detection for browser environments
- Exponential backoff retry logic (1s, 2s, 4s, 8s up to 30s max delay)

**`src/helpers.ts`** - Simplified public API
- `olakaiConfig()`: Event-style config initialization
- `olakai()`: Fire-and-forget event tracking (always takes "event", "ai_activity" params)
- `olakaiReport()`: Direct async reporting without function wrapping
- `olakaiMonitor()`: Wrapper function that auto-monitors function execution

**`src/monitor.ts`** - Function monitoring implementation
- `monitor()`: Core monitoring logic with dual signatures (curried or direct)
- `shouldAllowCall()`: Calls Control API to determine if execution should proceed
- `resolveIdentifiers()`: Resolves dynamic chatId/email from options or functions
- `makeMonitoringCall()`: Sends monitoring data after successful execution
- `reportError()`: Reports function errors to monitoring API
- Supports both sync and async function monitoring (always returns Promise)

**`src/types.ts`** - TypeScript type definitions
- `OlakaiEventParams`: Event-based API parameters (includes customData for account-specific values)
- `MonitorPayload`: Payload sent to monitoring API
- `ControlPayload`: Payload sent to control API
- `MonitorOptions<TArgs, TResult>`: Configuration for monitored functions
- `SDKConfig`: Global SDK configuration
- Response types: `MonitoringAPIResponse`, `ControlAPIResponse`
- `ErrorCode` enum: SUCCESS (201), PARTIAL_SUCCESS (207), FAILED (500), etc.

**`src/utils.ts`** - Utilities
- `DEFAULT_SANITIZE_PATTERNS`: Regex patterns for redacting emails, credit cards, SSNs, passwords, tokens
- `ConfigBuilder`: Fluent builder pattern for SDK configuration
- `sanitizeData()`: Applies sanitization patterns to strings
- `toJsonValue()`: Converts any value to JsonValue (handles primitives, arrays, objects)
- `olakaiLogger()`: Internal logging (respects debug/verbose config)
- `sleep()`: Async delay utility used in retry backoff

**`src/exceptions.ts`** - Custom error classes
- `OlakaiSDKError`: Base error class
- `OlakaiBlockedError`: Thrown when Control API blocks execution (includes details about detected sensitivity and persona authorization)
- `APIKeyMissingError`, `URLConfigurationError`, `ConfigNotInitializedError`, `HTTPError`, `CircuitBreakerOpenError`

## Key Implementation Details

### Monitoring Flow
1. User calls `olakaiMonitor(fn, options)` to wrap a function
2. On execution:
   - Control API is called via `shouldAllowCall()` to check if execution is permitted
   - If blocked: throws `OlakaiBlockedError` and sends blocked=true to monitoring API
   - If allowed: executes original function
   - On success: sends prompt/response/metrics to monitoring API asynchronously
   - On error: sends error details to monitoring API, then re-throws original error

### Control vs Monitoring API
- **Control API**: Called BEFORE function execution to validate and potentially block
- **Monitoring API**: Called AFTER execution (or blocking) to record the interaction
- Both share similar payload structure but serve different purposes

### Configuration Pattern
The SDK uses a singleton config initialized via `initClient()` or `olakaiConfig()`. The config includes:
- API key (required)
- Endpoints for monitoring and control (required)
- Retries (default: 4)
- Timeout (default: 30000ms)
- Debug/verbose flags

### Type Safety
- The SDK uses strict TypeScript with `strict: true` in tsconfig.json`
- Monitoring options are generic: `MonitorOptions<TArgs, TResult>` where TArgs and TResult are inferred from the wrapped function
- Helper functions use automatic type inference (no manual type parameters needed)

### Browser and Node.js Support
- Targets ES2022 with CommonJS module output
- Includes DOM lib for browser compatibility
- Online/offline detection for browser environments (falls back to "always online" for Node.js)

## Publishing

The package is published to npm as `@olakai/sdk`. The publishing process:
1. `prepublishOnly` script automatically runs `npm run build`
2. Only `dist/` folder is published (specified in package.json `files` field)
3. TypeScript declarations are generated in `dist/` with source maps

## Important Patterns to Follow

1. **Error handling**: Always catch errors in monitoring/reporting functions and log warnings rather than breaking user's application
2. **Async patterns**: `monitor()` always returns an async function even when monitoring sync functions
3. **Fire-and-forget**: `olakai()` does not await, `olakaiReport()` can be awaited
4. **Sanitization**: Optional sanitization using `DEFAULT_SANITIZE_PATTERNS` (redacts PII, credentials)
5. **Identifiers**: `chatId` and `email` can be static strings or dynamic functions that receive function args
