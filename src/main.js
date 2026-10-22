const { app, BrowserWindow, WebContentsView, Menu, shell, ipcMain } = require("electron");
const path = require("node:path");
const { PROVIDERS, makeSendScript, makeReadScript } = require("./ai-automation");
const { isSafeBrowserURL, normalizeNavigationInput } = require("./browser-utils");

let mainWindow = null;
let activeTabId = "dashboard";
let nextTabNumber = 1;
const tabs = new Map();
const providerTabs = new Map();
const CHROME_HEIGHT = 134;

function notify(message, detail = {}) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("ai:progress", { message, ...detail });
  }
}

function dashboardTab() {
  return { id: "dashboard", title: "AI Council", url: "", kind: "dashboard", isDashboard: true,
    loading: false, canGoBack: false, canGoForward: false };
}

function serializeBrowserState() {
  const list = [dashboardTab()];
  for (const tab of tabs.values()) {
    if (tab.view.webContents.isDestroyed()) continue;
    const wc = tab.view.webContents;
    list.push({
      id: tab.id,
      title: tab.title || "New Tab",
      url: wc.getURL() || tab.url || "",
      kind: tab.providerId ? "ai" : "web",
      providerId: tab.providerId || null,
      isDashboard: false,
      loading: Boolean(tab.loading),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward()
    });
  }
  return { activeTabId, tabs: list };
}

function publishBrowserState() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("browser:state", serializeBrowserState());
  }
}

function resizeBrowserViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const size = mainWindow.getContentSize();
  const bounds = {
    x: 0,
    y: CHROME_HEIGHT,
    width: Math.max(0, size[0]),
    height: Math.max(0, size[1] - CHROME_HEIGHT)
  };
  for (const tab of tabs.values()) {
    try { tab.view.setBounds(bounds); } catch {}
  }
}

function activateTab(tabId) {
  if (tabId !== "dashboard" && !tabs.has(tabId)) {
    return { ok: false, message: "That browser tab is no longer open." };
  }
  activeTabId = tabId;
  for (const tab of tabs.values()) {
    try { tab.view.setVisible(tab.id === activeTabId); } catch {}
  }
  resizeBrowserViews();
  publishBrowserState();
  if (tabId !== "dashboard") {
    const tab = tabs.get(tabId);
    if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.focus();
  }
  return { ok: true, activeTabId };
}

function getTabForProvider(providerId) {
  const tabId = providerTabs.get(providerId);
  if (!tabId) return null;
  const tab = tabs.get(tabId);
  if (!tab || tab.view.webContents.isDestroyed()) {
    providerTabs.delete(providerId);
    return null;
  }
  return tab;
}

function getActiveWebTab() {
  return activeTabId === "dashboard" ? null : tabs.get(activeTabId) || null;
}

function orderedTabIds() {
  return ["dashboard", ...Array.from(tabs.keys())];
}

function activateRelativeTab(direction) {
  const ids = orderedTabIds();
  const index = Math.max(0, ids.indexOf(activeTabId));
  const next = (index + direction + ids.length) % ids.length;
  activateTab(ids[next]);
}

function attachBrowserContextMenu(webContents) {
  webContents.on("context-menu", (_event, params) => {
    const items = [];
    if (params.selectionText) items.push({ label: "Copy", click: () => webContents.copy() });
    if (params.isEditable) {
      items.push(
        { label: "Cut", click: () => webContents.cut() },
        { label: "Paste", click: () => webContents.paste() }
      );
    }
    if (items.length) items.push({ type: "separator" });
    items.push(
      { label: "Select all", click: () => webContents.selectAll() },
      { label: "Reload", click: () => webContents.reload() }
    );
    Menu.buildFromTemplate(items).popup({ window: mainWindow || undefined });
  });
}

