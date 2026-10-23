"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BrowserStore, cleanHttpUrl } = require("../src/browser-store");

function withTempStore(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sudhit-browser-store-"));
  try {
    let value = 1000;
    run(new BrowserStore(dir, { now: () => ++value }), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("BrowserStore persists and reloads bookmarks", () => withTempStore((store, dir) => {
  const result = store.addBookmark("https://example.com/path", "Example");
  assert.equal(result.existed, false);
  assert.equal(store.addBookmark("https://example.com/path", "Updated").existed, true);
  const again = new BrowserStore(dir);
  assert.equal(again.getHomeState().bookmarks.length, 1);
  assert.equal(again.getHomeState().bookmarks[0].title, "Updated");
}));

test("BrowserStore rejects unsafe bookmark URLs and removes bookmarks", () => withTempStore((store) => {
  assert.throws(() => store.addBookmark("file:///etc/passwd", "bad"));
  assert.throws(() => store.addBookmark("https://user:pass@example.com", "bad"));
  const { bookmark } = store.addBookmark("https://example.com", "Example");
  assert.equal(store.removeBookmark(bookmark.id), true);
  assert.equal(store.getHomeState().bookmarks.length, 0);
}));

test("history de-duplicates rapid redirects and can be cleared", () => withTempStore((store) => {
  store.recordVisit("https://example.com", "Example");
  store.recordVisit("https://example.com", "Example home");
  assert.equal(store.getHomeState().history.length, 1);
  assert.equal(store.getHomeState().history[0].title, "Example home");
  store.clearHistory();
  assert.equal(store.getHomeState().history.length, 0);
}));

test("download state persists progress and final status", () => withTempStore((store) => {
  store.upsertDownload({ id: "d1", filename: "file.zip", url: "https://example.com/file.zip", status: "in-progress", receivedBytes: 50, totalBytes: 100, progress: 50 });
  assert.equal(store.getDownload("d1").progress, 50);
  store.upsertDownload({ id: "d1", status: "completed", progress: 100, filePath: "/tmp/file.zip" });
  assert.equal(store.getHomeState().downloads[0].status, "completed");
}));

test("cleanHttpUrl accepts only credential-free HTTP and HTTPS URLs", () => {
  assert.equal(cleanHttpUrl("https://example.com"), "https://example.com/");
  assert.equal(cleanHttpUrl("javascript:alert(1)"), "");
  assert.equal(cleanHttpUrl("file:///tmp/file"), "");
  assert.equal(cleanHttpUrl("https://user:pass@example.com"), "");
});
