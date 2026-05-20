# CLAUDE.md — Kasipovic Tools

This repository hosts a collection of client-side, privacy-first web tools at `kasipovic.com`.

## Repository Structure

```
/                   → Tools index (root landing page, PWA)
/hash/              → Hash Calculator
/qr/                → QR Studio
/ip/                → IP Scanner
/exif/              → EXIF Inspector
/speed/             → Speed Test (basic)
/speedtest/         → SpeedTest Pro (full-featured)
/image/             → Image Tool
/doc/               → DocEdit
/whois/             → WHOIS Lookup
/kamere/            → Kamere (camera tool)
```

## Tools Index Maintenance

The root `index.html` serves as the tools index with two tabs: **Tools** and **Updates**.

### When adding a new tool

1. **Create the tool** in its own subdirectory (e.g., `/newtool/`) with `index.html`, `styles.css`, `script.js`, `sw.js`, and `manifest.json`.

2. **Update the `TOOLS` array** in `/index.html`. Add a new entry in the `<script>` section:
   ```javascript
   {
       name: 'Tool Display Name',
       path: '/newtool/',
       icon: '⚙',       // single character/emoji for the card icon
       description: 'Short description of the tool'
   }
   ```

3. **Add an entry to `/updates.json`** at the **top** of the array (newest first):
   ```json
   {
     "date": "2026-03-15T14:30:00Z",
     "tool": "Tool Display Name",
     "description": "Added new tool for doing X"
   }
   ```

4. **Bump the service worker cache version** in `/sw.js` — change `precache-v1` to `precache-v2` (or increment the current version) so returning users get the updated index.

### When modifying an existing tool

1. **Add an entry to `/updates.json`** at the top of the array with the tool name and a short description of what changed.

2. **Bump the service worker cache version** in `/sw.js` if root files changed.

3. If the tool name or description changed, update the matching entry in the `TOOLS` array in `/index.html`.

### updates.json format

The file is a JSON array, newest entries first. Each entry:

```json
{
  "date": "ISO 8601 datetime string",
  "tool": "Tool name (must match display name)",
  "description": "Short user-facing description of the change"
}
```

## Design System

All tools follow a consistent dark-mode-first design:

- **CSS Variables**: `--bg-primary: #0a0a0b`, `--accent: #8b5cf6` (purple), see any `styles.css`
- **Fonts**: `Space Grotesk` (headings), `DM Sans` (body text), `JetBrains Mono` (code/mono)
- **No external frameworks** — vanilla HTML/CSS/JS only
- **PWA pattern**: Each tool has `manifest.json` + `sw.js` for offline support
- **Zero dependencies**: Everything runs client-side with no build step

## Build & Deploy

- No build step required — all files are served as-is via GitHub Pages
- Custom domain: `kasipovic.com` (configured via `CNAME` file)
- Push to `main` branch to deploy
