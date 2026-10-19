const input = document.getElementById("address");
const status = document.getElementById("status");
document.getElementById("open").addEventListener("click", () => {
  let value = input.value.trim();
  if (!value) { status.textContent = "Enter a website address first."; return; }
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsupported protocol");
    status.textContent = "This starter does not embed web pages yet. Address validated: " + url.href;
  } catch { status.textContent = "That address doesn't look valid. Try https://example.com"; }
});
