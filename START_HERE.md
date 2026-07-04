# START HERE — EasyFind Inventory Engine

> **Read this file first, every session, no exceptions.**

Welcome to the EasyFind Inventory Engine. This document tells you what this project is, how it works, and exactly where to find everything.

---

## What This Project Does

Agents listing properties on EasyFind send a formatted WhatsApp message. This engine:

1. Receives the message via a Meta Cloud API webhook
2. Parses all property fields (rent, BHK, location, amenities, etc.)
3. Normalizes values to match the master spec (e.g. "3 BHK" → `3`)
4. Uploads any photos to Cloudinary (deterministic naming: `PID{date}{seq}_img001`)
5. Writes a clean structured row to the Google Sheets master inventory
6. Replies to the agent confirming success (or explaining what went wrong)

---

## Technology Stack — Do Not Change

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express |
| WhatsApp | Meta Cloud API (webhook) |
| Database | Google Sheets (only database — do not add others) |
| Media | Cloudinary (only media store — do not add others) |
| Deployment | Render (auto-deploy from GitHub `main`) |
| AI | OpenAI (disabled placeholder only — do not enable without explicit instruction) |

---

## How to Start a Session

```bash
npm install        # only if package.json changed
npm start          # starts on port 3000
```

The Replit workflow `Start application` handles this automatically.

---

## Where Everything Lives

```
START_HERE.md                          ← you are here
replit.md                              ← project overview + user preferences
README.md                              ← public-facing repository readme

src/                                   ← all application code
  index.js                             ← Express server entry point (port 3000)
  config/config.js                     ← env var loading + validation
  routes/webhook.js                    ← GET + POST /webhook handlers
  controllers/webhookController.js     ← session flow orchestration
  parser/messageParser.js             ← field extraction (Doc 02)
  normalizer/normalizer.js            ← value mapping (Doc 03)
  session/sessionManager.js           ← in-memory sessions, 30-min timeout
  services/whatsapp.js                ← Meta Cloud API client
  services/sheets.js                  ← Google Sheets read/write
  services/cloudinary.js              ← Cloudinary upload
  utils/logger.js                     ← Winston structured logger
  utils/pidGenerator.js              ← PID + media public_id generation

docs/
  specs/                              ← business rules (what to build)
    01_inventory_sheet_specification.md
    04_property_message_formats.md
    06_whatsapp_session_flow.md
    07_duplicate_detection_specification.md
    08_media_processing_specification.md
    09_google_sheet_operations.md
  contracts/                          ← integration contracts (how to build it)
    02_column_contract.md
    03_mapping_rules.md
    05_api_integration_contract.md
  architecture/                       ← system design
    10_system_architecture.md
  development/                        ← live session history
    REPLIT_ENGINEERING_LOG.md         ← permanent append-only session log
    PROJECT_STATUS.md                 ← current state snapshot
    WEBHOOK_INCIDENT_REPORT.md        ← root cause + resolution checklist
  governance/                         ← project management
    implementation_tracker.md         ← task-level progress tracker
    ROADMAP.md                        ← phase-level roadmap
    IMPLEMENTATION_CHECKLIST.md       ← pre-session + pre-deploy checklists
    repository_guide.md               ← repo conventions
    repository_audit_report.md        ← initial audit
    documentation_migration_report.md ← doc migration history
```

---

## Engineering Governance — Two-Agent Model

**This project uses two independent AI agents with strictly separated responsibilities. Neither agent overwrites the other's work.**

### Replit Agent — Engineering Lead
Owns: architecture, source code, bug fixes, refactoring, deployment, infrastructure, Git, Render, Meta Webhook, engineering documentation, repository continuity, release management.

Does NOT own: regression datasets, test fixtures, WhatsApp message conversations, parser/normalizer validation suites, QA documentation.

### Manus AI — Test Engineering Lead
Owns: regression datasets, property test conversations, WhatsApp message fixtures, batch testing, validation suites, parser/normalizer/duplicate-detection validation, edge-case generation, stress testing, failure testing, negative testing, production simulation, QA documentation.

### Rules
- Replit Agent must not regenerate, overwrite, or modify any assets created by Manus.
- Manus must not modify source code, engineering docs, or infrastructure config.
- Collaboration happens only through documented interfaces and repository structure.
- Testing assets delivered by Manus are treated as the official testing source.
- Manus will intentionally attempt to break the implementation — this is expected and correct.