function attachBrowserShortcuts(webContents, tabIdGetter) {
  webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "").toLowerCase();
    const command = process.platform === "darwin" ? input.meta : input.control;
    if (command && key === "l") {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("browser:focus-address");
      }
    } else if (command && key === "t") {
      event.preventDefault();
      createBrowserTab("https://duckduckgo.com/", { title: "New Tab", activate: true });
    } else if (command && key === "w") {
      const id = tabIdGetter();
      if (id && id !== "dashboard") {
        event.preventDefault();
        closeBrowserTab(id);
      }
    } else if (command && key === "r") {
      const id = tabIdGetter();
      const tab = id && tabs.get(id);
      if (tab) {
        event.preventDefault();
        tab.view.webContents.reload();
      }
    } else if (input.alt && key === "arrowleft") {
      const id = tabIdGetter();
      const tab = id && tabs.get(id);
      if (tab && tab.view.webContents.navigationHistory.canGoBack()) {
        event.preventDefault();
        tab.view.webContents.navigationHistory.goBack();
      }
    } else if (input.alt && key === "arrowright") {
      const id = tabIdGetter();
      const tab = id && tabs.get(id);
      if (tab && tab.view.webContents.navigationHistory.canGoForward()) {
        event.preventDefault();
        tab.view.webContents.navigationHistory.goForward();
      }
    } else if (command && key === "tab") {
      event.preventDefault();
      activateRelativeTab(input.shift ? -1 : 1);
    }
  });
}

function createBrowserTab(startURL, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("The main browser window is not ready.");
  const allowAboutBlank = options.allowAboutBlank === true && startURL === "about:blank";
  const normalized = allowAboutBlank ? { ok: true, url: "about:blank" } : normalizeNavigationInput(startURL);
  if (!normalized.ok) throw new Error(normalized.message);

  const id = "tab-" + nextTabNumber++;
  const providerId = options.providerId || null;
  const provider = providerId ? PROVIDERS[providerId] : null;
  if (providerId && !provider) throw new Error("Unsupported AI provider.");
  const partition = options.partition || (provider ? provider.partition : "persist:sudhit-browser-" + id);

  const view = new WebContentsView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });
  const tab = {
    id,
    title: options.title || (provider ? provider.label : "New Tab"),
    url: normalized.url,
    providerId,
    view,
    loading: true
  };
  tabs.set(id, tab);
  if (providerId) providerTabs.set(providerId, id);

  mainWindow.contentView.addChildView(view);
  view.setVisible(false);
  resizeBrowserViews();

  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (url !== "about:blank" && !isSafeBrowserURL(url)) return { action: "deny" };
    try {
      const popup = createBrowserTab(url, {
        title: "New Tab",
        activate: true,
        deferLoad: true,
        allowAboutBlank: url === "about:blank",
        partition
      });
      return { action: "allow", createWindow: () => popup.view.webContents };
    } catch (error) {
      notify("Could not open new tab: " + error.message);
      return { action: "deny" };
    }
  });
  wc.on("will-navigate", (event, url) => {
    if (!isSafeBrowserURL(url) && url !== "about:blank") event.preventDefault();
  });
  wc.on("did-start-loading", () => {
    tab.loading = true;
    publishBrowserState();
  });
  wc.on("did-stop-loading", () => {
    tab.loading = false;
    tab.url = wc.getURL() || tab.url;
    publishBrowserState();
  });
  wc.on("page-title-updated", (_event, title) => {
    tab.title = String(title || (provider ? provider.label : "New Tab")).slice(0, 120);
    publishBrowserState();
  });
  wc.on("did-navigate", (_event, url) => {
    tab.url = url;
    publishBrowserState();
  });
  wc.on("did-navigate-in-page", (_event, url) => {
    tab.url = url;
    publishBrowserState();
  });
  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    tab.loading = false;
    tab.url = validatedURL || tab.url;
    tab.title = "Page could not load";
    notify("Could not load page: " + errorDescription);
    publishBrowserState();
  });
  wc.on("render-process-gone", (_event, details) => {
    tab.loading = false;
    tab.title = "Page crashed — reload";
    notify("A website tab renderer stopped (" + (details.reason || "unknown reason") + "). Use Reload to try again.");
    publishBrowserState();
  });
  wc.on("destroyed", () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(view);
    } catch {}
    if (providerId && providerTabs.get(providerId) === id) providerTabs.delete(providerId);
    tabs.delete(id);
    if (activeTabId === id) activeTabId = "dashboard";
    publishBrowserState();
  });
  attachBrowserContextMenu(wc);
  attachBrowserShortcuts(wc, () => id);

  if (options.activate !== false) activateTab(id);
  if (!options.deferLoad) {
    wc.loadURL(normalized.url).catch(error => {
      tab.loading = false;
      tab.title = "Page could not load";
      notify("Could not load page: " + error.message);
      publishBrowserState();
    });
  }
  publishBrowserState();
  return tab;
}

function closeBrowserTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return { ok: false, message: "That browser tab is already closed." };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.contentView.removeChildView(tab.view); } catch {}
  }
  tabs.delete(tabId);
  if (tab.providerId && providerTabs.get(tab.providerId) === tabId) providerTabs.delete(tab.providerId);
  if (activeTabId === tabId) {
    const remaining = orderedTabIds();
    activeTabId = remaining[Math.max(0, remaining.length - 1)] || "dashboard";
  }
  try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
  activateTab(activeTabId);
  return { ok: true };
}

function navigateActiveTab(input) {
  const normalized = normalizeNavigationInput(input);
  if (!normalized.ok) return normalized;
  let tab = getActiveWebTab();
  if (!tab) {
    tab = createBrowserTab(normalized.url, { title: "New Tab", activate: true });
  } else {
    tab.loading = true;
    tab.view.webContents.loadURL(normalized.url).catch(error => {
      tab.loading = false;
      notify("Navigation failed: " + error.message);
      publishBrowserState();
    });
  }
  return { ok: true, url: normalized.url, tabId: tab.id };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 900, minWidth: 360, minHeight: 520,
    title: "SUDHIT Browser", backgroundColor: "#10131c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeBrowserURL(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-finish-load", () => publishBrowserState());
  attachBrowserShortcuts(mainWindow.webContents, () => activeTabId);
  mainWindow.on("resize", resizeBrowserViews);
  mainWindow.on("maximize", resizeBrowserViews);
  mainWindow.on("unmaximize", resizeBrowserViews);
  mainWindow.on("closed", () => {
    for (const tab of tabs.values()) {
      try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
    }
    tabs.clear();
    providerTabs.clear();
    mainWindow = null;
    activeTabId = "dashboard";
  });
}

function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error("Unsupported AI provider.");
  return provider;
}

async function openProvider(id) {
  const provider = getProvider(id);
  const existing = getTabForProvider(id);
  if (existing) {
    activateTab(existing.id);
    return { ok: true, alreadyOpen: true, label: provider.label, url: existing.view.webContents.getURL() || provider.url, tabId: existing.id };
  }
  try {
    const tab = createBrowserTab(provider.url, { title: provider.label, providerId: id, activate: true });
    return { ok: true, label: provider.label, url: provider.url, tabId: tab.id };
  } catch (error) {
    return { ok: false, label: provider.label, message: "Could not open site: " + error.message };
  }
}

async function sendPrompt(id, prompt) {
  const provider = getProvider(id);
  const tab = getTabForProvider(id);
  if (!tab) return { ok: false, id, label: provider.label, message: "Open this AI website in a browser tab first, then sign in if required." };
  const wc = tab.view.webContents;
  if (wc.isDestroyed()) return { ok: false, id, label: provider.label, message: "The AI website tab is closed." };
  if (wc.isLoading()) return { ok: false, id, label: provider.label, message: "The AI website is still loading. Try again in a moment." };

  try {
    let baseline = "";
    try {
      const before = await wc.executeJavaScript(makeReadScript(id, ""));
      baseline = (before.text || "").trim();
    } catch {}
    const result = await wc.executeJavaScript(makeSendScript(id, prompt));
    if (result.ok) {
      tab.submittedPrompt = prompt;
      tab.baselineReply = baseline;
    }
    return { ...result, id, label: provider.label };
  } catch (error) {
    return { ok: false, id, label: provider.label, message: "Could not submit prompt: " + error.message };
  }
}

