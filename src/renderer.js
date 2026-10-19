const taskEl = document.getElementById("task");
const roundEl = document.getElementById("round");
const transcriptEl = document.getElementById("transcript");
const mainStatus = document.getElementById("mainStatus");
const STORAGE_KEY = "sudhit-council-session-v1";
const PROVIDER_LABELS = { chatgpt: "ChatGPT", claude: "Claude", grok: "Grok" };
let entries = [];
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  taskEl.value = saved.task || "";
  roundEl.value = String(saved.round || 1);
  entries = Array.isArray(saved.entries) ? saved.entries : [];
} catch { entries = []; }

function getRound() {
  const n = Number.parseInt(roundEl.value, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1;
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ task: taskEl.value, round: getRound(), entries }));
  } catch (error) {
    mainStatus.textContent = "Could not save all session data locally: " + error.message;
  }
}
function transcriptText() {
  const lines = [
    "SUDHIT AI COUNCIL — SHARED TRANSCRIPT",
    "Task: " + (taskEl.value.trim() || "(No task entered)"),
    ""
  ];
  if (!entries.length) lines.push("No replies collected yet.");
  for (const item of entries) {
    lines.push("=== ROUND " + item.round + " · " + item.agent + (item.partial ? " · PARTIAL" : "") + " ===");
    lines.push(item.reply, "");
  }
  return lines.join("\n");
}
function agentName(card) {
  if (card.dataset.agent === "Other AI") return card.querySelector(".agentName").value.trim() || "Other AI";
  return card.dataset.agent;
}
function render() {
  transcriptEl.textContent = transcriptText();
  for (const card of document.querySelectorAll("[data-agent]")) {
    const agent = agentName(card);
    const latest = [...entries].reverse().find(x => x.round === getRound() && x.agent === agent);
    card.querySelector(".status").textContent = latest
      ? "Collected in round " + latest.round + (latest.partial ? " (partial reply)." : ".")
      : "No reply collected for this round yet.";
  }
  save();
}
function setProviderStatus(id, message) {
  const card = document.querySelector('[data-provider="' + id + '"]');
  if (card) card.querySelector(".providerStatus").textContent = message;
}
function addEntry(agent, reply, options = {}) {
  const text = (reply || "").trim();
  if (!text) return false;
  const round = options.round || getRound();
  const duplicate = entries.some(item => item.round === round && item.agent === agent && item.reply === text);
  if (duplicate) return false;
  entries.push({
    agent, round, reply: text,
    collectedAt: new Date().toISOString(),
    partial: Boolean(options.partial)
  });
  render();
  return true;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    mainStatus.textContent = "Copied to clipboard.";
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    helper.remove();
    mainStatus.textContent = ok ? "Copied to clipboard." : "Copy was blocked. Select and copy the text manually.";
  }
}
function requireTask() {
  const prompt = taskEl.value.trim();
  if (!prompt) {
    mainStatus.textContent = "Enter the council task first.";
    taskEl.focus();
    return "";
  }
  return prompt;
}