### Filesystem Convention
| Path pattern | Owner |
|-------------|-------|
| `src/` | Replit Agent |
| `docs/development/`, `docs/governance/`, `docs/architecture/`, `docs/contracts/` | Replit Agent |
| `tests/`, `fixtures/`, `regression/` (when created) | Manus AI |
| `docs/specs/` | Shared read-only reference (neither agent modifies specs) |

---

## Mandatory Session Rules

These are permanent engineering requirements. Violating them is a critical failure.

### Rule 1 — Read Before You Write
Before writing any code, read the relevant spec document. The specs are the source of truth, not your assumptions.

| Task | Read First |
|------|-----------|
| Parser changes | `docs/contracts/02_column_contract.md` |
| Normalizer changes | `docs/contracts/03_mapping_rules.md` |
| Session flow changes | `docs/specs/06_whatsapp_session_flow.md` |
| Sheets changes | `docs/specs/09_google_sheet_operations.md` |
| Media changes | `docs/specs/08_media_processing_specification.md` |

### Rule 2 — Update Engineering Log Before Finishing
Every session **must** append a new session block to `docs/development/REPLIT_ENGINEERING_LOG.md`.  
**The session is not complete until this is done and committed.**

See the log file for the exact format. Use `## SESSION 00N` as the header (increment from last).

### Rule 3 — No Silent Failures
The engine fails closed, not open. If a critical credential is missing in production, reject the request. If media upload fails, do not write to Sheets. No partial commits.

### Rule 4 — Do Not Implement These (Yet)
- Search / filtering of inventory
- Duplicate detection (Task #4 — not started)
- Full dropdown validation
- AI parsing (OpenAI interface is a disabled placeholder)
- Dashboard or analytics
- Any database other than Google Sheets

---

## Key Environment Variables

All documented in `.env.example`. Required for any real traffic:

```
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN

GOOGLE_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON     ← full service account JSON as a single-line string

CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

NODE_ENV                        ← set to "production" on Render
PORT                            ← defaults to 3000
```

---

## Deployment Checklist (GitHub Push Complete — Render Setup Pending)

- [x] Configure GitHub PAT so `git push origin main` succeeds — done Session 005 (`main` at `284d74b`)
- [ ] Render auto-deploys from `main` (configured via `render.yaml`)
- [ ] Set all environment variables in Render dashboard
- [ ] Register `https://<render-url>/webhook` in Meta Developer Console
- [ ] Verify Meta sends GET challenge → engine returns 200 with `hub.challenge`
- [ ] Send test WhatsApp message → verify row appears in Google Sheet

See `docs/development/WEBHOOK_INCIDENT_REPORT.md` for detailed verification steps.

---

## Current Blockers

| ID | Blocker | Who Must Act |
|----|---------|-------------|
| B001 | ~~GitHub PAT not configured~~ RESOLVED Session 005 | — |
| B002 | Render not deployed | Project owner (no longer blocked on B001) |
| B003 | Meta webhook not registered | Blocked on B002 |
| B004 | All env vars missing (WHATSAPP_*, GOOGLE_*, CLOUDINARY_*) in Render | Project owner |

---

## Quick Links

| Need | Go To |
|------|-------|
| Current phase and task status | [`docs/governance/implementation_tracker.md`](docs/governance/implementation_tracker.md) |
| What changed in prior sessions | [`docs/development/REPLIT_ENGINEERING_LOG.md`](docs/development/REPLIT_ENGINEERING_LOG.md) |
| What's working right now | [`docs/development/PROJECT_STATUS.md`](docs/development/PROJECT_STATUS.md) |
| Planned future work | [`docs/governance/ROADMAP.md`](docs/governance/ROADMAP.md) |
| Pre-code checklist | [`docs/governance/IMPLEMENTATION_CHECKLIST.md`](docs/governance/IMPLEMENTATION_CHECKLIST.md) |
| Webhook is broken | [`docs/development/WEBHOOK_INCIDENT_REPORT.md`](docs/development/WEBHOOK_INCIDENT_REPORT.md) |

---

*This document must be kept up to date. If something here is wrong, fix it immediately.*
