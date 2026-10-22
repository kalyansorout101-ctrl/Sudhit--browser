const SEARCH_URL = "https://duckduckgo.com/?q=";

function isSafeBrowserURL(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function looksLikeHostname(value) {
  if (!value || /\s/.test(value)) return false;
  const hostAndPath = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#].*)?$/i;
  return hostAndPath.test(value);
}

function normalizeNavigationInput(input) {
  if (typeof input !== "string") return { ok: false, message: "Enter a website or search term." };
  const value = input.trim();
  if (!value) return { ok: false, message: "Enter a website or search term." };
  if (value.length > 4096) return { ok: false, message: "The address is too long." };

  let candidate;
  if (/^https?:\/\//i.test(value)) {
    candidate = value;
  } else if (looksLikeHostname(value)) {
    candidate = "https://" + value;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return { ok: false, message: "Only HTTP and HTTPS website addresses are supported." };
  } else {
    candidate = SEARCH_URL + encodeURIComponent(value);
  }

  if (!isSafeBrowserURL(candidate)) {
    return { ok: false, message: "That address is not supported. Use an HTTP or HTTPS website." };
  }

  try {
    return { ok: true, url: new URL(candidate).href };
  } catch {
    return { ok: false, message: "That website address is invalid." };
  }
}

module.exports = { isSafeBrowserURL, normalizeNavigationInput };