taskEl.addEventListener("input", save);
roundEl.addEventListener("change", () => {
  roundEl.value = String(getRound());
  render();
});
document.getElementById("copyPrompt").addEventListener("click", () => {
  const prompt = requireTask();
  if (!prompt) return;
  copyText(
    "TASK FOR THE SUDHIT AI COUNCIL\n" + prompt +
    "\n\nCURRENT SHARED CONTEXT\n" + transcriptText() +
    "\n\nReply with your recommendation, assumptions, risks, and questions. Review the other collected replies above before responding."
  );
});
document.getElementById("copyTranscript").addEventListener("click", () => copyText(transcriptText()));
document.getElementById("newRound").addEventListener("click", () => {
  roundEl.value = String(Math.min(99, getRound() + 1));
  for (const card of document.querySelectorAll("[data-agent]")) {
    const replyEl = card.querySelector(".reply");
    if (replyEl) replyEl.value = "";
  }
  render();
  mainStatus.textContent = "Round " + getRound() + " started. The previous round remains in the transcript.";
});
document.getElementById("clear").addEventListener("click", () => {
  if (!confirm("Clear the task and all locally saved council replies? This cannot be undone.")) return;
  entries = [];
  taskEl.value = "";
  roundEl.value = "1";
  for (const card of document.querySelectorAll("[data-agent]")) {
    const replyEl = card.querySelector(".reply");
    if (replyEl) replyEl.value = "";
  }
  save();
  render();
  mainStatus.textContent = "Council session cleared.";
});
document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([transcriptText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sudhit-council-transcript.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

for (const card of document.querySelectorAll("[data-agent]")) {
  const collectButton = card.querySelector(".collect");
  if (!collectButton) continue;
  collectButton.addEventListener("click", () => {
    const replyEl = card.querySelector(".reply");
    const reply = replyEl.value.trim();
    if (!requireTask()) return;
    if (!reply) {
      mainStatus.textContent = "Paste a reply into the " + agentName(card) + " box first.";
      replyEl.focus();
      return;
    }
    const agent = agentName(card);
    if (addEntry(agent, reply)) {
      replyEl.value = "";
      mainStatus.textContent = "Collected " + agent + "'s reply for round " + getRound() + ".";
    } else {
      mainStatus.textContent = "That exact reply is already in this round.";
    }
  });
  const nameInput = card.querySelector(".agentName");
  if (nameInput) nameInput.addEventListener("input", render);
}

async function refreshProviders() {
  if (!window.sudhitAI) {
    mainStatus.textContent = "The desktop IPC bridge is unavailable. Launch this app through Electron, not by opening the HTML file directly.";
    return;
  }
  try {
    const providers = await window.sudhitAI.listProviders();
    for (const provider of providers) {
      setProviderStatus(provider.id, provider.opened
        ? "Window is open. Sign in if needed, then send or collect."
        : "Not opened yet. Open this site and sign in if needed.");
    }
  } catch (error) {
    mainStatus.textContent = "Could not refresh AI website status: " + error.message;
  }
}

for (const card of document.querySelectorAll("[data-provider]")) {
  const id = card.dataset.provider;
  card.querySelector(".openProvider").addEventListener("click", async () => {
    const button = card.querySelector(".openProvider");
    button.disabled = true;
    setProviderStatus(id, "Opening " + PROVIDER_LABELS[id] + "…");
    try {
      const result = await window.sudhitAI.open(id);
      setProviderStatus(id, result.ok
        ? "Website window is open. Sign in manually if needed, then return here."
        : result.message || "Could not open website.");
      mainStatus.textContent = result.ok ? "Opened " + PROVIDER_LABELS[id] + "." : result.message;
    } catch (error) {
      setProviderStatus(id, "Open failed: " + error.message);
    } finally { button.disabled = false; }
  });

  card.querySelector(".sendProvider").addEventListener("click", async () => {
    const prompt = requireTask();
    if (!prompt) return;
    const button = card.querySelector(".sendProvider");
    button.disabled = true;
    setProviderStatus(id, "Submitting the task to " + PROVIDER_LABELS[id] + "…");
    try {
      const result = await window.sudhitAI.send(id, prompt);
      setProviderStatus(id, result.message || (result.ok ? "Submitted." : "Not submitted."));
      mainStatus.textContent = result.label + ": " + result.message;
    } catch (error) {
      setProviderStatus(id, "Send failed: " + error.message);
    } finally { button.disabled = false; }
  });

  card.querySelector(".collectProvider").addEventListener("click", async () => {
    const button = card.querySelector(".collectProvider");
    button.disabled = true;
    setProviderStatus(id, "Reading the latest response…");
    try {
      const result = await window.sudhitAI.collect(id);
      if (result.ok && result.text) {
        const added = addEntry(PROVIDER_LABELS[id], result.text);
        setProviderStatus(id, added ? "Collected the latest response." : "That exact response is already in this round.");
        mainStatus.textContent = added ? "Collected " + PROVIDER_LABELS[id] + "'s response." : "This response is already recorded.";
      } else {
        setProviderStatus(id, result.message || "No response found yet.");
        mainStatus.textContent = result.message || "No response found yet.";
      }
    } catch (error) {
      setProviderStatus(id, "Collection failed: " + error.message);
    } finally { button.disabled = false; }
  });
}

document.getElementById("openAll").addEventListener("click", async () => {
  const button = document.getElementById("openAll");
  button.disabled = true;
  mainStatus.textContent = "Opening AI website windows. You may need to sign in to each one.";
  try {
    const response = await window.sudhitAI.openAll();
    const failures = response.results.filter(item => !item.ok);
    await refreshProviders();
    mainStatus.textContent = failures.length
      ? "Opened some websites. " + failures.map(x => x.label + ": " + x.message).join(" ")
      : "AI website windows opened. Sign in yourself if needed, then return here and send the task.";
  } catch (error) {
    mainStatus.textContent = "Could not open all websites: " + error.message;
  } finally { button.disabled = false; }
});

document.getElementById("refreshProviders").addEventListener("click", refreshProviders);
document.getElementById("runCouncil").addEventListener("click", async () => {
  const prompt = requireTask();
  if (!prompt) return;
  const button = document.getElementById("runCouncil");
  button.disabled = true;
  for (const id of Object.keys(PROVIDER_LABELS)) setProviderStatus(id, "Waiting to submit…");
  mainStatus.textContent = "Submitting the same task to open AI windows and waiting for responses. You can continue using the app, but keep the website windows open.";
  try {
    const response = await window.sudhitAI.runCouncil(prompt, Object.keys(PROVIDER_LABELS));
    for (const item of response.results || []) {
      const label = item.label || PROVIDER_LABELS[item.id] || item.id;
      if (item.reply) {
        const partial = item.status === "timeout-partial" || item.status === "timeout";
        const added = addEntry(label, item.reply, { partial });
        setProviderStatus(item.id, added
          ? (partial ? "Collected a partial reply after the wait limit." : "Reply automatically collected.")
          : "Reply was already collected in this round.");
      } else {
        setProviderStatus(item.id, item.message || "No reply collected. Try manual collection.");
      }
    }
    mainStatus.textContent = response.message || (response.ok ? "Council collection finished." : "Council run did not collect any replies. Check the status on each AI card.");
  } catch (error) {
    mainStatus.textContent = "Council run failed: " + error.message;
  } finally {
    button.disabled = false;
    await refreshProviders();
  }
});

if (window.sudhitAI && window.sudhitAI.onProgress) {
  window.sudhitAI.onProgress((detail) => {
    if (detail?.message) mainStatus.textContent = detail.message;
    if (detail?.providerId && detail?.message) setProviderStatus(detail.providerId, detail.message);
  });
}
render();
refreshProviders();
