// OLA-1644: the SDK sends the provider-reported cost (OpenRouter usage.cost)
// as top-level providerCostUsd. Runs against the built dist (npm test builds first).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { OlakaiSDK } = require("../dist");

const bodies = [];
globalThis.fetch = async (_url, init) => {
  bodies.push(JSON.parse(String(init.body)));
  return new Response(JSON.stringify({ totalRequests: 1, successCount: 1 }), {
    status: 200,
  });
};

async function nextPayload() {
  for (let i = 0; i < 100 && bodies.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(bodies.length > 0, "expected a monitoring call");
  const body = bodies.shift();
  return Array.isArray(body) ? body[0] : body;
}

function openaiClient(baseURL, usage) {
  return {
    baseURL,
    chat: {
      completions: {
        create: async () => ({
          model: "m",
          choices: [{ message: { content: "hi" } }],
          usage,
        }),
      },
    },
  };
}

async function callWrapped(client) {
  bodies.length = 0;
  const sdk = new OlakaiSDK({ apiKey: "olakai-key", retries: 1 });
  await sdk.init();
  const wrapped = sdk.wrap(client, { provider: "openai" });
  await wrapped.chat.completions.create({ model: "m", messages: [{ role: "user", content: "q" }] });
  return nextPayload();
}

const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

test("openrouter: usage.cost becomes providerCostUsd and provider label is openrouter", async () => {
  const p = await callWrapped(openaiClient("https://openrouter.ai/api/v1", { ...usage, cost: 0.00042 }));
  assert.equal(p.providerCostUsd, 0.00042);
  assert.equal(p.llmMetadata.provider, "openrouter");
});

test("openai: no usage.cost means no providerCostUsd, provider stays openai", async () => {
  const p = await callWrapped(openaiClient("https://api.openai.com/v1", usage));
  assert.ok(!("providerCostUsd" in p));
  assert.equal(p.llmMetadata.provider, "openai");
});

for (const bad of [-1, "0.1", Number.NaN, 20000, null]) {
  test(`invalid usage.cost ${String(bad)} is omitted`, async () => {
    const p = await callWrapped(openaiClient(undefined, { ...usage, cost: bad }));
    assert.ok(!("providerCostUsd" in p));
  });
}

test("event(): explicit providerCostUsd is sent top-level", async () => {
  bodies.length = 0;
  const sdk = new OlakaiSDK({ apiKey: "olakai-key", retries: 1 });
  await sdk.init();
  sdk.event({ prompt: "q", response: "a", providerCostUsd: 0.01 });
  const p = await nextPayload();
  assert.equal(p.providerCostUsd, 0.01);
});
