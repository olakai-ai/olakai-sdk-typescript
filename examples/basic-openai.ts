/**
 * Basic OpenAI Integration Example
 *
 * This example shows how to use the new Olakai SDK v2.0
 * to automatically track OpenAI API calls.
 */

import { OlakaiSDK } from '@olakai/sdk';
import OpenAI from 'openai';

async function main() {
  // 1. Initialize Olakai SDK
  const olakai = new OlakaiSDK({
    apiKey: process.env.OLAKAI_API_KEY || 'your-olakai-api-key',
    monitoringEndpoint: 'https://app.olakai.ai/api/monitoring/prompt',
    // Optional: Enable Control API for content blocking
    enableControl: false,
    debug: true // Enable debug logging
  });

  await olakai.init();
  console.log('✅ Olakai SDK initialized');

  // 2. Create OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key'
  });

  // 3. Wrap the OpenAI client with Olakai tracking
  const trackedOpenAI = olakai.wrap(openai, {
    provider: 'openai',
    defaultContext: {
      userEmail: 'demo-user@example.com',
      task: 'Code Generation',
      subTask: 'Generate TypeScript function',
      chatId: 'demo-session-123'
    }
  });

  console.log('✅ OpenAI client wrapped with Olakai tracking');

  // 4. Use the wrapped client normally
  // All metadata is automatically captured and sent to Olakai!
  console.log('\n📝 Making OpenAI API call...\n');

  const response = await trackedOpenAI.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful TypeScript expert.'
      },
      {
        role: 'user',
        content: 'Write a function that calculates the fibonacci sequence.'
      }
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  const result = response.choices[0]?.message.content;
  console.log('🤖 Response:', result);

  console.log('\n✅ API call completed!');
  console.log('📊 Automatically tracked:');
  console.log(`   - Model: ${response.model}`);
  console.log(`   - Tokens: ${response.usage?.total_tokens}`);
  console.log(`   - Prompt tokens: ${response.usage?.prompt_tokens}`);
  console.log(`   - Completion tokens: ${response.usage?.completion_tokens}`);
  console.log(`   - Finish reason: ${response.choices[0]?.finish_reason}`);
  console.log('   - API key: [captured for cost tracking]');
  console.log('   - Request timing: [auto-calculated]');
  console.log('   - All parameters (temperature, max_tokens, etc.)');
  console.log('\n✨ All this data was sent to Olakai automatically!');
}

main().catch(console.error);
