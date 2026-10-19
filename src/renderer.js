const taskEl = document.getElementById("task");
const roundEl = document.getElementById("round");
const transcriptEl = document.getElementById("transcript");
const mainStatus = document.getElementById("mainStatus");
const STORAGE_KEY = "sudhit-council-session-v1";
let entries = [];
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  taskEl.value = saved.task || "";
  roundEl.value = String(saved.round || 1);
  entries = Array.isArray(saved.entries) ? saved.entries : [];
} catch { entries = []; }

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    task: taskEl.value, round: getRound(), entries
  }));
}
function getRound() {
  const n = Number.parseInt(roundEl.value, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1;
}
function transcriptText() {
  const task = taskEl.value.trim() || "(No task entered)";
  const lines = ["SUDHIT AI COUNCIL — SHARED TRANSCRIPT", "Task: " + task, ""];
  if (!entries.length) lines.push("No replies collected yet.");
  for (const item of entries) {
    lines.push("=== ROUND " + item.round + " · " + item.agent + " ===");
    lines.push(item.reply, "");
  }
  return lines.join("\n");
}
function render() {
  transcriptEl.textContent = transcriptText();
  for (const card of document.querySelectorAll("[data-agent]")) {
    const agent = getAgentName(card);
    const latest = [...entries].reverse().find(x => x.round === getRound() && x.agent === agent);
    const status = card.querySelector(".status");
    status.textContent = latest ? "Collected in round " + latest.round + "." : "No reply collected for this round yet.";
  }
  save();
}
function getAgentName(card) {
  if (card.dataset.agent === "Other AI") {
    return card.querySelector(".agentName").value.trim() || "Other AI";
  }
  return card.dataset.agent;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    mainStatus.textContent = "Copied to clipboard.";
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand("copy");
    helper.remove();
    mainStatus.textContent = ok ? "Copied to clipboard." : "Copy was blocked. Select and copy the transcript manually.";
  }
}
taskEl.addEventListener("input", save);
roundEl.addEventListener("change", () => {
  roundEl.value = String(getRound());
  render();
});
document.getElementById("copyPrompt").addEventListener("click", () => {
  const prompt = "TASK FOR THE SUDHIT AI COUNCIL\n" + (taskEl.value.trim() || "(Please enter the task first.)") +
    "\n\nCURRENT SHARED CONTEXT\n" + transcriptText() +
    "\n\nReply with your recommendation, assumptions, risks, and any questions. Consider all other collected replies above.";
  copyText(prompt);
});
document.getElementById("copyTranscript").addEventListener("click", () => copyText(transcriptText()));
document.getElementById("newRound").addEventListener("click", () => {
  roundEl.value = String(Math.min(99, getRound() + 1));
  for (const card of document.querySelectorAll("[data-agent]")) card.querySelector(".reply").value = "";
  render();
  mainStatus.textContent = "Round " + getRound() + " started. Copy the shared transcript into each AI, then collect their new replies.";
});
document.getElementById("clear").addEventListener("click", () => {
  if (!confirm("Clear the task and all locally saved council replies? This cannot be undone.")) return;
  entries = [];
  taskEl.value = "";
  roundEl.value = "1";
  for (const card of document.querySelectorAll("[data-agent]")) card.querySelector(".reply").value = "";
  save();
  render();
  mainStatus.textContent = "Council session cleared.";
});
document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([transcriptText()], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sudhit-council-transcript.txt";
  a.click();
  URL.revokeObjectURL(url);
});
for (const card of document.querySelectorAll("[data-agent]")) {
  card.querySelector(".collect").addEventListener("click", () => {
    const reply = card.querySelector(".reply").value.trim();
    if (!taskEl.value.trim()) {
      mainStatus.textContent = "Enter the task before collecting replies.";
      taskEl.focus();
      return;
    }
    if (!reply) {
      mainStatus.textContent = "Paste a reply into the " + getAgentName(card) + " box first.";
      card.querySelector(".reply").focus();
      return;
    }
    const agent = getAgentName(card);
    const round = getRound();
    entries.push({agent, round, reply, collectedAt: new Date().toISOString()});
    card.querySelector(".reply").value = "";
    render();
    mainStatus.textContent = "Collected " + agent + "'s reply for round " + round + ". It is now included in the shared transcript.";
  });
  const nameInput = card.querySelector(".agentName");
  if (nameInput) nameInput.addEventListener("input", render);
}
render();
