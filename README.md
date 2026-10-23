# SUDHIT Browser

SUDHIT Browser is a Windows-first Electron desktop browser. The current development focus is a reliable everyday browser; AI Council workflows remain in the source as an experimental secondary feature and are not the Phase 1 acceptance target.

## Browser-first Phase 1

The current development branch adds a browser home page with web search and quick links, tabs, safe HTTP/HTTPS URL handling, back/forward/reload, context menus, menu keyboard shortcuts, bookmarks, local browsing history, a downloads list with progress and open/reveal actions, and per-site permission prompts. General browsing uses a persistent profile so website sessions can survive app restarts. AI provider profiles remain isolated from the general browser profile.

Website permission requests are denied unless the user explicitly approves them for the current session. Unsupported permissions remain blocked. Only credential-free HTTP/HTTPS URLs are accepted in the address bar and saved in browser history/bookmarks. Downloads use a save-location dialog and are listed on the home page.

The application uses Electron WebContentsView for external sites with Node integration disabled, context isolation enabled, sandbox enabled, and web security enabled. The renderer talks to the main process through a narrow IPC allowlist. Site data, bookmarks, history, and download metadata are stored locally under Electron's application data directory; website passwords and cookies are not read by the app.

## Login and sessions

Sign in through the website's normal sign-in interface. Website sessions use persistent Electron partitions. Google and other providers may block authentication or pop-up flows inside embedded desktop browsers; successful sign-in and session restore must be verified against live websites and are not assumed merely from source code.

## Not in Phase 1

Automated AI prompt sending, AI response scraping, cross-agent relay and approval gates remain experimental. They will not be considered complete until the normal browser has passed the manual acceptance checks in docs/PHASE-1-BROWSER-ACCEPTANCE.md.

## Requirements and local development

- Node.js 24 LTS
- Windows 10/11 x64 for the NSIS installer build (GitHub Actions provides a hosted Windows runner)

Commands:

```sh
npm install
npm run check
npm test
npm start
npm run dist:win
```

npm run dist:win explicitly disables publishing; it builds locally and does not create a public release.

## Hosted Windows build

The Build Windows Installer workflow runs tests, builds the Windows NSIS installer and uploads a temporary SUDHIT-Browser-Windows-Installer artifact for 14 days. A successful CI build is not proof that the app has been installed and tested on a user's Windows device. Verify the workflow result and artifact before installing.

## Security and browser acceptance

The browser must be tested for everyday navigation, new and closed tabs, keyboard shortcuts, pop-ups, permission prompts, download saving/canceling, bookmark persistence, history clearing, Google sign-in where supported, and session persistence after restart. See docs/PHASE-1-BROWSER-ACCEPTANCE.md.

Never commit passwords, session cookies, API keys or other secrets.
