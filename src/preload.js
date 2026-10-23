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
  getBrowserHomeState: () => ipcRenderer.invoke("browser:get-home-state"),
  bookmarkCurrentTab: (tabId) => ipcRenderer.invoke("browser:bookmark-current", tabId),
  removeBookmark: (idOrUrl) => ipcRenderer.invoke("browser:remove-bookmark", idOrUrl),
  openBookmark: (url) => ipcRenderer.invoke("browser:open-bookmark", url),
  clearBrowserHistory: () => ipcRenderer.invoke("browser:clear-history"),
  showBrowserHome: () => ipcRenderer.invoke("browser:show-home"),
  openDownload: (id) => ipcRenderer.invoke("browser:open-download", id),
  revealDownload: (id) => ipcRenderer.invoke("browser:reveal-download", id),
  openDownloadsFolder: () => ipcRenderer.invoke("browser:open-downloads-folder"),
  onHomeState: (callback) => subscribe("browser:home-state", callback),
  onCommand: (callback) => subscribe("browser:command", callback),
  onDownloadProgress: (callback) => subscribe("browser:download-progress", callback),
  onProgress: (callback) => subscribe("ai:progress", callback),
  onBrowserChanged: (callback) => subscribe("browser:changed", callback)
}));
