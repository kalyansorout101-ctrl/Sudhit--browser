# SUDHIT Browser

Electron desktop prototype for the SUDHIT multi-AI council.

## Current milestone: website reply collection preview

- Opens separate ChatGPT, Claude, and Grok website windows.
- Uses an isolated persistent browser profile per provider, so website sign-in sessions can persist locally.
- Provides explicit controls to open/focus a website, send the council task, collect the latest visible reply, or run a multi-site send-and-collect round.
- Sends a shared transcript with prior collected replies in later rounds.
- Detects response text with best-effort provider DOM selectors and waits for a stable, non-generating result.
- Saves the council transcript locally in the app and exports it as text.
- Keeps manual paste collection as a fallback if a provider changes its page structure.

## Important limitations

This is an early prototype, not a full Chromium-style tabbed browser. Website DOM selectors can break when providers change their interfaces, and automatic prompt submission or extraction is not guaranteed. The app has not yet been manually tested against signed-in live AI websites. Users must sign in themselves and complete any normal verification in each provider window; the app does not bypass login or verification. Review AI responses before relying on them.

This prototype does not use provider APIs. It automates the visible website UI on a best-effort basis. Only use accounts and websites you are authorized to access, and follow each service's rules.

## Build on Windows

Requires Node.js 22:
- `npm install`
- `npm test`
- `npm start`
- `npm run dist:win`

## Hosted Windows build

The GitHub Actions workflow checks JavaScript syntax, runs helper tests, and builds a Windows NSIS installer on `windows-latest`. Push to `main` or manually run **Build Windows Installer** from the Actions tab. Download the `SUDHIT-Browser-Windows-Installer` artifact if the run succeeds.

Never commit passwords, session cookies, API keys, or other secrets.
