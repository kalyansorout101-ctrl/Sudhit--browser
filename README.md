# SUDHIT Browser / AI Council

SUDHIT Browser is a Windows-first Electron application that combines an integrated website browser with a multi-AI council dashboard.

## Project goals reflected in this build

- **ChatGPT — Director:** reasoning, review and synthesis.
- **Grok — Lead coder:** implementation and technical review.
- **Claude — Assistant coder:** code review and alternative approaches.
- All selected council websites receive the same current task in parallel.
- Later rounds include only replies from earlier rounds of the same task. Current-round responses are not fed to some agents earlier than others.
- A council response may be collected automatically or pasted manually if the provider changes its page layout.
- The Director and Lead Coder gates are explicit user-recorded review decisions. The app does not infer an approval just because a response says it approves.
- The next round remains locked until complete ChatGPT and Grok replies exist for the current round and both review gates are recorded as approved.
- User final approval is separate. The app never treats an AI approval as the user's decision.
- Council runs support pause, resume and stop; stopped and timeout responses are marked partial/review-required.
- The transcript and approval history are stored locally and can be exported as text.

## Integrated browser

The top toolbar switches between the Council dashboard and website tabs. It includes address/search input, back, forward, reload, new tab and close-tab actions. The app has separate persistent browser profiles for ChatGPT, Claude and Grok, so sessions are isolated by provider. General browsing uses a separate profile.

The embedded website views are sandboxed with Node integration disabled, context isolation enabled, web security enabled, and browser permission requests denied by default. Only HTTP and HTTPS addresses are accepted in the address bar. Sign in normally yourself. This app does not ask for passwords or try to bypass sign-in, CAPTCHA or verification.

## Known limitations — important

1. **Website automation is best-effort.** Provider DOM structures, send buttons and response selectors can change. A provider may block automated interaction, display verification, or have a layout that cannot be detected. Use manual paste collection if needed.
2. **Provider policies apply.** Use only accounts you are authorized to use and follow each provider's terms and rules.
3. **AI content is not automatically trusted.** Review outputs for incorrect claims, prompt injection, security problems and incompatible recommendations.
4. **This is not yet a release-verified product.** Automated source tests and packaging checks run in GitHub Actions. A successful build does not prove the live websites, sign-in flows, multi-tab navigation, pause/resume behavior or automated response extraction work on every machine.
5. **No public installer distribution is implied.** The CI-generated installer is a temporary GitHub Actions artifact for testing. Do not create a public release or publish an installer without separate approval.

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

## Hosted Windows build

The **Build Windows Installer** workflow runs on pushes to `main` and `fix/**`, pull requests targeting `main`, and manual dispatch. It checks JavaScript syntax, runs Node tests, builds the NSIS installer and uploads an artifact named `SUDHIT-Browser-Windows-Installer` for 14 days if all required steps pass.

Open the repository's **Actions** tab, select a successful workflow run and download its artifact ZIP. Extract the ZIP to obtain the installer. Do not treat a workflow's presence as evidence that the most recent build succeeded; check its result first.

## Project-wide acceptance requirements

For the director, status and coder conversations in the AI Council project, use this shared source-of-truth checklist:

- Browser: actual integrated website tabs, URL/search input, back/forward/reload, new/close tab, provider-profile isolation and safe navigation.
- Council: identical parallel first-round prompt, shared previous-round context, bounded session state, manual collection fallback, explicit run status and recoverable failures.
- Control: pause/resume/stop; block concurrent runs; don't silently start a new round before required reviews.
- Approval: complete current-task replies from ChatGPT and Grok; explicit Director gate; explicit Lead Coder gate; separate user final approval.
- Privacy/security: never persist passwords or secrets in transcript; disable Node integration in web content; maintain context isolation/sandbox; deny permissions by default; reject non-HTTP(S) address schemes.
- Quality: syntax checks, unit tests and Windows packaging in CI, plus explicit manual sign-in and live-site verification before calling the app release-ready.

Never commit passwords, session cookies, API keys or other secrets.
