"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sudhitAI", Object.freeze({
  listProviders: () => ipcRenderer.invoke("ai:list-providers"),
  open: (providerId) => ipcRenderer.invoke("ai:open", providerId),
  openAll: () => ipcRenderer.invoke("ai:open-all"),
  send: (providerId, prompt) => ipcRenderer.invoke("ai:send", { id: providerId, prompt }),
  collect: (providerId) => ipcRenderer.invoke("ai:collect", providerId),
  runCouncil: (prompt, providerIds) => ipcRenderer.invoke("ai:run-council", { prompt, ids: providerIds }),
  onProgress: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, detail) => callback(detail);
    ipcRenderer.on("ai:progress", listener);
    return () => ipcRenderer.removeListener("ai:progress", listener);
  }
}));
