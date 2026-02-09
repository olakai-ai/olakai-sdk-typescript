/**
 * Basic Google Generative AI Integration Example
 *
 * This example shows how to use the Olakai SDK
 * to automatically track Google Generative AI (Gemini) API calls.
 */

import { OlakaiSDK } from "@olakai/sdk";
import { GoogleGenAI } from "@google/genai";

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

  // 2. Create Google Generative AI client
  const genAI = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY || "your-google-api-key",
  });

  // 3. Wrap the Google client with Olakai tracking
  const trackedGenAI = olakai.wrap(genAI, {
    provider: "google",
    defaultContext: {
      userEmail: "demo-user@example.com",
      task: "Code Generation",
      subTask: "Generate TypeScript function",
      chatId: "demo-session-123",
    },
  });

  console.log("Google Generative AI client wrapped with Olakai tracking");

  // 4. Use the wrapped client normally
  // All metadata is automatically captured and sent to Olakai!
  console.log("\nMaking Google Generative AI call...\n");

  // Example 1: Simple generateContent call
  const result = await trackedGenAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Write a function that calculates the fibonacci sequence in TypeScript.",
          },
        ],
      },
    ],
  });

  const text = result.text;
  console.log("Response:", text);

  console.log("\nAPI call completed!");
  console.log("Automatically tracked:");
  console.log(`   - Model: gemini-2.0-flash`);
  if (result.usageMetadata) {
    console.log(`   - Total tokens: ${result.usageMetadata.totalTokenCount}`);
    console.log(`   - Prompt tokens: ${result.usageMetadata.promptTokenCount}`);
    console.log(
      `   - Completion tokens: ${result.usageMetadata.candidatesTokenCount}`,
    );
  }
  if (result.candidates?.[0]?.finishReason) {
    console.log(`   - Finish reason: ${result.candidates[0].finishReason}`);
  }
  console.log("   - API key: [captured for cost tracking]");
  console.log("   - Request timing: [auto-calculated]");
  console.log("   - All parameters (temperature, maxOutputTokens, etc.)");
}

main().catch(console.error);
