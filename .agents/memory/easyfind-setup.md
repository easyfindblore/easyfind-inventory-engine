---
name: EasyFind Inventory Engine — project setup context
description: Key facts about the project state established in Session 001; avoids re-auditing on every session.
---

# EasyFind Inventory Engine — Setup Context

**Why:** The GitHub repo was imported with docs only. All code was built fresh in Session 001 from the 10 spec documents. Future sessions must NOT treat the repo as empty — all src/ modules now exist.

## Architecture (do not change)
- Node.js + Express webhook server (`src/index.js`, port 3000)
- In-memory session store — one session per WhatsApp sender, 30-min timeout
- Google Sheets = only database; Cloudinary = only media storage
- OpenAI disabled (placeholder only)

## Session completion rule (PERMANENT)
Every session MUST append to `docs/development/REPLIT_ENGINEERING_LOG.md` and commit before marking complete.

## GitHub auth
GitHub push fails with 401 — PAT not configured. Code has NOT been pushed to origin yet. Render is not deployed.

## Credential env vars needed (all missing)
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

## Key design decisions
- POST /webhook is fail-closed in production: requires `WHATSAPP_APP_SECRET`; rejects all unsigned requests
- Media upload failure (any file) blocks property commit — no partial saves
- PID generation uses a promise-chain lock to prevent concurrent duplicate PIDs within a single process
- Parser uses `lastMatch` helper (all fields) to implement "latest value wins" per Doc 02
