# AI Council — shared implementation contract

This file captures the requirements established across the project's Director, Status Giver and Coder conversations. It is the common reference for subsequent chats and code reviews.

## Authority and responsibilities
- Director (ChatGPT): choose priorities, coordinate reviews, keep the product aligned to user requirements and report only verified status.
- Lead coder (Grok): implementation lead and technical design review.
- Assistant coder (Claude): complementary implementation and code review.
- The human user has final authority. No AI's own wording is treated as approval.

## User-visible browser
- Windows-first desktop Electron app.
- A real integrated tab strip, not separate pop-up windows as the only browsing interface.
- Address/search field, back, forward, reload, new tab, close tab, tab activation and provider tabs.
- Persistent sessions separated between supported AI websites.
- HTTP/HTTPS navigation only; external pages must not get Node integration or access to the local app's IPC bridge.
- Login and verification must be completed by the user, not bypassed.

## Council behavior
- Send the same first-round task to all selected, opened AI websites in parallel.
- Collect all results into one transcript with provider name, round, timestamp and partial/complete status.
- In each later round, provide all collected replies from previous rounds of the same task as reference context. Do not leak current-round responses into some agents' first prompt while other agents have not responded yet.
- Transcript storage and export are local. Put reasonable limits on tasks, individual replies and total transcript entries.
- Keep manual paste collection as a fallback for changing website layouts.
- Include useful status information; stop and pause controls must not silently create a new run or falsely declare completion.

## Approval gates
- A complete current-task response from ChatGPT is required before recording the Director gate.
- A complete current-task response from Grok is required before recording the Lead Coder gate.
- A new round is locked until both gates are explicitly recorded as approved.
- A rejected/changed reply or newly collected current-round result invalidates the relevant approvals.
- Final approval by the user is a separate explicit action, not automatically inferred from either AI.
- Edits to the task create a new task revision; older replies remain in the transcript but cannot contaminate the new task's prompt or gate checks.

## Security and release rules
- Electron isolation defaults: context isolation on, Node integration off, sandbox on, web security on.
- Use a narrow preload IPC allowlist and reject requests that do not come from the app renderer.
- Reject non-HTTP/S browser navigation and deny site permission prompts by default.
- Never store passwords, cookies or API keys in the council transcript.
- GitHub Actions is the chosen path for a Windows installer because the user doesn't have local Windows development access.
- Installer artifacts are for testing. No public distribution/release without a separate approval.
- Never claim a test, live website flow, Windows build or installer works unless a successful run or direct evidence supports the claim.

## Acceptance evidence
1. Node syntax checks and unit tests pass.
2. GitHub Actions Windows NSIS packaging succeeds and uploads its artifact.
3. Manual smoke checks cover browser tabs and navigation, normal sign-in, each provider's prompt submission and collection, transcript persistence/export, task revision isolation, approval lockout/unlock, pause/resume/stop and application restart.
4. Only after item 3 may the product be described as manually runtime-verified; passing CI alone is not enough.
