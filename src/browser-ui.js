(() => {
  "use strict";

  const api = window.sudhitAI;
  const tabStrip = document.getElementById("tabStrip");
  const addressForm = document.getElementById("addressForm");
  const addressBar = document.getElementById("addressBar");
  const backButton = document.getElementById("browserBack");
  const forwardButton = document.getElementById("browserForward");
  const reloadButton = document.getElementById("browserReload");
  const mainStatus = document.getElementById("mainStatus");
  if (!api || !tabStrip || !addressForm || !addressBar) return;

  let state = { activeTabId: "dashboard", tabs: [{ id: "dashboard", title: "AI Council", isDashboard: true }] };

  function setStatus(message) {
    if (mainStatus && message) mainStatus.textContent = message;
  }

  function activeTab() {
    return state.tabs.find(tab => tab.id === state.activeTabId) || state.tabs[0];
  }

  function renderTabs() {
    tabStrip.replaceChildren();
    for (const tab of state.tabs) {
      const item = document.createElement("div");
      item.className = "tabItem" + (tab.id === state.activeTabId ? " active" : "");

      const activate = document.createElement("button");
      activate.type = "button";
      activate.className = "browser-tab";
      activate.setAttribute("role", "tab");
      activate.setAttribute("aria-selected", String(tab.id === state.activeTabId));
      activate.title = tab.url || tab.title;
      activate.textContent = (tab.loading ? "⟳ " : "") + (tab.title || "New Tab");
      activate.addEventListener("click", async () => {
        const result = await api.activateTab(tab.id);
        if (!result?.ok) setStatus(result?.message || "Could not activate that tab.");
      });
      item.appendChild(activate);

      if (!tab.isDashboard) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "browser-tab-close";
        close.textContent = "×";
        close.title = "Close " + (tab.title || "tab");
        close.setAttribute("aria-label", "Close " + (tab.title || "tab"));
        close.addEventListener("click", async event => {
          event.stopPropagation();
          const result = await api.closeTab(tab.id);
          if (!result?.ok) setStatus(result?.message || "Could not close that tab.");
        });
        item.appendChild(close);
      }
      tabStrip.appendChild(item);
    }
  }

  function applyState(nextState) {
    if (!nextState || !Array.isArray(nextState.tabs)) return;
    state = nextState;
    renderTabs();
    const current = activeTab();
    if (document.activeElement !== addressBar) {
      addressBar.value = current && !current.isDashboard ? (current.url || "") : "";
    }
    backButton.disabled = !current || current.isDashboard || !current.canGoBack;
    forwardButton.disabled = !current || current.isDashboard || !current.canGoForward;
    reloadButton.disabled = !current || current.isDashboard;
  }

  async function runAction(action) {
    try {
      const result = await action();
      if (result && result.ok === false) setStatus(result.message || "The browser action could not be completed.");
    } catch (error) {
      setStatus("Browser action failed: " + (error?.message || String(error)));
    }
  }

  addressForm.addEventListener("submit", event => {
    event.preventDefault();
    const input = addressBar.value;
    runAction(async () => {
      const result = await api.navigate(input);
      if (result?.ok) addressBar.blur();
      return result;
    });
  });

  backButton.addEventListener("click", () => runAction(() => api.back()));
  forwardButton.addEventListener("click", () => runAction(() => api.forward()));
  reloadButton.addEventListener("click", () => runAction(() => api.reload()));
  document.getElementById("newBrowserTab").addEventListener("click", () => runAction(() => api.newTab()));
  document.getElementById("copySelection").addEventListener("click", () => runAction(() => api.copy()));
  document.getElementById("pasteClipboard").addEventListener("click", () => runAction(() => api.paste()));

  api.onBrowserState(applyState);
  api.onFocusAddress(() => {
    addressBar.focus();
    addressBar.select();
  });
  api.getBrowserState().then(applyState).catch(error => {
    setStatus("Could not load browser tabs: " + (error?.message || String(error)));
  });
})();
