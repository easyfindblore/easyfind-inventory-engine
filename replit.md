# EasyFind Inventory Engine

## Project Overview

WhatsApp-driven property inventory automation engine. Receives property details via WhatsApp, parses and normalizes them, uploads media to Cloudinary, and writes structured records to a Google Sheets master inventory.

### Technology Stack
- **Runtime:** Node.js (18+)
- **Framework:** Express
- **Webhook:** Meta WhatsApp Cloud API
- **Database:** Google Sheets (only database)
- **Media Storage:** Cloudinary (only media storage)
- **Deployment:** Render

### Architecture
```
WhatsApp User → Meta Webhook → Express Server
  → Session Manager → Message Parser → Normalizer
  → Cloudinary (media) → Google Sheets (inventory)
  → WhatsApp Reply
```

## How to Run Locally

```bash
npm install
cp .env.example .env   # fill in your credentials
npm start              # starts on port 3000
```

The server starts on port 3000. Workflow: `Start application` (`npm start`).

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check (used by Render) |
| `GET /webhook` | Meta verification challenge |
| `POST /webhook` | Incoming WhatsApp messages |

## Environment Variables

See `.env.example` for the full list. Required for production:
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
- `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

## Source Layout

```
src/
  config/config.js          — env var loading & validation
  controllers/webhookController.js — orchestration
  parser/messageParser.js   — field extraction (Doc 02)
  normalizer/normalizer.js  — value mapping (Doc 03)
  session/sessionManager.js — in-memory sessions, 30-min timeout
  services/whatsapp.js      — Meta Cloud API
  services/sheets.js        — Google Sheets read/write
  services/cloudinary.js    — media upload
  utils/logger.js           — Winston structured logging
  utils/pidGenerator.js     — deterministic PID generation
  routes/webhook.js         — GET + POST /webhook
  index.js                  — Express app entry point
docs/
  development/              — Engineering Log, Project Status, Incident Reports
  specs/                    — Business specifications (Docs 01, 04, 06–09)
  contracts/                — Parser and API contracts (Docs 02, 03, 05)
  architecture/             — System architecture (Doc 10)
```

## Engineering Continuity

Every session must update `docs/development/REPLIT_ENGINEERING_LOG.md` before completing.  
Current status: `docs/development/PROJECT_STATUS.md`

## Deployment (Render)

1. Push `main` to GitHub
2. Render auto-deploys (configured via `render.yaml`)
3. Set all environment variables in Render dashboard
4. Register webhook URL in Meta Developer Console

## Engineering Governance — Two-Agent Model

This project operates with two independent AI agents. **Neither agent overwrites the other's work.**

**Replit Agent (this agent)** owns: source code, architecture, bug fixes, deployment, infrastructure, Git, Render, Meta Webhook, all engineering and continuity documentation.

**Manus AI** owns: regression datasets, WhatsApp message fixtures, parser/normalizer/duplicate-detection validation suites, edge-case and failure testing, QA documentation.

Rules:
- Do not regenerate, overwrite, or modify any assets created by Manus.
- Testing assets from Manus are the official testing source.
- Manus will intentionally attempt to break the implementation — treat its findings as valid bug reports.
- Collaboration only through documented interfaces and repository structure.

Filesystem ownership:
- `src/` → Replit Agent
- `docs/development/`, `docs/governance/`, `docs/architecture/`, `docs/contracts/` → Replit Agent
- `tests/`, `fixtures/`, `regression/` (when created by Manus) → Manus AI
- `docs/specs/` → shared read-only reference

## User Preferences

- Engineering Log (`REPLIT_ENGINEERING_LOG.md`) must be updated and committed at the end of every session — this is a permanent project rule
- Do not implement Search Engine, Duplicate Detection, AI Parsing, OCR, Dashboard, or Analytics until explicitly requested
- Google Sheets is the only database; Cloudinary is the only media storage — do not add alternatives
- Do not change the technology stack (Node.js, Express, WhatsApp Cloud API, Google Sheets, Cloudinary, Render)
- OpenAI must remain behind a disabled interface placeholder only
