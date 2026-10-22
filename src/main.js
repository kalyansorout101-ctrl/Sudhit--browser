const { app, BrowserWindow, WebContentsView, session, ipcMain } = require("electron");
const path = require("node:path");
const { PROVIDERS, makeSendScript, makeReadScript } = require("./ai-automation");
const {
  MAX_TASK_CHARS, MAX_COUNCIL_PROMPT_CHARS, isHttpUrl, normalizeBrowserUrl,
  isNewResponse, normalizeProviderIds
} = require("./council-rules");

const BROWSER_CHROME_HEIGHT = 118;
const MAX_TABS = 24;
const COUNCIL_TAB_ID = "council";

let mainWindow = null;
let activeTabId = COUNCIL_TAB_ID;
let nextTabNumber = 1;
let currentRun = null;
const tabs = new Map();
const providerTabIds = new Map();
const submittedPrompts = new Map();
const baselineReplies = new Map();
const configuredSessions = new WeakSet();

function notify(message, detail = {}) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("ai:progress", { message, ...detail });
  }
}

function safeWebUrl(value) {
  return isHttpUrl(value);
}

function normalizeTitle(value, fallback) {
  const title = String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
  return title || fallback;
}

function getBrowserState() {
  const browserTabs = [];
  for (const tab of tabs.values()) {
    if (tab.view.webContents.isDestroyed()) continue;
    browserTabs.push({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      providerId: tab.providerId || null,
      canGoBack: tab.view.webContents.navigationHistory.canGoBack(),
      canGoForward: tab.view.webContents.navigationHistory.canGoForward(),
      loading: tab.view.webContents.isLoading()
    });
  }
  return { activeTabId, tabs: browserTabs, councilActive: activeTabId === COUNCIL_TAB_ID };
}

function notifyBrowserChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:changed", getBrowserState());
  }
}

function layoutBrowserViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getContentBounds();
  for (const tab of tabs.values()) {
    if (tab.view.webContents.isDestroyed()) continue;
    if (tab.id === activeTabId) {
      tab.view.setBounds({
        x: 0,
        y: BROWSER_CHROME_HEIGHT,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height - BROWSER_CHROME_HEIGHT)
      });
      tab.view.setVisible(true);
    } else {
      tab.view.setBounds({
        x: 0,
        y: BROWSER_CHROME_HEIGHT,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height - BROWSER_CHROME_HEIGHT)
      });
      tab.view.setVisible(false);
    }
  }
}

function activateTab(id) {
  if (id !== COUNCIL_TAB_ID && !tabs.has(id)) {
    return { ok: false, message: "That browser tab is no longer open." };
  }
  activeTabId = id;
  layoutBrowserViews();
  const tab = tabs.get(id);
  if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus();
  notifyBrowserChanged();
  return { ok: true, activeTabId };
}

function ensureSessionSafe(partition) {
  const ses = session.fromPartition(partition);
  if (!configuredSessions.has(ses)) {
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    configuredSessions.add(ses);
  }
  return ses;
}

function attachTabHandlers(tab) {
  const contents = tab.view.webContents;
  contents.on("did-navigate", (_event, url) => {
    tab.url = url;
    notifyBrowserChanged();
  });
  contents.on("did-navigate-in-page", (_event, url) => {
    tab.url = url;
    notifyBrowserChanged();
  });
  contents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    tab.title = normalizeTitle(title, tab.providerId ? PROVIDERS[tab.providerId].label : "New Tab");
    notifyBrowserChanged();
  });
  contents.on("did-start-loading", () => notifyBrowserChanged());
  contents.on("did-stop-loading", () => notifyBrowserChanged());
  contents.on("will-navigate", (event, url) => {
    if (!safeWebUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (safeWebUrl(url) && tabs.size < MAX_TABS) {
      setImmediate(() => {
        void createTab({
          title: "New Tab",
          url,
          partition: tab.partition,
          providerId: null,
          activate: true
        });
      });
    } else {
      notify("Blocked an unsupported link or tab limit was reached.");
    }
    return { action: "deny" };
  });
  contents.on("render-process-gone", (_event, details) => {
    notify("A website tab stopped unexpectedly (" + details.reason + "). Reload the tab or reopen it.");
  });
}

