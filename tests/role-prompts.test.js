"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLE_PROMPTS, makeRolePrompt } = require("../src/role-prompts");

test("the four council agents have distinct assigned roles", () => {
  assert.deepEqual(Object.keys(ROLE_PROMPTS).sort(), ["chatgpt", "claude", "gemini", "grok"]);
  assert.equal(ROLE_PROMPTS.chatgpt.title, "DIRECTOR");
  assert.equal(ROLE_PROMPTS.claude.title, "ASSISTANT CODER");
  assert.equal(ROLE_PROMPTS.grok.title, "LEAD CODER");
  assert.equal(ROLE_PROMPTS.gemini.title, "DESIGNER");
  assert.equal(new Set(Object.values(ROLE_PROMPTS).map(role => role.instructions)).size, 4);
});

test("each role prompt preserves the shared task and common safety rules", () => {
  const shared = "Fix the provider response collector.\nPrevious reply: keep the original files.";
  for (const id of Object.keys(ROLE_PROMPTS)) {
    const prompt = makeRolePrompt(id, shared);
    assert.ok(prompt.includes(ROLE_PROMPTS[id].title), id + " role title");
    assert.ok(prompt.includes("Fix the provider response collector."), id + " shared task");
    assert.ok(prompt.includes("Previous reply: keep the original files."), id + " prior context");
    assert.ok(prompt.includes("Do not publish, deploy, distribute installers"), id + " release safety rule");
    assert.ok(prompt.includes("working Supabase leaderboard"), id + " preservation rule");
  }
});

test("role prompt builder rejects unknown agents and empty tasks", () => {
  assert.throws(() => makeRolePrompt("unknown", "task"), /Unsupported AI council role/);
  assert.throws(() => makeRolePrompt("grok", ""), /shared council task is required/i);
  assert.throws(() => makeRolePrompt("claude", null), /shared council task is required/i);
});
