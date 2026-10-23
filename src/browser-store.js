"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_BOOKMARKS = 500;
const MAX_HISTORY = 1000;
const MAX_DOWNLOADS = 200;

function cleanText(value, limit = 200, fallback = "") {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return (text || fallback).slice(0, limit);
}

function cleanHttpUrl(value) {
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href.slice(0, 8192);
  } catch {
    return "";
  }
}

function timestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Date.now();
}

class BrowserStore {
  constructor(directory, options = {}) {
    this.directory = directory;
    this.filePath = path.join(directory, "browser-data.json");
    this.fs = options.fs || fs;
    this.now = options.now || (() => Date.now());
    this.data = { version: 1, bookmarks: [], history: [], downloads: [] };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
      const bookmarks = Array.isArray(raw.bookmarks) ? raw.bookmarks : [];
      const history = Array.isArray(raw.history) ? raw.history : [];
      const downloads = Array.isArray(raw.downloads) ? raw.downloads : [];
      this.data.bookmarks = bookmarks.map((item) => ({
        id: cleanText(item.id, 80) || randomUUID(),
        title: cleanText(item.title, 180, "Saved page"),
        url: cleanHttpUrl(item.url),
        createdAt: timestamp(item.createdAt)
      })).filter((item) => item.url).slice(0, MAX_BOOKMARKS);
      this.data.history = history.map((item) => ({
        id: cleanText(item.id, 80) || randomUUID(),
        title: cleanText(item.title, 180, "Visited page"),
        url: cleanHttpUrl(item.url),
        visitedAt: timestamp(item.visitedAt)
      })).filter((item) => item.url).slice(0, MAX_HISTORY);
      this.data.downloads = downloads.map((item) => ({
        id: cleanText(item.id, 80) || randomUUID(),
        filename: cleanText(item.filename, 240, "download"),
        url: cleanHttpUrl(item.url),
        filePath: cleanText(item.filePath, 2048),
        status: ["choosing-location", "in-progress", "completed", "cancelled", "interrupted"].includes(item.status) ? item.status : "interrupted",
        receivedBytes: Math.max(0, Number(item.receivedBytes) || 0),
        totalBytes: Math.max(0, Number(item.totalBytes) || 0),
        progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
        startedAt: timestamp(item.startedAt),
        finishedAt: Number(item.finishedAt) > 0 ? Number(item.finishedAt) : null
      })).slice(0, MAX_DOWNLOADS);
      this.data.version = 1;
    } catch {
      this.data = { version: 1, bookmarks: [], history: [], downloads: [] };
    }
  }

  persist() {
    this.fs.mkdirSync(this.directory, { recursive: true });
    const temporary = this.filePath + ".tmp-" + process.pid;
    this.fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { encoding: "utf8", mode: 0o600 });
    this.fs.renameSync(temporary, this.filePath);
  }

  getHomeState() {
    return {
      bookmarks: this.data.bookmarks.slice(0, 100).map((item) => ({ ...item })),
      history: this.data.history.slice(0, 50).map((item) => ({ ...item })),
      downloads: this.data.downloads.slice(0, 20).map(({ id, filename, url, status, receivedBytes, totalBytes, progress, startedAt, finishedAt }) => ({
        id, filename, url, status, receivedBytes, totalBytes, progress, startedAt, finishedAt
      }))
    };
  }

  findBookmark(url) {
    const normalized = cleanHttpUrl(url);
    return normalized ? this.data.bookmarks.find((item) => item.url === normalized) || null : null;
  }

  addBookmark(url, title) {
    const normalized = cleanHttpUrl(url);
    if (!normalized) throw new Error("Only HTTP or HTTPS pages can be bookmarked.");
    const existing = this.findBookmark(normalized);
    if (existing) {
      existing.title = cleanText(title, 180, existing.title || "Saved page");
      this.persist();
      return { bookmark: { ...existing }, existed: true };
    }
    const bookmark = {
      id: randomUUID(),
      title: cleanText(title, 180, new URL(normalized).hostname),
      url: normalized,
      createdAt: this.now()
    };
    this.data.bookmarks.unshift(bookmark);
    this.data.bookmarks = this.data.bookmarks.slice(0, MAX_BOOKMARKS);
    this.persist();
    return { bookmark: { ...bookmark }, existed: false };
  }

  removeBookmark(idOrUrl) {
    const value = String(idOrUrl || "");
    const previousLength = this.data.bookmarks.length;
    this.data.bookmarks = this.data.bookmarks.filter((item) => item.id !== value && item.url !== value);
    const removed = this.data.bookmarks.length !== previousLength;
    if (removed) this.persist();
    return removed;
  }

  recordVisit(url, title) {
    const normalized = cleanHttpUrl(url);
    if (!normalized) return null;
    const now = this.now();
    const mostRecent = this.data.history[0];
    if (mostRecent && mostRecent.url === normalized && now - mostRecent.visitedAt < 10000) {
      mostRecent.title = cleanText(title, 180, mostRecent.title || new URL(normalized).hostname);
      mostRecent.visitedAt = now;
      this.persist();
      return { ...mostRecent };
    }
    const entry = {
      id: randomUUID(),
      title: cleanText(title, 180, new URL(normalized).hostname),
      url: normalized,
      visitedAt: now
    };
    this.data.history.unshift(entry);
    this.data.history = this.data.history.slice(0, MAX_HISTORY);
    this.persist();
    return { ...entry };
  }

  clearHistory() {
    this.data.history = [];
    this.persist();
  }

  upsertDownload(input) {
    const id = cleanText(input?.id, 80);
    if (!id) throw new Error("A download ID is required.");
    const existing = this.data.downloads.find((item) => item.id === id);
    const url = cleanHttpUrl(input.url) || existing?.url || "";
    const item = {
      id,
      filename: cleanText(input.filename, 240, existing?.filename || "download"),
      url,
      filePath: cleanText(input.filePath, 2048, existing?.filePath || ""),
      status: ["choosing-location", "in-progress", "completed", "cancelled", "interrupted"].includes(input.status) ? input.status : (existing?.status || "interrupted"),
      receivedBytes: Math.max(0, Number(input.receivedBytes ?? existing?.receivedBytes) || 0),
      totalBytes: Math.max(0, Number(input.totalBytes ?? existing?.totalBytes) || 0),
      progress: Math.max(0, Math.min(100, Number(input.progress ?? existing?.progress) || 0)),
      startedAt: timestamp(input.startedAt ?? existing?.startedAt ?? this.now()),
      finishedAt: Number(input.finishedAt ?? existing?.finishedAt) > 0 ? Number(input.finishedAt ?? existing?.finishedAt) : null
    };
    this.data.downloads = [item, ...this.data.downloads.filter((row) => row.id !== id)].slice(0, MAX_DOWNLOADS);
    this.persist();
    return { ...item };
  }

  getDownload(id) {
    const item = this.data.downloads.find((download) => download.id === String(id));
    return item ? { ...item } : null;
  }
}

module.exports = { BrowserStore, cleanHttpUrl, MAX_BOOKMARKS, MAX_HISTORY, MAX_DOWNLOADS };
