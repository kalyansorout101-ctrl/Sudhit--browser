"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, detail) => callback(detail);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("sudhitAI", Object.freeze({
  listProviders: () => ipcRenderer.invoke("ai:list-providers"),
  open: (providerId) => ipcRenderer.invoke("ai:open", providerId),
  openAll: () => ipcRenderer.invoke("ai:open-all"),
  send: (providerId, prompt) => ipcRenderer.invoke("ai:send", { id: providerId, prompt }),
  collect: (providerId) => ipcRenderer.invoke("ai:collect", providerId),
  runCouncil: (prompt, providerIds) => ipcRenderer.invoke("ai:run-council", { prompt, ids: providerIds }),
  pauseCouncil: () => ipcRenderer.invoke("ai:pause-council"),
  resumeCouncil: () => ipcRenderer.invoke("ai:resume-council"),
  stopCouncil: () => ipcRenderer.invoke("ai:stop-council"),
  getBrowserState: () => ipcRenderer.invoke("browser:get-state"),
  activateBrowserTab: (tabId) => ipcRenderer.invoke("browser:activate-tab", tabId),
  newBrowserTab: (url) => ipcRenderer.invoke("browser:new-tab", url),
  navigateBrowserTab: (tabId, url) => ipcRenderer.invoke("browser:navigate", { id: tabId, url }),
  back: (tabId) => ipcRenderer.invoke("browser:back", tabId),
  forward: (tabId) => ipcRenderer.invoke("browser:forward", tabId),
  reload: (tabId) => ipcRenderer.invoke("browser:reload", tabId),
  closeBrowserTab: (tabId) => ipcRenderer.invoke("browser:close-tab", tabId),
  onProgress: (callback) => subscribe("ai:progress", callback),
  onBrowserChanged: (callback) => subscribe("browser:changed", callback)
}));
