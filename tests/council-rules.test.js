const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_TASK_CHARS, MAX_ENTRIES, normalizeBrowserUrl, isHttpUrl,
  isNewResponse, normalizeProviderIds, sanitizeEntries, canStartNextRound, canApproveFinal
} = require("../src/council-rules");

test("browser URL normalization accepts web addresses and turns plain text into a search", () => {
  assert.equal(normalizeBrowserUrl("example.com").startsWith("https://example.com/"), true);
  assert.equal(normalizeBrowserUrl("find local weather").startsWith("https://www.google.com/search?q="), true);
  assert.equal(isHttpUrl("https://example.com"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.throws(() => normalizeBrowserUrl("javascript:alert(1)"), /Only HTTP and HTTPS/);
  assert.throws(() => normalizeBrowserUrl("https://user:secret@example.com"), /must not contain/);
});

test("new reply detection rejects the baseline but recognizes a changed or additional answer", () => {
  const baseline = { text: "Old reply", messageCount: 2 };
  assert.equal(isNewResponse({ text: "Old reply", messageCount: 2 }, baseline), false);
  assert.equal(isNewResponse({ text: "New reply", messageCount: 2 }, baseline), true);
  assert.equal(isNewResponse({ text: "Same words", messageCount: 3 }, { text: "Same words", messageCount: 2 }), true);
  assert.equal(isNewResponse({ text: "", messageCount: 3 }, baseline), false);
});

test("provider IDs are unique and limited to the allowlist", () => {
  assert.deepEqual(normalizeProviderIds(["grok", "grok", "unknown", "chatgpt"], ["chatgpt", "claude", "grok"]), ["grok", "chatgpt"]);
});

test("saved reply data is sanitized and bounded", () => {
  const data = sanitizeEntries([{ agent: "Claude", round: 4, reply: " OK ", partial: false }, null, { reply: "" }]);
  assert.equal(data.length, 1);
  assert.equal(data[0].reply, "OK");
  assert.equal(sanitizeEntries(Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => ({ agent: "A", round: 1, reply: "R" + i }))).length, MAX_ENTRIES);
  assert.ok(MAX_TASK_CHARS > 0);
});

test("next round and final approval require both council gates and replies", () => {
  const entries = [
    { agent: "ChatGPT", round: 1, reply: "review", partial: false },
    { agent: "Grok", round: 1, reply: "code review", partial: false }
  ];
  const approvals = { director: "approved", leadCoder: "approved" };
  assert.equal(canStartNextRound({ round: 1, approvals, entries }), true);
  assert.equal(canApproveFinal({ round: 1, approvals, entries }), true);
  assert.equal(canStartNextRound({ round: 1, approvals: { director: "approved" }, entries }), false);
  assert.equal(canStartNextRound({ round: 1, approvals, entries: entries.filter(x => x.agent !== "Grok") }), false);
});
