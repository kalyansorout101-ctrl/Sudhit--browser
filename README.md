# SUDHIT Browser
Early Electron desktop starter for the SUDHIT Browser project.

## Included
- Electron desktop window and dark starter UI.
- Isolated renderer (context isolation, sandbox, Node integration disabled).
- GitHub Actions workflow for a Windows NSIS installer.

## Not implemented yet
This is not a full Chromium-style browser. Embedded tabs/navigation, bookmarks, downloads, website-based AI council automation, synchronized multi-AI rounds, approvals, and persistent history still need development and testing. The address field currently validates a URL but does not navigate to it.

## Build on Windows
Install Node.js 22, then run:
- `npm install`
- `npm start`
- `npm run dist:win`

## Automated build
Push to main or open Actions and run **Build Windows Installer**. Download the `SUDHIT-Browser-Windows-Installer` artifact if the run succeeds.

Never commit API keys, passwords, session cookies, or other secrets.