async function createTab({ id, title, url, partition = "persist:sudhit-browser", providerId = null, activate = true }) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("The browser window is not available.");
  if (tabs.size >= MAX_TABS) throw new Error("Tab limit reached (maximum " + MAX_TABS + "). Close a tab first.");
  if (!safeWebUrl(url)) throw new Error("Only valid HTTP or HTTPS websites can be opened.");
  if (providerId && providerTabIds.has(providerId)) {
    const existing = tabs.get(providerTabIds.get(providerId));
    if (existing && !existing.view.webContents.isDestroyed()) {
      if (activate) activateTab(existing.id);
      return existing;
    }
  }

  ensureSessionSafe(partition);
  const tabId = id || "tab-" + nextTabNumber++;
  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  const tab = {
    id: tabId,
    title: normalizeTitle(title, "New Tab"),
    url,
    partition,
    providerId,
    view
  };
  tabs.set(tabId, tab);
  if (providerId) providerTabIds.set(providerId, tabId);
  mainWindow.contentView.addChildView(view);
  attachTabHandlers(tab);
  layoutBrowserViews();
  if (activate) activateTab(tabId);
  notifyBrowserChanged();

  try {
    await view.webContents.loadURL(url);
    tab.url = view.webContents.getURL() || url;
    notifyBrowserChanged();
  } catch (error) {
    notify("Could not load " + url + ": " + error.message, { providerId });
    return { ...tab, loadError: error.message };
  }
  return tab;
}

function removeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return { ok: false, message: "That tab is already closed." };
  if (tab.providerId && providerTabIds.get(tab.providerId) === id) {
    providerTabIds.delete(tab.providerId);
  }
  submittedPrompts.delete(tab.providerId || id);
  baselineReplies.delete(tab.providerId || id);
  tabs.delete(id);
  try {
    mainWindow?.contentView?.removeChildView(tab.view);
  } catch {}
  try {
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  } catch {}
  if (activeTabId === id) activeTabId = COUNCIL_TAB_ID;
  layoutBrowserViews();
  notifyBrowserChanged();
  return { ok: true, activeTabId };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 360,
    minHeight: 600,
    title: "SUDHIT Browser",
    backgroundColor: "#10131c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const dashboardUrl = require("node:url").pathToFileURL(path.join(__dirname, "index.html")).href;
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.split(/[?#]/, 1)[0] !== dashboardUrl) event.preventDefault();
  });
  mainWindow.on("resize", layoutBrowserViews);
  mainWindow.on("closed", () => {
    for (const tab of tabs.values()) {
      try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
    }
    tabs.clear();
    providerTabIds.clear();
    mainWindow = null;
    activeTabId = COUNCIL_TAB_ID;
  });
}

function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error("Unsupported AI provider.");
  return provider;
}

async function ensureProviderTab(id, activate = true) {
  const provider = getProvider(id);
  const existingId = providerTabIds.get(id);
  const existing = existingId ? tabs.get(existingId) : null;
  if (existing && !existing.view.webContents.isDestroyed()) {
    if (activate) activateTab(existing.id);
    return { tab: existing, alreadyOpen: true };
  }
  const tab = await createTab({
    id: id,
    title: provider.label,
    url: provider.url,
    partition: provider.partition,
    providerId: id,
    activate
  });
  if (tab.loadError) {
    return { tab, error: tab.loadError, alreadyOpen: false };
  }
  return { tab, alreadyOpen: false };
}

async function openProvider(id) {
  const provider = getProvider(id);
  try {
    const opened = await ensureProviderTab(id, true);
    if (opened.error) return { ok: false, id, label: provider.label, message: "Could not load website: " + opened.error };
    return {
      ok: true,
      id,
      tabId: opened.tab.id,
      alreadyOpen: opened.alreadyOpen,
      label: provider.label,
      url: opened.tab.url
    };
  } catch (error) {
    return { ok: false, id, label: provider.label, message: error.message };
  }
}

async function openAllProviders() {
  const results = [];
  for (const id of Object.keys(PROVIDERS)) results.push(await openProvider(id));
  if (providerTabIds.has("chatgpt")) activateTab("chatgpt");
  return { results };
}

async function navigateTab(id, input) {
  const tab = tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return { ok: false, message: "Open a browser tab first." };
  let url;
  try { url = normalizeBrowserUrl(input); }
  catch (error) { return { ok: false, message: error.message }; }
  if (tab.providerId && new URL(url).origin !== new URL(PROVIDERS[tab.providerId].url).origin) {
    const previousId = tab.id;
    providerTabIds.delete(tab.providerId);
    submittedPrompts.delete(tab.providerId);
    baselineReplies.delete(tab.providerId);
    tabs.delete(previousId);
    tab.providerId = null;
    tab.id = "tab-" + nextTabNumber++;
    tabs.set(tab.id, tab);
    activeTabId = tab.id;
  }
  try {
    await tab.view.webContents.loadURL(url);
    tab.url = tab.view.webContents.getURL() || url;
    tab.title = normalizeTitle(tab.title, new URL(url).hostname);
    notifyBrowserChanged();
    return { ok: true, url: tab.url };
  } catch (error) {
    return { ok: false, message: "Navigation failed: " + error.message };
  }
}

