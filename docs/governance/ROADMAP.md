# ROADMAP
# EasyFind Inventory Engine

> **Phase-level plan. Updated when phases complete or priorities shift.**

**Last Updated:** 2026-07-03 | **Session:** 001

---

## Vision

A zero-friction, WhatsApp-native property inventory system. Agents list properties by sending a message — no app, no form, no training required. The backend handles all parsing, validation, deduplication, and storage automatically.

---

## Phase Status Overview

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| Phase 1 | Repository Foundation | ✅ COMPLETE | Session 001 |
| Phase 2 | Architecture Freeze | ✅ COMPLETE | Session 001 |
| Phase 3 | Core Modules | 🔄 IN PROGRESS | Session 002 |
| Phase 4 | Integrations | 🔄 IN PROGRESS | Session 002 |
| Phase 5 | Testing & QA | ⏳ NOT STARTED | Session 003 |
| Phase 6 | Deployment | 🔄 IN PROGRESS | Session 002–003 |
| Phase 7 | Validation & Enrichment | ⏳ NOT STARTED | TBD |
| Phase 8 | Intelligence Layer | ⏳ NOT STARTED | TBD |

---

## Phase Detail

### ✅ Phase 1 — Repository Foundation
All source-of-truth documentation in place. 10 business documents organized into `docs/specs/`, `docs/contracts/`, `docs/architecture/`, `docs/governance/`, `docs/development/`. Engineering continuity docs created.

### ✅ Phase 2 — Architecture Freeze
System design finalized. Technology stack locked. No further architectural changes without a documented engineering reason.

### 🔄 Phase 3 — Core Modules (70% complete)
**Done:** Parser, normalizer, session manager, PID generator, logger.  
**Remaining:** Full dropdown validation (all fields against allowed values per Doc 01).

### 🔄 Phase 4 — Integrations (50% complete)
**Done:** WhatsApp Cloud API, Google Sheets read/write, Cloudinary upload, media download.  
**Remaining:** End-to-end integration test against live services.

### 🔄 Phase 6 — Deployment (30% complete)
**Done:** `render.yaml`, `.env.example`, workflow configured.  
**Blocked:** GitHub PAT required before Render can auto-deploy. See `docs/development/WEBHOOK_INCIDENT_REPORT.md`.

### ⏳ Phase 5 — Testing & QA
- Parser unit tests covering all Doc 04 example messages
- Normalizer unit tests covering all Doc 03 mapping rules
- End-to-end integration test: WhatsApp → Sheets (manual, using real credentials)
- Session timeout test
- Cancel flow test

### ⏳ Phase 7 — Validation & Enrichment
- Full dropdown validation for all categorical fields (apartment type, BHK, furnishing, pets, parking)
- Duplicate detection (per `docs/specs/07_duplicate_detection_specification.md`)
- Unique Key generation on every write

### ⏳ Phase 8 — Intelligence Layer
- AI-assisted parsing for non-standard message formats
- OpenAI interface is a disabled placeholder — enable only when explicitly instructed

---

## What Is Out of Scope (Permanently, Unless Changed)
- Search / filtering / dashboard
- Any database other than Google Sheets
- Any media store other than Cloudinary
- OCR or image-to-text

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [`docs/governance/implementation_tracker.md`](implementation_tracker.md) | Task-level breakdown with status |
| [`docs/development/PROJECT_STATUS.md`](../development/PROJECT_STATUS.md) | Current session snapshot |
| [`docs/development/REPLIT_ENGINEERING_LOG.md`](../development/REPLIT_ENGINEERING_LOG.md) | Session history |
| [`START_HERE.md`](../../START_HERE.md) | Onboarding and session rules |

---

*Update this file when a phase completes or scope changes. Phases do not move backward.*
