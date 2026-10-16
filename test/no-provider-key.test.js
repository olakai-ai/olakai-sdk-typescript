// Sentinel test: the SDK must never send the provider API key to Olakai.
// Runs against the built dist (npm test builds first).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { OlakaiSDK } = require("../dist");

const SENTINEL = "sk-test-SENTINEL";
const bodies = [];
globalThis.fetch = async (_url, init) => {
  bodies.push(String(init.body));
  return new Response(JSON.stringify({ totalRequests: 1, successCount: 1 }), {
    status: 200,
  });
};

async function waitForBody() {
  for (let i = 0; i < 100 && bodies.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(bodies.length > 0, "expected a monitoring call");
}

// Every place the providers used to look for the key.
const keyFields = {
  apiKey: SENTINEL,
  _apiKey: SENTINEL,
  auth: SENTINEL,
  authToken: SENTINEL,
  _options: { apiKey: SENTINEL },
};

const cases = {
  openai: {
    ...keyFields,
    chat: {
      completions: {
        create: async () => ({
          model: "gpt-x",
          choices: [{ message: { content: "hi" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      },
    },
    call: (c) => c.chat.completions.create({ model: "gpt-x", messages: [{ role: "user", content: "q" }] }),
  },
  anthropic: {
    ...keyFields,
    messages: {
      create: async () => ({
        model: "claude-x",
        content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    },
    call: (c) => c.messages.create({ model: "claude-x", messages: [{ role: "user", content: "q" }] }),
  },
  google: {
    ...keyFields,
    models: {
      generateContent: async () => ({
        text: "hi",
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }),
    },
    call: (c) => c.models.generateContent({ model: "gemini-x", contents: "q" }),
  },
};

for (const [provider, client] of Object.entries(cases)) {
  test(`${provider}: payload never contains the provider key`, async () => {
    bodies.length = 0;
    const sdk = new OlakaiSDK({ apiKey: "olakai-key", retries: 1 });
    await sdk.init();
    const wrapped = sdk.wrap(client, { provider });
    await client.call(wrapped);
    await waitForBody();
    for (const body of bodies) {
      assert.ok(!body.includes("SENTINEL"), `provider key leaked: ${body}`);
    }
  });
}

test("anthropic streaming: payload never contains the provider key", async () => {
  bodies.length = 0;
  const client = {
    ...keyFields,
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } };
          yield { type: "message_stop", message: { model: "claude-x", content: [{ type: "text", text: "hi" }] } };
        },
      }),
    },
  };
  const sdk = new OlakaiSDK({ apiKey: "olakai-key", retries: 1 });
  await sdk.init();
  const wrapped = sdk.wrap(client, { provider: "anthropic" });
  for await (const _ of wrapped.messages.stream({ model: "claude-x", messages: [{ role: "user", content: "q" }] })) {
    // drain
  }
  await waitForBody();
  for (const body of bodies) {
    assert.ok(!body.includes("SENTINEL"), `provider key leaked: ${body}`);
  }
});

test("withoutApiKey strips apiKey and keeps other fields", () => {
  const { withoutApiKey } = require("../dist/src/utils");
  const out = withoutApiKey({ provider: "openai", model: "m", apiKey: SENTINEL });
  assert.deepEqual(out, { provider: "openai", model: "m" });
  assert.ok(!JSON.stringify(out).includes("SENTINEL"));
});
