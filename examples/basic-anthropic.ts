/**
 * Basic Anthropic Integration Example
 *
 * This example shows how to use the Olakai SDK
 * to automatically track Anthropic (Claude) API calls.
 */

import { OlakaiSDK } from "@olakai/sdk";
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  // 1. Initialize Olakai SDK
  const olakai = new OlakaiSDK({
    apiKey: process.env.OLAKAI_API_KEY || "your-olakai-api-key",
    monitoringEndpoint: "https://app.olakai.ai/api/monitoring/prompt",
    // Optional: Enable Control API for content blocking
    enableControl: false,
    debug: true, // Enable debug logging
  });

  await olakai.init();
  console.log("Olakai SDK initialized");

  // 2. Create Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key",
  });

  // 3. Wrap the Anthropic client with Olakai tracking
  const trackedAnthropic = olakai.wrap(anthropic, {
    provider: "anthropic",
    defaultContext: {
      userEmail: "demo-user@example.com",
      task: "Code Generation",
      subTask: "Generate TypeScript function",
      chatId: "demo-session-123",
    },
  });

  console.log("Anthropic client wrapped with Olakai tracking");

  // 4. Use the wrapped client normally
  // All metadata is automatically captured and sent to Olakai!
  console.log("\nMaking Anthropic API call...\n");

  // Example 1: Basic messages.create call
  const response = await trackedAnthropic.messages.create({
    model: "claude-3-sonnet-20240229",
    max_tokens: 500,
    system: "You are a helpful TypeScript expert.",
    messages: [
      {
        role: "user",
        content: "Write a function that calculates the fibonacci sequence.",
      },
    ],
    temperature: 0.7,
  });

  // Extract text from response content blocks
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  console.log("Response:", text);

  console.log("\nAPI call completed!");
  console.log("Automatically tracked:");
  console.log(`   - Model: ${response.model}`);
  console.log(`   - Input tokens: ${response.usage.input_tokens}`);
  console.log(`   - Output tokens: ${response.usage.output_tokens}`);
  console.log(`   - Stop reason: ${response.stop_reason}`);
  console.log("   - API key: [captured for cost tracking]");
  console.log("   - Request timing: [auto-calculated]");
  console.log("   - All parameters (temperature, max_tokens, etc.)");

  // Example 2: Streaming response
  console.log("\n--- Streaming Example ---\n");

  const stream = await trackedAnthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: "What is TypeScript in one sentence?",
      },
    ],
    stream: true,
  });

  process.stdout.write("Streaming response: ");

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
    }
  }

  console.log("\n");
  console.log("Streaming complete! All chunks were tracked automatically.");

  console.log("\nAll data was sent to Olakai automatically!");
}

main().catch(console.error);
