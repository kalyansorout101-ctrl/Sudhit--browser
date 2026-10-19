const PROVIDERS = Object.freeze({
  chatgpt: { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/", partition: "persist:sudhit-chatgpt" },
  claude: { id: "claude", label: "Claude", url: "https://claude.ai/new", partition: "persist:sudhit-claude" },
  grok: { id: "grok", label: "Grok", url: "https://grok.com/", partition: "persist:sudhit-grok" }
});

function visible(el) {
  if (!el || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}
function makeSendScript(providerId, prompt) {
  return `(async function(text) {
    const visible = (el) => {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const authPath = new RegExp("/(?:login|log-in|signin|sign-in|auth)(?:/|$)", "i").test(location.pathname);
    const credentialFields = [...document.querySelectorAll('input[type="password"], input[autocomplete="current-password"], input[type="email"], input[autocomplete="username"]')].filter(visible);
    const loginCopy = /sign in to continue|log in to continue|continue with email|enter your email to continue/i.test((document.body?.innerText || "").slice(0, 5000));
    if (authPath || credentialFields.some(el => el.type === "password" || el.autocomplete === "current-password") ||
        (credentialFields.length && loginCopy)) {
      return { ok: false, message: "This page looks like a sign-in or verification screen. Complete it manually in the AI window, then retry." };
    }
    const selectors = [
      "#prompt-textarea",
      "[data-testid='grok-composer'] [contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true'][data-placeholder]",
      "div[contenteditable='true']",
      "textarea[placeholder]"
    ];
    let composer = null;
    for (const selector of selectors) {
      composer = [...document.querySelectorAll(selector)].find(el => {
        const hints = [el.id, el.className, el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("name"), el.getAttribute("data-placeholder")].join(" ").toLowerCase();
        const looksLikePrompt = Boolean(el.isContentEditable) || /prompt|message|ask|chat|reply/i.test(hints);
        const looksLikeCredential = /email|password|username|search|login|sign in/i.test(hints) ||
          ["email", "password", "search"].includes((el.type || "").toLowerCase());
        return visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && looksLikePrompt && !looksLikeCredential;
      });
      if (composer) break;
    }
    if (!composer) return { ok: false, message: "Composer not found. Sign in, finish any verification, open a chat, and try again." };
    composer.focus();
    if (composer.isContentEditable || composer.getAttribute("contenteditable") === "true") {
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, text);
      } catch {}
      if ((composer.innerText || "").trim() !== text.trim()) {
        composer.textContent = text;
        composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
    } else {
      const proto = composer.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(composer, text); else composer.value = text;
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    const buttons = [
      "button[data-testid='send-button']",
      "button[aria-label*='Send message' i]",
      "button[aria-label^='Send' i]",
      "button[data-testid*='send' i]",
      "button[type='submit']"
    ];
    let sendButton = null;
    for (const selector of buttons) {
      sendButton = [...document.querySelectorAll(selector)].find(el => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true");
      if (sendButton) break;
    }
    if (sendButton) {
      sendButton.click();
      return { ok: true, sent: true, message: "Prompt submitted. Waiting for the response." };
    }
    return { ok: true, sent: false, message: "Prompt entered, but the Send button was not recognized. Click Send on the AI website; SUDHIT will still try to collect the response." };
  })(${JSON.stringify(prompt)})`;
}
function makeReadScript(providerId, prompt) {
  return `(function(sentPrompt) {
    const visible = (el) => {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const preferred = {
      chatgpt: ["[data-message-author-role='assistant']"],
      claude: ["[data-testid='assistant-message']", "[data-testid='chat-message'] .font-claude-message", ".font-claude-message", "div[class*='assistant-message']"],
      grok: ["[data-testid='response-content']", "[data-testid='message-content']", "[data-testid='answer-content']", "div[class*='response-content']"]
    };
    const fallback = ["main .prose", "main [class*='markdown']", "main article", "main [data-testid*='message']", "main [class*='message-content']"];
    const prompt = (sentPrompt || "").trim();
    function clean(el) {
      const value = (el.innerText || el.textContent || "").trim();
      if (value.length < 15 || value.length > 100000) return "";
      if (prompt && (value === prompt || (prompt.length > 35 && value.includes(prompt) && value.length < prompt.length + 100))) return "";
      return value;
    }
    let text = "";
    let source = "";
    for (const selector of [...(preferred[${JSON.stringify(providerId)}] || []), ...fallback]) {
      let items = [...document.querySelectorAll(selector)].filter(visible).map(el => ({ el, value: clean(el) })).filter(x => x.value);
      if (items.length) {
        const unique = [];
        const seen = new Set();
        for (const item of items) {
          if (!seen.has(item.value)) { seen.add(item.value); unique.push(item); }
        }
        text = unique[unique.length - 1].value;
        source = selector;
        if (text) break;
      }
    }
    const stopSelectors = ["[data-testid='stop-button']", "button[aria-label*='Stop response' i]", "button[aria-label*='Stop generating' i]", "button[title*='Stop generating' i]"];
    const isGenerating = stopSelectors.some(sel => [...document.querySelectorAll(sel)].some(el => visible(el) && !el.disabled));
    return { text, source, isGenerating, url: location.href };
  })(${JSON.stringify(prompt || "")})`;
}
module.exports = { PROVIDERS, makeSendScript, makeReadScript };
