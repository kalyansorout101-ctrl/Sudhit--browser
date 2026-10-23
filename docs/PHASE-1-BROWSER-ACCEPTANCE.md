# Phase 1 — Browser acceptance checklist

This document is the release gate for the browser-first milestone. A source-code change or passing Node test alone does not count as a manual acceptance test.

## Automated checks

- [ ] npm run check passes on Node 24.
- [ ] npm test passes, including browser data-store tests.
- [ ] Windows NSIS packaging completes with publishing disabled.
- [ ] CI uploads the EXE as a workflow artifact.

## Manual Windows tests

- [ ] Install the generated NSIS installer on Windows 10/11 x64.
- [ ] Launch, close, and relaunch the app without a crash.
- [ ] Search terms and hostnames navigate correctly; invalid/unsupported schemes are rejected.
- [ ] Back, forward, reload, Home, URL-bar focus, and common keyboard shortcuts work with both the address bar and a website focused.
- [ ] Open multiple tabs, switch between them, open a link in a new tab, and close tabs. Closing an active tab should select another tab or Home.
- [ ] Copy, paste, select all, editable controls, right-click context menu, and print work on ordinary websites.
- [ ] Bookmarks survive restart, open the expected URL, and can be deleted.
- [ ] History records navigations, survives restart, and clear-history removes it.
- [ ] A small file downloads to the path selected by the user; progress and final status are shown; completed files can be opened or revealed in Explorer; cancelling a save dialog cancels the download.
- [ ] A permission-requesting website is blocked by default; Block denies it; Allow once grants that permission only for the current app session.
- [ ] Normal website sign-in works on at least three websites. Google sign-in must be recorded separately, including any Google-side browser restriction or additional verification.
- [ ] Close and reopen SUDHIT; confirm persistent website sessions where the website allows them.
- [ ] Confirm ChatGPT/Claude/Grok provider profiles remain isolated from each other and from the general browser profile.
- [ ] Visit sites with pop-ups, redirects, and failed network loads; confirm the app stays usable and reports failures.

## Evidence

Record Windows version, app version, install result, test date, failed steps, logs, and screenshots for failures. Do not label an item passing without an observed result. Google sign-in and provider automation are subject to service-side restrictions and may remain unsupported even if ordinary browsing works.
