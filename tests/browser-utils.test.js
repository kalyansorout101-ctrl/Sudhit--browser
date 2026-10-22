const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeBrowserURL, normalizeNavigationInput } = require("../src/browser-utils");

test("accepts HTTPS and HTTP URLs without embedded credentials", () => {
  assert.equal(isSafeBrowserURL("https://example.com/"), true);
  assert.equal(isSafeBrowserURL("http://localhost:3000/"), true);
  assert.equal(isSafeBrowserURL("https://user:password@example.com/"), false);
});

test("normalizes domain names and local development addresses", () => {
  assert.equal(normalizeNavigationInput("example.com").url, "https://example.com/");
  assert.equal(normalizeNavigationInput("localhost:3000").url, "https://localhost:3000/");
});

test("turns plain words into an encoded search URL", () => {
  const result = normalizeNavigationInput("hello browser world");
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://duckduckgo.com/?q=hello%20browser%20world");
});

test("rejects unsafe protocols and oversized input", () => {
  assert.equal(normalizeNavigationInput("javascript:alert(1)").ok, false);
  assert.equal(normalizeNavigationInput("file:///C:/secret.txt").ok, false);
  assert.equal(normalizeNavigationInput("x".repeat(4097)).ok, false);
});

test("handles empty or non-string navigation input without throwing", () => {
  assert.equal(normalizeNavigationInput("").ok, false);
  assert.equal(normalizeNavigationInput(null).ok, false);
});
