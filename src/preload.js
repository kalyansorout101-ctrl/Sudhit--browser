"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sudhitAI", Object.freeze({
  listProviders: () => ipcRenderer.invoke("ai:list-providers"),
  open: (providerId) => ipcRenderer.invoke("ai:open", providerId),
  openAll: () => ipcRenderer.invoke("ai:open-all"),
  send: (providerId, prompt) => ipcRenderer.invoke("ai:send", { id: providerId, prompt }),
  collect: (providerId) => ipcRenderer.invoke("ai:collect", providerId),
  runCouncil: (prompt, providerIds) => ipcRenderer.invoke("ai:run-council", { prompt, ids: providerIds }),
  getBrowserState: () => ipcRenderer.invoke("browser:get-state"),
  activateTab: (tabId) => ipcRenderer.invoke("browser:activate", tabId),
  newTab: (input) => ipcRenderer.invoke("browser:new-tab", input),
  closeTab: (tabId) => ipcRenderer.invoke("browser:close-tab", tabId),
  navigate: (input) => ipcRenderer.invoke("browser:navigate", input),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  copy: () => ipcRenderer.invoke("browser:copy"),
  paste: () => ipcRenderer.invoke("browser:paste"),
  onBrowserState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  },
  onFocusAddress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("browser:focus-address", listener);
    return () => ipcRenderer.removeListener("browser:focus-address", listener);
  },
  onProgress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, detail) => callback(detail);
    ipcRenderer.on("ai:progress", listener);
    return () => ipcRenderer.removeListener("ai:progress", listener);
  }
}));
