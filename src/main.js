const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("node:path");
const { PROVIDERS, makeSendScript, makeReadScript } = require("./ai-automation");

let mainWindow = null;
const providerWindows = new Map();
const submittedPrompts = new Map();
const baselineReplies = new Map();

function notify(message, detail = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ai:progress", { message, ...detail });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 900, minWidth: 360, minHeight: 600,
    title: "SUDHIT Browser", backgroundColor: "#10131c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error("Unsupported AI provider.");
  return provider;
}
async function openProvider(id) {
  const provider = getProvider(id);
  let win = providerWindows.get(id);
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return { ok: true, alreadyOpen: true, label: provider.label, url: provider.url };
  }
  win = new BrowserWindow({
    width: 1050, height: 850, minWidth: 640, minHeight: 500,
    title: "SUDHIT · " + provider.label,
    backgroundColor: "#10131c",
    webPreferences: {
      partition: provider.partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  providerWindows.set(id, win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) return { action: "allow" };
    return { action: "deny" };
  });
  win.on("closed", () => {
    if (providerWindows.get(id) === win) providerWindows.delete(id);
  });
  try {
    await win.loadURL(provider.url);
    win.show();
    return { ok: true, label: provider.label, url: provider.url };
  } catch (error) {
    if (!win.isDestroyed()) win.show();
    return { ok: false, label: provider.label, message: "Could not load site: " + error.message };
  }
}
async function sendPrompt(id, prompt) {
  const provider = getProvider(id);
  const win = providerWindows.get(id);
  if (!win || win.isDestroyed()) return { ok: false, id, label: provider.label, message: "Open this AI website first, then sign in if required." };
  if (win.webContents.isLoading()) return { ok: false, id, label: provider.label, message: "The AI website is still loading. Try again in a moment." };
  try {
    let baseline = "";
    try {
      const before = await win.webContents.executeJavaScript(makeReadScript(id, submittedPrompts.get(id) || ""));
      baseline = (before.text || "").trim();
    } catch {}
    const result = await win.webContents.executeJavaScript(makeSendScript(id, prompt));
    if (result.ok) {
      submittedPrompts.set(id, prompt);
      baselineReplies.set(id, baseline);
    }
    return { ...result, id, label: provider.label };
  } catch (error) {
    return { ok: false, id, label: provider.label, message: "Could not submit prompt: " + error.message };
  }
}
async function readReply(id) {
  const provider = getProvider(id);
  const win = providerWindows.get(id);
  if (!win || win.isDestroyed()) return { ok: false, id, label: provider.label, message: "AI website window is closed." };
  try {
    const result = await win.webContents.executeJavaScript(makeReadScript(id, submittedPrompts.get(id) || ""));
    let text = (result.text || "").trim();
    const baseline = (baselineReplies.get(id) || "").trim();
    if (baseline && text === baseline) {
      text = "";
    } else if (baseline && text.includes(baseline)) {
      text = text.replace(baseline, "").trim();
      const currentPrompt = (submittedPrompts.get(id) || "").trim();
      if (currentPrompt) text = text.replace(currentPrompt, "").trim();
    }
    return { ok: Boolean(text), id, label: provider.label, ...result, text,
      message: text ? "Reply detected." : "No new reply detected yet. The AI may still be responding, or the website layout may have changed." };
  } catch (error) {
    return { ok: false, id, label: provider.label, message: "Could not inspect reply: " + error.message };
  }
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

ipcMain.handle("ai:list-providers", async () =>
  Object.values(PROVIDERS).map(p => ({ id: p.id, label: p.label, url: p.url, opened: Boolean(providerWindows.get(p.id) && !providerWindows.get(p.id).isDestroyed()) }))
);
ipcMain.handle("ai:open", async (_event, id) => openProvider(id));
ipcMain.handle("ai:open-all", async () => {
  const results = await Promise.all(Object.keys(PROVIDERS).map(openProvider));
  return { results };
});
ipcMain.handle("ai:send", async (_event, data) => {
  if (!data || typeof data.prompt !== "string" || !data.prompt.trim()) return { ok: false, message: "Enter a task first." };
  if (data.prompt.length > 30000) return { ok: false, message: "The task is too long (maximum 30,000 characters)." };
  return sendPrompt(data.id, data.prompt.trim());
});
ipcMain.handle("ai:collect", async (_event, id) => readReply(id));
ipcMain.handle("ai:run-council", async (_event, data) => {
  const prompt = typeof data?.prompt === "string" ? data.prompt.trim() : "";
  const ids = Array.isArray(data?.ids) ? [...new Set(data.ids.filter(id => Object.hasOwn(PROVIDERS, id)))] : Object.keys(PROVIDERS);
  if (!prompt) return { ok: false, message: "Enter a task first.", results: [] };
  if (prompt.length > 30000) return { ok: false, message: "The task is too long (maximum 30,000 characters).", results: [] };
  if (!ids.length) return { ok: false, message: "Select at least one AI provider.", results: [] };

  notify("Submitting the task to " + ids.length + " AI website(s)…");
  const submitted = await Promise.all(ids.map(id => sendPrompt(id, prompt)));
  const ready = submitted.filter(x => x.ok).map(x => x.id);
  const finished = new Map();
  const lastTexts = new Map();
  const stableCounts = new Map();
  const started = Date.now();
  const timeoutMs = 150000;
  const intervalMs = 2500;

  for (const item of submitted.filter(x => !x.ok)) {
    finished.set(item.id, { ...item, reply: "", status: "not-sent" });
  }
  if (!ready.length) return { ok: false, message: "No prompts were submitted. Open the AI websites and make sure you're signed in.", results: submitted.map(x => ({...x, reply:"", status:"not-sent"})) };

  while (finished.size < ids.length && Date.now() - started < timeoutMs) {
    await delay(intervalMs);
    const pending = ready.filter(id => !finished.has(id));
    const snapshots = await Promise.all(pending.map(readReply));
    for (const item of snapshots) {
      const text = (item.text || "").trim();
      if (text && text === lastTexts.get(item.id)) stableCounts.set(item.id, (stableCounts.get(item.id) || 0) + 1);
      else stableCounts.set(item.id, 0);
      if (text) lastTexts.set(item.id, text);
      if (text.length >= 20 && !item.isGenerating && (stableCounts.get(item.id) || 0) >= 2) {
        finished.set(item.id, { ...item, reply: text, status: "collected" });
        notify(item.label + " reply collected.", { providerId: item.id, status: "collected" });
      } else {
        notify("Waiting for " + item.label + "…", { providerId: item.id, status: item.isGenerating ? "generating" : "waiting" });
      }
    }
  }
  for (const id of ready) {
    if (!finished.has(id)) {
      const latest = await readReply(id);
      finished.set(id, { ...latest, reply: latest.text || "", status: latest.text ? "timeout-partial" : "timeout",
        message: latest.text ? "Timed out waiting for a stable final response; the latest text was collected as a partial reply." : "Timed out without detecting a reply. You can press Collect reply manually." });
    }
  }
  const results = ids.map(id => finished.get(id) || { id, label: PROVIDERS[id].label, ok: false, reply: "", status: "error", message: "No result returned." });
  return { ok: results.some(x => x.reply), message: "Council round finished. Review the collected responses before using them.", results };
});

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
