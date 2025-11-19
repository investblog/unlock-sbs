# Unlock.SBS — Smart Bypass Service

Unlock.SBS is a small, privacy-first browser extension that keeps search results useful. It shows official mirrors and alternate domains directly in the search page, can highlight related bookmarks you already have, and never sends your data anywhere.

## What it does
- Adds a lightweight tips panel to Google, Yandex, Bing, and DuckDuckGo results when your query matches a saved brand or domain.
- Surfaces official alternates (mirrors) or full URLs you configure, plus matching bookmarks stored in your browser.
- Works entirely locally: no proxying, no analytics, no remote servers.

## Key features
- Brand and domain suggestions you curate yourself.
- Panel modes: badge only, badge + compact chip, or badge + auto-expanded panel.
- Badge on the extension icon with the number of available tips.
- Optional side-panel style hints when navigation errors occur (keeps the original tab intact).
- Optional Wayback Machine link and search-domain shortcuts inside the panel.

## How it works
- The extension activates on search results pages for Google, Yandex, Bing, and DuckDuckGo.
- It matches your query against:
  - Domains and alternates you add in the settings (domains or full URLs).
  - Related bookmarks from your local browser profile (if enabled).
- When matches are found, a chip/badge appears in the top-right of the SERP with tips and links. Badge counts mirror the number of suggestions and bookmarks found.

## Permissions & privacy
Unlock.SBS requests the following permissions:
- `webNavigation` and `tabs`: detect navigation on search result pages to place the panel and keep the original tab when showing hints.
- `bookmarks`: optionally surface matching bookmarks directly in the panel.
- `storage`: save your domain list, alternates, and preferences.
- `scripting`: inject the panel UI on supported search pages.

All processing happens locally in your browser. The extension does not send your queries, browsing history, or bookmarks to any external server.

## Installation
- **Chrome Web Store**: [Unlock.SBS on CWS](https://chromewebstore.google.com/detail/ldimjibdnbccpjgndkealkhojebhjdbh)
- **Manual (developer mode)**:
  1. Clone this repository.
  2. Open `chrome://extensions`, enable **Developer mode**, then click **Load unpacked**.
  3. Select the `src/` folder.

Minimum Chrome/Edge version: Manifest V3-compatible browsers (Chrome 109+, Edge 109+).

## Development
Install dependencies and build the distributable:
```bash
npm install
npm run build
```
During development you can also load the unpacked `src/` folder directly.

## Changelog
- **0.5.8** — Chip-based SERP helper with badge counts, selectable panel modes (icon/chip/auto), and side-panel fallback when navigation fails.
- **0.5.7** — More flexible JSON importer (objects, pairs, or list of objects) with full URL support and tooltips.
- **0.5.6–0.5.4** — Rendering fixes and preserved full URLs in storage and display.
- **0.5.3** — Rebrand to Unlock.SBS with English/Russian localization.

For detailed notes, see [CHANGELOG.md](CHANGELOG.md).
