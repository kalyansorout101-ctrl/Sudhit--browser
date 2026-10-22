const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const main = read("src/main.js");
const preload = read("src/preload.js");
const renderer = read("src/renderer.js");
const html = read("src/index.html");

test("renderer references only existing static HTML IDs", () => {
  const htmlIds = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const idSet = new Set(htmlIds);
  assert.equal(htmlIds.length, idSet.size, "HTML id attributes should be unique");
  const referencedIds = [...renderer.matchAll(/document\.getElementById\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  const missing = [...new Set(referencedIds)].filter((id) => !idSet.has(id));
  assert.deepEqual(missing, [], "every statically referenced renderer ID must exist in the HTML");
});

test("external browser content uses isolated, sandboxed WebContentsViews", () => {
  assert.match(main, /new WebContentsView\(/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setPermissionRequestHandler\([^\n]*callback\(false\)/);
  assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/);
});

test("renderer IPC is allowlisted and rejects foreign renderer senders", () => {
  assert.match(main, /event\.sender !== mainWindow\.webContents/);
  assert.match(main, /ipcMain\.handle\(channel/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("sudhitAI"/);
  assert.doesNotMatch(preload, /exposeInMainWorld\(["']electron["']/);
  assert.match(preload, /pauseCouncil/);
  assert.match(preload, /resumeCouncil/);
  assert.match(preload, /stopCouncil/);
});

test("browser state render preserves the New Tab button before replacing tabs", () => {
  const preserveButton = renderer.indexOf('const newTabButton = document.getElementById("newBrowserTab")');
  const replaceChildren = renderer.indexOf("browserTabsEl.replaceChildren()", preserveButton);
  const appendButton = renderer.indexOf("browserTabsEl.appendChild(newTabButton)", replaceChildren);
  assert.ok(preserveButton >= 0 && replaceChildren > preserveButton && appendButton > replaceChildren);
});

test("integrated browser and council approval requirements are present", () => {
  assert.match(main, /MAX_TABS\s*=\s*24/);
  assert.match(main, /normalizeBrowserUrl/);
  assert.match(main, /browser:new-tab/);
  assert.match(main, /ai:pause-council/);
  assert.match(main, /ai:resume-council/);
  assert.match(main, /ai:stop-council/);
  assert.match(renderer, /directorGateState/);
  assert.match(renderer, /leadCoderGateState/);
  assert.match(renderer, /approveFinal/);
  assert.match(renderer, /PREVIOUS SHARED REPLIES/);
  assert.doesNotMatch(main, /width:\s*0,\s*height:\s*0/, "inactive views should be hidden without invalid bounds");
});
