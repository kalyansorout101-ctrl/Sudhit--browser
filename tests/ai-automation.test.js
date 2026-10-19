const test = require("node:test");
const assert = require("node:assert/strict");
const { PROVIDERS, makeSendScript, makeReadScript } = require("../src/ai-automation");

test("supported AI sites use HTTPS and separate persistent profiles", () => {
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ["chatgpt", "claude", "grok"]);
  const partitions = new Set();
  for (const provider of Object.values(PROVIDERS)) {
    assert.equal(new URL(provider.url).protocol, "https:");
    assert.ok(provider.partition.startsWith("persist:"));
    assert.ok(!partitions.has(provider.partition), "each provider should have a separate session partition");
    partitions.add(provider.partition);
  }
});

test("generated prompt submission scripts parse for each supported provider", () => {
  const unusualPrompt = "Find the bug in `x` and this string: '); globalThis.pwned = true; //";
  for (const id of Object.keys(PROVIDERS)) {
    const script = makeSendScript(id, unusualPrompt);
    assert.doesNotThrow(() => new Function("return " + script), id + " send script should parse");
    assert.ok(script.includes(JSON.stringify(unusualPrompt)));
  }
});

test("generated response collection scripts parse and include provider-specific selectors", () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    const script = makeReadScript(id, "test prompt");
    assert.doesNotThrow(() => new Function("return " + script), id + " read script should parse");
    assert.ok(script.includes(provider.id));
  }
});