async function sendPrompt(id, prompt) {
  const provider = getProvider(id);
  const tabId = providerTabIds.get(id);
  const tab = tabId ? tabs.get(tabId) : null;
  if (!tab || tab.view.webContents.isDestroyed()) {
    return { ok: false, id, label: provider.label, message: "Open this AI tab first, then sign in if required." };
  }
  const contents = tab.view.webContents;
  if (contents.isLoading()) {
    return { ok: false, id, label: provider.label, message: "The AI website is still loading. Try again in a moment." };
  }
  try {
    let baseline = { text: "", messageCount: 0 };
    try {
      const before = await contents.executeJavaScript(makeReadScript(id, ""));
      baseline = {
        text: String(before.text || "").trim(),
        messageCount: Number.isInteger(before.messageCount) ? before.messageCount : 0,
        source: before.source || ""
      };
    } catch {}
    const result = await contents.executeJavaScript(makeSendScript(id, prompt));
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
  const tabId = providerTabIds.get(id);
  const tab = tabId ? tabs.get(tabId) : null;
  if (!tab || tab.view.webContents.isDestroyed()) {
    return { ok: false, id, label: provider.label, message: "AI website tab is closed." };
  }
  try {
    const result = await tab.view.webContents.executeJavaScript(makeReadScript(id, submittedPrompts.get(id) || ""));
    const baseline = baselineReplies.get(id) || { text: "", messageCount: 0 };
    const detectedText = String(result.text || "").trim();
    const fresh = isNewResponse(
      { text: detectedText, messageCount: Number.isInteger(result.messageCount) ? result.messageCount : 0 },
      baseline
    );
    const text = fresh ? detectedText : "";
    return {
      ok: Boolean(text),
      id,
      label: provider.label,
      ...result,
      text,
      isNew: fresh,
      message: text
        ? "New reply detected."
        : result.isGenerating
          ? "The AI is still responding."
          : "No new reply detected yet. The website may still be responding, or its layout may have changed."
    };
  } catch (error) {
    return { ok: false, id, label: provider.label, message: "Could not inspect reply: " + error.message };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPoll(run, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (run.cancelled) return false;
    await delay(200);
    if (run.paused) continue;
  }
  return !run.cancelled;
}

function pauseRun() {
  if (!currentRun || currentRun.cancelled) return { ok: false, message: "No active council run." };
  if (!currentRun.paused) {
    currentRun.paused = true;
    currentRun.pausedAt = Date.now();
  }
  notify("Council run paused.");
  return { ok: true, paused: true };
}

function resumeRun() {
  if (!currentRun || currentRun.cancelled) return { ok: false, message: "No active council run." };
  if (currentRun.paused) {
    currentRun.deadline += Date.now() - currentRun.pausedAt;
    currentRun.paused = false;
    currentRun.pausedAt = 0;
  }
  notify("Council run resumed.");
  return { ok: true, paused: false };
}

function stopRun() {
  if (!currentRun) return { ok: false, message: "No active council run." };
  currentRun.cancelled = true;
  currentRun.paused = false;
  notify("Stopping the council run…");
  return { ok: true, stopped: true };
}

async function runCouncil(data) {
  if (currentRun && !currentRun.finished) {
    return { ok: false, message: "A council run is already active. Stop it before starting another.", results: [] };
  }
  const prompt = typeof data?.prompt === "string" ? data.prompt.trim() : "";
  const ids = normalizeProviderIds(data?.ids, Object.keys(PROVIDERS));
  if (!prompt) return { ok: false, message: "Enter a task first.", results: [] };
  if (prompt.length > MAX_COUNCIL_PROMPT_CHARS) return { ok: false, message: "The task plus shared context is too long (maximum " + MAX_COUNCIL_PROMPT_CHARS + " characters).", results: [] };
  if (!ids.length) return { ok: false, message: "Select at least one AI provider.", results: [] };

  const run = {
    id: ++nextTabNumber,
    cancelled: false,
    paused: false,
    pausedAt: 0,
    deadline: Date.now() + 150000,
    finished: false
  };
  currentRun = run;
  notify("Submitting the same task and previous-round context to " + ids.length + " AI tab(s)…");
  const submitted = await Promise.all(ids.map((id) => sendPrompt(id, prompt)));
  const ready = submitted.filter((item) => item.ok).map((item) => item.id);
  const finished = new Map();
  const lastTexts = new Map();
  const stableCounts = new Map();

  for (const item of submitted.filter((result) => !result.ok)) {
    finished.set(item.id, { ...item, reply: "", status: "not-sent" });
  }
  if (!ready.length) {
    run.finished = true;
    return {
      ok: false,
      message: "No prompts were submitted. Open the AI website tabs and sign in yourself if required.",
      results: submitted.map((item) => ({ ...item, reply: "", status: "not-sent" }))
    };
  }

  while (finished.size < ids.length && Date.now() < run.deadline && !run.cancelled) {
    if (run.paused) {
      await delay(200);
      continue;
    }
    const waiting = ready.filter((id) => !finished.has(id));
    const snapshots = await Promise.all(waiting.map(readReply));
    for (const item of snapshots) {
      const text = String(item.text || "").trim();
      if (text && text === lastTexts.get(item.id)) stableCounts.set(item.id, (stableCounts.get(item.id) || 0) + 1);
      else stableCounts.set(item.id, 0);
      if (text) lastTexts.set(item.id, text);
      if (text.length >= 2 && !item.isGenerating && (stableCounts.get(item.id) || 0) >= 2) {
        finished.set(item.id, { ...item, reply: text, status: "collected" });
        notify(item.label + " reply collected.", { providerId: item.id, status: "collected" });
      } else {
        notify(
          run.paused ? "Council run paused." : "Waiting for " + item.label + "…",
          { providerId: item.id, status: item.isGenerating ? "generating" : "waiting" }
        );
      }
    }
    if (finished.size < ids.length && !run.cancelled) await waitForPoll(run, 2400);
  }

  if (run.cancelled) {
    for (const id of ready) {
      if (!finished.has(id)) {
        const latest = await readReply(id);
        finished.set(id, { ...latest, reply: latest.text || "", status: "cancelled", message: "The council run was stopped. Any text collected is partial and needs review." });
      }
    }
  } else {
    for (const id of ready) {
      if (finished.has(id)) continue;
      const latest = await readReply(id);
      finished.set(id, {
        ...latest,
        reply: latest.text || "",
        status: latest.text ? "timeout-partial" : "timeout",
        message: latest.text
          ? "Timed out waiting for a stable final response; the latest text is partial and needs review."
          : "Timed out without detecting a new reply. Use Collect latest or paste the response manually."
      });
    }
  }

  const results = ids.map((id) => finished.get(id) || {
    id,
    label: PROVIDERS[id].label,
    ok: false,
    reply: "",
    status: "error",
    message: "No result returned."
  });
  run.finished = true;
  if (currentRun === run) currentRun = null;
  return {
    ok: results.some((item) => item.reply),
    cancelled: run.cancelled,
    message: run.cancelled
      ? "Council run stopped. Review any collected text; stopped results may be partial."
      : "Council round finished. Review each response and record the approval gates manually.",
    results
  };
}

function assertMainSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error("Blocked an IPC request from an untrusted renderer.");
  }
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertMainSender(event);
    return handler(...args);
  });
}

