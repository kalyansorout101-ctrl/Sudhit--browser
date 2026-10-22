# SUDHIT Browser

Desktop Electron browser with an integrated AI Council dashboard.

## Browser features

- Integrated tab bar with an always-available AI Council tab.
- In-app website tabs with address/search bar, back, forward, reload, new tab, and close tab.
- Navigation accepts HTTP/HTTPS URLs and sends plain text to DuckDuckGo search.
- Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+R, Ctrl+Tab, and Alt+Left/Right shortcuts (Command instead of Control on macOS).
- Browser context menu with copy, cut, paste, select all, and reload where applicable.
- Copy/Paste toolbar controls for the active website tab.
- Persistent isolated browser profiles for ChatGPT, Claude, and Grok.
- AI prompt submission and best-effort reply collection in the provider's own tab.
- Shared council transcript, manual reply paste fallback, local session storage, and text export.
- Website tabs run with context isolation, no Node.js integration, sandboxing, and HTTP/HTTPS navigation validation.

## AI Council limitations

SUDHIT automates visible website interfaces, not provider APIs. Automatic submission and reply extraction remain best-effort because each provider can change its page structure. You must sign in yourself and complete any normal verification. The application does not bypass sign-in or verification. Review AI replies before relying on them. Use only accounts and websites you are authorized to access, and follow each service's terms.

The desktop UI and browser navigation have not yet been runtime-verified in this change. A Windows GitHub Actions workflow now installs dependencies, runs automated tests, builds an NSIS installer, and uploads the resulting installer when all steps pass.

## Build on Windows

Requires Node.js 22.

```powershell
npm install
npm test
npm start
npm run dist:win
```

The Windows installer is created in `dist/`. GitHub Actions uploads it as the `SUDHIT-Browser-Windows-Installer` artifact after a successful workflow run.

Never commit passwords, session cookies, API keys, or other secrets.
