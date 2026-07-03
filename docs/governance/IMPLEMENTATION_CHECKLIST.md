# IMPLEMENTATION CHECKLIST
# EasyFind Inventory Engine

> **Use these checklists at the start of every session and before every deployment.**

---

## Pre-Session Checklist (Run Before Writing Any Code)

- [ ] Read `START_HERE.md` — confirm you understand current blockers and rules
- [ ] Read `docs/development/PROJECT_STATUS.md` — know what phase you are in
- [ ] Read the last entry in `docs/development/REPLIT_ENGINEERING_LOG.md` — know what the previous session did
- [ ] Check `docs/governance/implementation_tracker.md` — know which tasks are in progress
- [ ] Identify the relevant spec document for your task (see table in `START_HERE.md`)
- [ ] Read that spec document before writing code
- [ ] Confirm the workflow `Start application` is running cleanly (`npm start`, port 3000)

---

## Per-Module Implementation Checklist

### Parser (`src/parser/messageParser.js`)
- [ ] Each field uses `lastMatch()` — latest value in message wins (Doc 02, §Order Independence)
- [ ] All fields from Doc 02 column contract are extracted
- [ ] Balcony descriptors: "Huge/Large/Spacious Balcony" → `1`
- [ ] Numeric amounts: "60k" → `60000`, "2L" → `200000`, "2 Lakh" → `200000`
- [ ] Deposit periods: "3 Months" → `3`, "2 Months" → `2`
- [ ] Unit test written for each Doc 04 example message format

### Normalizer (`src/normalizer/normalizer.js`)
- [ ] All Doc 03 mapping rules applied
- [ ] Society name: title-case capitalization
- [ ] Apartment type matches allowed values from Doc 01
- [ ] Furnishing status matches allowed values
- [ ] BHK is an integer (not "3 BHK")
- [ ] Pets, parking are boolean-mapped correctly

### Session Manager (`src/session/sessionManager.js`)
- [ ] One session per sender (phone number is key)
- [ ] 30-minute inactivity timeout
- [ ] Periodic cleanup running (no memory leak)
- [ ] Session destroyed on DONE, CANCEL, and media upload completion
- [ ] Re-starting a session mid-flow resets cleanly

### Webhook Controller (`src/controllers/webhookController.js`)
- [ ] Media upload failure blocks Sheets write (fail-closed)
- [ ] `updateImageUrls` return value checked in Add Media flow
- [ ] PID confirmed unique before commit
- [ ] All user-facing reply messages match the agreed wording from Doc 06
- [ ] Error replies clearly state what went wrong and what to do next

### Google Sheets (`src/services/sheets.js`)
- [ ] Column order matches Doc 02 exactly
- [ ] `generateNextPID` called within promise-chain lock (race-safe)
- [ ] `appendProperty` confirms write before returning
- [ ] `updateImageUrls` returns `true` on success, `false` on failure
- [ ] `findByPid` handles "not found" without throwing

### Cloudinary (`src/services/cloudinary.js`)
- [ ] Public ID format: `PID{YYMMDD}{NNN}_img{001}` (deterministic, from `pidGenerator.js`)
- [ ] `uploadAllMedia` returns `{ urls, failCount }`
- [ ] `failCount > 0` is checked by caller; caller aborts on any failure
- [ ] Images downloaded from WhatsApp before upload (not re-fetched)

### Webhook Route (`src/routes/webhook.js`)
- [ ] GET: returns `hub.challenge` when `hub.verify_token` matches
- [ ] POST: HMAC-SHA256 validated before processing
- [ ] Fail-closed in production: missing `WHATSAPP_APP_SECRET` → reject all POST
- [ ] `timingSafeEqual` length guard in place (no crash on mismatched buffer lengths)
- [ ] Always returns 200 to Meta (even on processing error) to prevent retry floods

---

## End-of-Session Checklist (Before Marking Complete)

- [ ] All changed files tested (workflow restarts cleanly, no startup errors)
- [ ] `docs/development/REPLIT_ENGINEERING_LOG.md` updated with new session block (`## SESSION 00N`)
- [ ] `docs/development/PROJECT_STATUS.md` updated (phase %, blockers, completed modules)
- [ ] `docs/governance/implementation_tracker.md` updated (task statuses)
- [ ] All changes staged and committed (`git add -A && git commit -m "..."`)
- [ ] No secrets or credentials in any committed file
- [ ] Code review performed (code-review subagent)

---

## Pre-Deployment Checklist (Run Before Render Goes Live)

### GitHub
- [ ] GitHub PAT configured and `git push origin main` succeeds
- [ ] `main` branch reflects all current code
- [ ] No `.env` file committed (only `.env.example`)
- [ ] `render.yaml` present and correct

### Render Dashboard
- [ ] Service name: `easyfind-inventory-engine`
- [ ] Build command: `npm install`
- [ ] Start command: `npm start`
- [ ] Health check path: `/health`
- [ ] All environment variables set:
  - [ ] `NODE_ENV=production`
  - [ ] `WHATSAPP_ACCESS_TOKEN`
  - [ ] `WHATSAPP_PHONE_NUMBER_ID`
  - [ ] `WHATSAPP_VERIFY_TOKEN`
  - [ ] `WHATSAPP_APP_SECRET`
  - [ ] `GOOGLE_SPREADSHEET_ID`
  - [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` (full JSON, single line)
  - [ ] `CLOUDINARY_CLOUD_NAME`
  - [ ] `CLOUDINARY_API_KEY`
  - [ ] `CLOUDINARY_API_SECRET`

### Meta Developer Console
- [ ] Webhook URL: `https://<render-url>/webhook`
- [ ] Verify token matches `WHATSAPP_VERIFY_TOKEN`
- [ ] Meta sends GET challenge → logs show `hub.challenge` returned
- [ ] Subscribe to `messages` webhook field

### Smoke Test (After Deployment)
- [ ] `GET https://<render-url>/health` → `{"status":"ok",...}`
- [ ] Send a WhatsApp message from a test number → session created (check Render logs)
- [ ] Send complete property details → row appears in Google Sheet
- [ ] Send photos → Cloudinary URLs appear in Image URL column
- [ ] Send "Done" → agent receives confirmation reply

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [`START_HERE.md`](../../START_HERE.md) | Session rules and file map |
| [`docs/governance/ROADMAP.md`](ROADMAP.md) | Phase-level plan |
| [`docs/governance/implementation_tracker.md`](implementation_tracker.md) | Task-level status |
| [`docs/development/PROJECT_STATUS.md`](../development/PROJECT_STATUS.md) | Current state |
| [`docs/development/WEBHOOK_INCIDENT_REPORT.md`](../development/WEBHOOK_INCIDENT_REPORT.md) | Deployment verification steps |

---

*This checklist is a living document. Add items when you find gaps. Never remove items.*
