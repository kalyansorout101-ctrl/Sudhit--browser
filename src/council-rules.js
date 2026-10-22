const MAX_TASK_CHARS = 30000;
const MAX_COUNCIL_PROMPT_CHARS = 60000;
const MAX_REPLY_CHARS = 25000;
const MAX_ENTRIES = 50;
const VALID_PROTOCOLS = new Set(["http:", "https:"]);

function isHttpUrl(raw) {
  try {
    const url = new URL(String(raw));
    return VALID_PROTOCOLS.has(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeBrowserUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Enter a website address or search query.");

  let candidate = raw;
  const looksLikeHost = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[\da-f:]+\]|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[/?#].*)?$/i.test(raw);
  if (/^https?:\/\//i.test(raw)) {
    candidate = raw;
  } else if (looksLikeHost) {
    candidate = "https://" + raw;
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    candidate = "https://www.google.com/search?q=" + encodeURIComponent(raw);
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("That address is not valid.");
  }
  if (!VALID_PROTOCOLS.has(url.protocol)) {
    throw new Error("Only HTTP and HTTPS website addresses are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("Website addresses must not contain a username or password.");
  }
  return url.href;
}

function isNewResponse(current, baseline) {
  const text = String(current?.text || "").trim();
  if (!text) return false;
  if (!baseline) return true;
  const previousText = String(baseline.text || "").trim();
  const currentCount = Number.isInteger(current.messageCount) ? current.messageCount : 0;
  const baselineCount = Number.isInteger(baseline.messageCount) ? baseline.messageCount : 0;
  return currentCount > baselineCount || text !== previousText;
}

function normalizeProviderIds(ids, availableIds) {
  const allowed = new Set(availableIds);
  const candidates = Array.isArray(ids) ? ids : availableIds;
  return [...new Set(candidates.filter((id) => typeof id === "string" && allowed.has(id)))];
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      agent: String(item.agent || "Unknown AI").slice(0, 100),
      round: Math.max(1, Math.min(99, Number.parseInt(item.round, 10) || 1)),
      reply: String(item.reply || "").trim().slice(0, MAX_REPLY_CHARS),
      collectedAt: typeof item.collectedAt === "string" ? item.collectedAt.slice(0, 40) : "",
      taskRevision: Math.max(0, Number.parseInt(item.taskRevision, 10) || 0),
      partial: Boolean(item.partial)
    }))
    .filter((item) => item.reply)
    .slice(-MAX_ENTRIES);
}

function canStartNextRound({ round, approvals, entries }) {
  const gate = approvals || {};
  const relevant = Array.isArray(entries) ? entries.filter((item) => item.round === round && !item.partial) : [];
  const hasDirector = relevant.some((item) => String(item.agent).toLowerCase() === "chatgpt");
  const hasLeadCoder = relevant.some((item) => String(item.agent).toLowerCase() === "grok");
  return Boolean(hasDirector && hasLeadCoder && gate.director === "approved" && gate.leadCoder === "approved" && gate.user !== "approved" && round < 99);
}

function canApproveFinal({ approvals, entries, round }) {
  const gate = approvals || {};
  const relevant = Array.isArray(entries) ? entries.filter((item) => item.round === round && !item.partial) : [];
  const hasDirector = relevant.some((item) => String(item.agent).toLowerCase() === "chatgpt");
  const hasLeadCoder = relevant.some((item) => String(item.agent).toLowerCase() === "grok");
  return Boolean(hasDirector && hasLeadCoder &&
    gate.director === "approved" && gate.leadCoder === "approved" &&
    relevant.some((item) => String(item.reply || "").trim()));
}

module.exports = {
  MAX_TASK_CHARS,
  MAX_COUNCIL_PROMPT_CHARS,
  MAX_REPLY_CHARS,
  MAX_ENTRIES,
  isHttpUrl,
  normalizeBrowserUrl,
  isNewResponse,
  normalizeProviderIds,
  sanitizeEntries,
  canStartNextRound,
  canApproveFinal
};