async function readReply(id) {
  const provider = getProvider(id);
  const tab = getTabForProvider(id);
  if (!tab) return { ok: false, id, label: provider.label, message: "AI website tab is closed." };
  const wc = tab.view.webContents;
  if (wc.isDestroyed()) return { ok: false, id, label: provider.label, message: "AI website tab is closed." };

  try {
    const result = await wc.executeJavaScript(makeReadScript(id, tab.submittedPrompt || ""));
    let text = (result.text || "").trim();
    const baseline = (tab.baselineReply || "").trim();
    if (baseline && text === baseline) {
      text = "";
    } else if (baseline && text.includes(baseline)) {
      text = text.replace(baseline, "").trim();
      const currentPrompt = (tab.submittedPrompt || "").trim();
      if (currentPrompt) text = text.replace(currentPrompt, "").trim();
    }
    return {
      ...result, ok: Boolean(text), id, label: provider.label, text,
      message: text ? "Reply detected." : "No new reply detected yet. The AI may still be responding, or the website layout may have changed."
    };
  } catch (error) {
    return { ok: false, id, label: provider.label, message: "Could not inspect reply: " + error.message };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

ipcMain.handle("browser:get-state", async () => serializeBrowserState());
ipcMain.handle("browser:activate", async (_event, id) => activateTab(id));
ipcMain.handle("browser:new-tab", async (_event, input) => {
  const normalized = input ? normalizeNavigationInput(input) : { ok: true, url: "https://duckduckgo.com/" };
  if (!normalized.ok) return normalized;
  try {
    const tab = createBrowserTab(normalized.url, { title: "New Tab", activate: true });
    return { ok: true, tabId: tab.id, url: normalized.url };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});
ipcMain.handle("browser:close-tab", async (_event, id) => closeBrowserTab(id));
ipcMain.handle("browser:navigate", async (_event, input) => navigateActiveTab(input));
ipcMain.handle("browser:back", async () => {
  const tab = getActiveWebTab();
  if (!tab) return { ok: false, message: "Open a website tab first." };
  if (!tab.view.webContents.navigationHistory.canGoBack()) return { ok: false, message: "There is no previous page." };
  tab.view.webContents.navigationHistory.goBack();
  return { ok: true };
});
ipcMain.handle("browser:forward", async () => {
  const tab = getActiveWebTab();
  if (!tab) return { ok: false, message: "Open a website tab first." };
  if (!tab.view.webContents.navigationHistory.canGoForward()) return { ok: false, message: "There is no next page." };
  tab.view.webContents.navigationHistory.goForward();
  return { ok: true };
});
ipcMain.handle("browser:reload", async () => {
  const tab = getActiveWebTab();
  if (!tab) return { ok: false, message: "Open a website tab first." };
  tab.view.webContents.reload();
  return { ok: true };
});
ipcMain.handle("browser:copy", async () => {
  const tab = getActiveWebTab();
  if (!tab) return { ok: false, message: "Open a website tab first." };
  tab.view.webContents.focus();
  tab.view.webContents.copy();
  return { ok: true };
});
ipcMain.handle("browser:paste", async () => {
  const tab = getActiveWebTab();
  if (!tab) return { ok: false, message: "Open a website tab first." };
  tab.view.webContents.focus();
  tab.view.webContents.paste();
  return { ok: true };
});
ipcMain.handle("ai:list-providers", async () =>
  Object.values(PROVIDERS).map(provider => {
    const tab = getTabForProvider(provider.id);
    return { id: provider.id, label: provider.label, url: tab ? tab.view.webContents.getURL() || provider.url : provider.url, opened: Boolean(tab) };
  })
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
  const ready = submitted.filter(item => item.ok).map(item => item.id);
  const finished = new Map();
  const lastTexts = new Map();
  const stableCounts = new Map();
  const started = Date.now();
  const timeoutMs = 150000;
  const intervalMs = 2500;

  for (const item of submitted.filter(result => !result.ok)) {
    finished.set(item.id, { ...item, reply: "", status: "not-sent" });
  }
  if (!ready.length) {
    return { ok: false, message: "No prompts were submitted. Open the AI website tabs and make sure you're signed in.", results: submitted.map(item => ({ ...item, reply: "", status: "not-sent" })) };
  }

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
      finished.set(id, {
        ...latest, reply: latest.text || "",
        status: latest.text ? "timeout-partial" : "timeout",
        message: latest.text
          ? "Timed out waiting for a stable final response; the latest text was collected as a partial reply."
          : "Timed out without detecting a reply. You can press Collect reply manually."
      });
    }
  }
  const results = ids.map(id => finished.get(id) || {
    id, label: PROVIDERS[id].label, ok: false, reply: "", status: "error", message: "No result returned."
  });
  return { ok: results.some(item => item.reply), message: "Council round finished. Review the collected responses before using them.", results };
});

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