handle("ai:list-providers", async () => Object.values(PROVIDERS).map((provider) => ({
  id: provider.id,
  label: provider.label,
  url: provider.url,
  opened: Boolean(providerTabIds.get(provider.id) && tabs.has(providerTabIds.get(provider.id)))
})));
handle("ai:open", async (id) => openProvider(id));
handle("ai:open-all", async () => openAllProviders());
handle("ai:send", async (data) => {
  if (!data || typeof data.prompt !== "string" || !data.prompt.trim()) return { ok: false, message: "Enter a task first." };
  if (data.prompt.length > MAX_COUNCIL_PROMPT_CHARS) return { ok: false, message: "The prompt is too long." };
  try { return await sendPrompt(data.id, data.prompt.trim()); }
  catch (error) { return { ok: false, message: error.message }; }
});
handle("ai:collect", async (id) => readReply(id));
handle("ai:run-council", async (data) => runCouncil(data));
handle("ai:pause-council", async () => pauseRun());
handle("ai:resume-council", async () => resumeRun());
handle("ai:stop-council", async () => stopRun());

handle("browser:get-state", async () => getBrowserState());
handle("browser:activate-tab", async (id) => activateTab(id));
handle("browser:new-tab", async (input) => {
  if (tabs.size >= MAX_TABS) return { ok: false, message: "Tab limit reached (maximum " + MAX_TABS + ")." };
  let url;
  try { url = normalizeBrowserUrl(input || "https://www.google.com/"); }
  catch (error) { return { ok: false, message: error.message }; }
  try {
    const tab = await createTab({ title: new URL(url).hostname, url, activate: true });
    return { ok: !tab.loadError, tabId: tab.id, url: tab.url, message: tab.loadError || "New browser tab opened." };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
handle("browser:navigate", async (data) => navigateTab(data?.id, data?.url));
handle("browser:back", async (id) => {
  const tab = tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return { ok: false, message: "Open a browser tab first." };
  if (tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
  return { ok: true };
});
handle("browser:forward", async (id) => {
  const tab = tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return { ok: false, message: "Open a browser tab first." };
  if (tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
  return { ok: true };
});
handle("browser:reload", async (id) => {
  const tab = tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return { ok: false, message: "Open a browser tab first." };
  tab.view.webContents.reload();
  return { ok: true };
});
handle("browser:close-tab", async (id) => removeTab(id));

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
