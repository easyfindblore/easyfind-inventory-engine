# TEST HANDOVER DOCUMENT
# EasyFind Inventory Engine

> **FOR: Manus AI — Test Engineering Lead**
> **FROM: Replit Engineering**
> **Date: 2026-07-03 | Engineering Session: 003**

This document transfers the repository to Manus for full validation.
It contains everything required to design, execute, and report on the test suite.

---

## 1. Repository Status

| Item | Status |
|------|--------|
| All source modules | ✅ Implemented and compilable |
| Dependencies | ✅ Installed (`npm install`) |
| Application startup | ✅ Clean — no errors on `npm start` |
| Webhook GET verification | ✅ Implemented with token check |
| Webhook POST processing | ✅ Parses JSON body, ACKs 200, async processing |
| Parser | ✅ All Doc 02 fields implemented |
| Normalizer | ✅ All Doc 03 mapping rules implemented |
| Session manager | ✅ 30-min timeout, one session per sender |
| Google Sheets service | ✅ Read / append / update / findByPid |
| Cloudinary service | ✅ Upload / uploadAll / delete |
| WhatsApp service | ✅ sendTextMessage / downloadMedia |
| PID generator | ✅ Deterministic date+sequence format |
| Graceful shutdown | ✅ SIGTERM / SIGINT with 10s force-exit |
| Health endpoint | ✅ `GET /health` returns JSON |
| Render config | ✅ `render.yaml` present and correct |
| GitHub push | ❌ Blocked — GitHub OAuth not configured |
| Render deployment | ❌ Blocked — depends on GitHub push |
| Live credentials | ❌ None configured — credentials required for live tests |

---

## 2. Implemented Modules

### 2.1 `src/parser/messageParser.js`
Extracts structured property fields from free-form WhatsApp text.

- **Strategy:** Order-independent. Fields found by regex, not position. Latest-value-wins (lastMatch).
- **Fields extracted:** bhk, bathrooms, balcony, utility, furnishing, rent, maintenance, deposit, size, floor, availableFrom, tenantType, petsFriendly, apartmentType (community), location, societyName, mapsLink, vegNonVeg, negotiation, visitTimings, availability, onboardingType.
- **Amount parsing:** "60k" → 60000, "1.5L" → 150000, "2 Lakh" → 200000.
- **Balcony parsing:** "Huge/Large/Spacious Balcony" → 1. "2 Balconies" → 2. "One Balcony" → 1.
- **Deposit parsing:** "2 Months" → rent × 2. Fixed amount → numeric value.
- **Null policy:** Missing fields remain `null`. Parser never guesses.
- **Error handling:** All parsing wrapped in try/catch. Parse errors logged, result returned with whatever was extracted.

### 2.2 `src/normalizer/normalizer.js`
Converts parsed raw values to Google Sheets dropdown-compliant values.

- **Apartment Type mapping (community):**
  - Gated Community: "gated", "gated community", "gated apartment", "gated society", "gated residential", "gated complex", "gated enclave", "gated project", "gated layout", "apartment", "apartment complex", "residential apartment", "residential complex"
  - Semi Gated: "semi gated", "semi-gated", "semi gated community", "semi gated complex", "semi gated society", "semi gated layout", "semi" — EXCLUDES anything containing "furnished"
  - Stand Alone: "stand alone", "standalone", "independent house", "independent villa", "villa", "duplex villa", "independent floor", "row house", "row villa", "bungalow", "plot", "open plot", "penthouse", "farm house", "builder floor", "kothi"
  - Unknown values → null (never guessed)
- **Furnishing mapping:** FF / fully → Fully Furnished; SF / semi → Semi Furnished; partial → Partially Furnished; UF / unfurnished → Unfurnished. Unknown → null.
- **BHK:** Parser already produces "2 BHK" / "1 RK". Normalizer validates format, returns null if invalid.
- **Pets:** yes / allowed → Yes; no / not allowed → No. Unknown → null.
- **Society name:** Title-case applied. Stand Alone landmarks (near/opposite/next to...) → null.
- **Amounts:** Already numeric from parser. `normalizeAmount` rounds to integer.
- **Null policy:** Unknown categorical values return null, never a guess.

### 2.3 `src/session/sessionManager.js`
In-memory session store. Singleton.

- **Key:** sender phone number (string, as received from Meta).
- **Timeout:** 30 minutes of inactivity. Cleanup runs every 5 minutes.
- **States:** IDLE (no session), ADD_PROPERTY, ADD_MEDIA, PROCESSING.
- **Commands (case-insensitive, whole message):** Add Property / New Property / Inventory Add / Start Property / Create Listing; Add Photos / Add Media / Upload Photos; Done / Finish / Complete / Submit / End; Cancel / Stop / Exit / Abort.
- **`lockForProcessing(senderPhone)`:** Sets state to PROCESSING. Returns snapshot (deep copy of session data).
- **`unlockSession(senderPhone)`:** Reverts state to ADD_PROPERTY (used after validation failure).
- **`destroySession(senderPhone)`:** Deletes session from map. Safe to call multiple times.
- **`getSummary(senderPhone)`:** Returns `{textCount, imageCount, videoCount, state}` for user feedback.

### 2.4 `src/controllers/webhookController.js`
Orchestrates the full property addition flow.

**Add Property flow:**
1. User sends "Add Property" → session created.
2. User sends text messages, images, videos, location → accumulated in session.
3. User sends "Done" → `lockForProcessing` called.
4. Text merged and parsed.
5. Parsed fields normalized.
6. **Mandatory field validation:** location, rent, apartmentType required. If any missing → session unlocked (not destroyed), user told to add missing details and type Done again.
7. Media downloaded from WhatsApp (all must succeed).
8. PID generated inside lock (see sheets.js).
9. Media uploaded to Cloudinary with confirmed PID.
10. Row appended to Google Sheets.
11. Session destroyed. Success reply sent.

**Add Media flow:**
1. User sends "Add Photos" → ADD_MEDIA session created.
2. User sends a valid PID → validated against Sheets, stored in session.
3. User sends images/videos → accumulated.
4. User sends "Done" → existing URLs fetched, new media downloaded, uploaded, Sheets updated.
5. Session destroyed.

**Required fields:** `location`, `rent`, `apartmentType`. Submission blocked if any are null.

**Fail-closed invariants:**
- Any media download failure → abort, no Cloudinary upload, no Sheets write.
- Any Cloudinary upload failure → abort, no Sheets write.
- Any Sheets write failure → session destroyed, error reply sent.

### 2.5 `src/services/sheets.js`
Google Sheets integration. Google Sheets is the only database.

- **`getAllRows()`:** Reads all rows from the sheet. Returns null on error.
- **`appendProperty(property, pid, imageUrls, senderPhone, messageId)`:** Appends a row in `COLUMN_ORDER`. Returns boolean.
- **`findByPid(pid)`:** Reads all rows, finds by PID column (A). Returns `{rowIndex, data}` or null.
- **`updateImageUrls(rowIndex, imageUrls)`:** Updates imageUrls (AD) and lastUpdated (X) columns. Returns boolean.
- **`generatePIDAndAppend(property, getImageUrls, senderPhone, messageId)`:** Serialized via in-process promise mutex (`_pidLock`). Reads row count → generates PID → calls `getImageUrls(pid)` callback → appends row. **Fails closed if `getAllRows()` returns null** (throws immediately, preventing Cloudinary upload with orphaned media).
- **Column order:** Defined by `COLUMN_ORDER` array — 31 columns A through AE.

### 2.6 `src/services/cloudinary.js`
Media upload to Cloudinary. Never stores files locally.

- **`uploadMedia(buffer, pid, type, index)`:** Uploads single file via upload stream. Returns secure URL or null.
- **`uploadAllMedia(pid, mediaItems, existingImageCount)`:** Iterates items, uploads each. Returns `{urls, failCount}`.
- **Public ID format:** `inventory/{PID}_img{001}` for images, `inventory/{PID}_vid{001}` for videos. Deterministic, 1-based index, zero-padded to 3 digits.
- **Idempotent:** `overwrite: true` means re-uploading the same PID+index replaces the asset.

### 2.7 `src/services/whatsapp.js`
Meta WhatsApp Cloud API client.

- **`sendTextMessage(to, text)`:** Sends plain text. Returns null and logs if credentials missing.
- **`downloadMedia(mediaId)`:** Step 1: GET media metadata URL. Step 2: GET binary file. Returns `{buffer, mimeType}` or null.
- **`RESPONSES`:** Pre-built response templates for all user-facing messages.

### 2.8 `src/utils/pidGenerator.js`
- **`generatePID(date, sequence)`:** Format `PID{YY}{MM}{DD}{NNN}`. e.g. `PID260703001`.
- **`generateMediaPublicId(pid, type, index)`:** Format `inventory/{PID}_{type}{NNN}`.

### 2.9 `src/routes/webhook.js`
- **GET /webhook:** Returns `hub.challenge` if `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`. 403 otherwise.
- **POST /webhook:** Parses raw JSON body, responds 200 immediately to Meta, processes asynchronously.

### 2.10 `src/config/config.js`
- **`validateConfig()`:** Returns array of warning strings for missing credentials. Does NOT crash the process. Individual services fail gracefully.
- **`config.google.serviceAccountJson`:** Parsed from `GOOGLE_SERVICE_ACCOUNT_JSON` env var. Returns null if not set or invalid JSON.

---

## 3. Known Limitations

| ID | Limitation | Notes |
|----|-----------|-------|
| L001 | In-memory sessions only | Sessions lost on restart. By design for this phase. |
| L002 | Single-instance PID lock only | `_pidLock` is in-process. Multi-instance deployments would have PID collision risk. Render is single-instance. |
| L003 | No duplicate detection | Spec deferred to Phase 7. Unique key is written but not checked on submission. |
| L004 | No full dropdown validation | Only mandatory field presence checked. Full categorical validation deferred to Phase 7. |
| L005 | No AI parsing fallback | OpenAI interface is disabled placeholder. Standard regex parser only. |
| L006 | uuid moderate vulnerability | `uuid < 11.1.1` via `googleapis`. Fixed by upgrading to `googleapis@173` (breaking change). Deferred until googleapis API compatibility verified. |
| L007 | GOOGLE_SHEET_NAME defaults to "Live Tracking" | If the sheet tab is named differently, the integration will silently read/write the wrong tab. |
| L008 | No retry mechanism for transient API failures | WhatsApp, Cloudinary, and Sheets calls fail immediately with no retry. |
| L009 | Missing fields → session unlocked, not destroyed | User told to add missing details and type Done. Previous session text/media retained. |

---

## 4. Engineering Assumptions

1. **Single Render instance.** The in-process mutex in `generatePIDAndAppend` is sufficient only for one running server instance. Horizontal scaling requires an external distributed lock.
2. **WhatsApp message IDs are globally unique.** Used as-is in the `messageId` column. Not validated.
3. **Sender phone numbers are stable per agent.** Sessions are keyed by phone number exactly as received from Meta (no normalization applied to the key).
4. **Google Sheet has a header row at row 1.** `getAllRows()` skips index 0 when scanning PIDs. The header row values are not validated.
5. **Column order in the sheet matches `COLUMN_ORDER` exactly.** Any discrepancy will cause data to appear in wrong columns.
6. **Media files fit in memory.** WhatsApp media is downloaded as a Buffer. No streaming or chunked handling for large files.
7. **Cloudinary upload is idempotent.** `overwrite: true` means re-submitting the same PID+index updates the asset silently.
8. **Meta always sends valid JSON in the webhook POST body.** JSON parse failure returns 400 but is not expected in normal operation.

---

## 5. Engineering Decisions

| Decision | Rationale |
|---------|-----------|
| `express.raw()` for webhook POST | Delivers raw Buffer to handler for correct JSON parsing. |
| In-process promise mutex for PID | Prevents duplicate sequence numbers in concurrent sessions on a single instance. |
| `getAllRows()` fail-closed guard | If Sheets is unreadable, PID generation aborts before any Cloudinary upload. Prevents orphaned media. |
| Winston logger | Structured JSON-compatible logging with level control. No file transports — Render captures stdout. |
| `overwrite: true` on Cloudinary | Idempotent re-upload on retry. Deterministic naming means same file, same slot. |
| OpenAI disabled by flag | `config.openai.enabled = false` hardcoded. Cannot be enabled by env var alone. |
| Latest-value-wins in parser | Allows agents to correct previously stated values by sending updated text in same session. |
| Session unlock on validation failure | Session retains accumulated data; user can add missing details and type Done again without restarting. |

---

## 6. Mandatory Invariants

These must NEVER be violated. Test all of them aggressively.

1. **No partial writes.** If Cloudinary upload fails → no Sheets row written. If Sheets write fails → no orphaned media (media already uploaded; this is the only acceptable exception — see L002).
2. **Sheets read failure → abort immediately.** `generatePIDAndAppend` throws if `getAllRows()` returns null. No PID generated, no media uploaded.
3. **No secrets in logs.** `WHATSAPP_ACCESS_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `CLOUDINARY_API_SECRET` must never appear in log output.
4. **One session per sender.** `startAddPropertySession` replaces any existing session. Two concurrent sessions from the same sender cannot coexist.
5. **Session destroyed on success, cancel, and critical failure.** Only on validation failure is the session unlocked (not destroyed) so the user can correct input.
6. **PID uniqueness within a day.** Sequence number = (count of today's rows + 1). Lock held from read through write.

---

## 7. Expected Parser Behaviour

### Rent
| Input | Expected |
|-------|---------|
| `Rent: 60k` | 60000 |
| `Rent - ₹60,000` | 60000 |
| `Rent: 1.5L` | 150000 |
| `Rent: 2 Lakh` | 200000 |
| `Rent: 20,000` | 20000 |

### Deposit
| Input | Expected |
|-------|---------|
| `Deposit: 2L` | 200000 |
| `Deposit: 2 Months` (rent=60k) | 120000 |
| `Deposit: 80K` | 80000 |
| `Deposit: 3 months` (rent=null) | null (cannot calculate) |

### BHK
| Input | Expected |
|-------|---------|
| `2 BHK` | "2 BHK" |
| `2BHK` | "2 BHK" |
| `2-BHK` | "2 BHK" |
| `1 RK` | "1 RK" |

### Balcony
| Input | Expected |
|-------|---------|
| `2 Balconies` | 2 |
| `One Balcony` | 1 |
| `Huge Balcony` | 1 |
| `Large Balcony` | 1 |
| `Spacious Balcony` | 1 |

### Latest-value-wins
| Input | Expected |
|-------|---------|
| `Rent: 60k ... Rent: 65k` | 65000 |
| `3 BHK ... 2 BHK` | "2 BHK" |

---

## 8. Expected Normalizer Behaviour

### Apartment Type
| Input | Expected output |
|-------|----------------|
| "gated" | Gated Community |
| "gated community" | Gated Community |
| "gated apartment" | Gated Community |
| "gated society" | Gated Community |
| "gated residential" | Gated Community |
| "gated complex" | Gated Community |
| "apartment" | Gated Community |
| "residential complex" | Gated Community |
| "semi gated" | Semi Gated |
| "semi-gated" | Semi Gated |
| "semi" | Semi Gated |
| "stand alone" | Stand Alone |
| "standalone" | Stand Alone |
| "independent house" | Stand Alone |
| "villa" | Stand Alone |
| "row house" | Stand Alone |
| "bungalow" | Stand Alone |
| "plot" | Stand Alone |
| "penthouse" | Stand Alone |
| "farm house" | Stand Alone |
| "builder floor" | Stand Alone |
| "kothi" | Stand Alone |
| "semi furnished" | **null** (excluded — "furnished" triggers exclude rule) |
| "unknown type" | null |

### Furnishing
| Input | Expected |
|-------|---------|
| "fully furnished" | Fully Furnished |
| "ff" | Fully Furnished |
| "semi furnished" | Semi Furnished |
| "sf" | Semi Furnished |
| "partially furnished" | Partially Furnished |
| "unfurnished" | Unfurnished |
| "uf" | Unfurnished |
| "partially" | null (not matched) |

### Society Name Normalization (Stand Alone)
| Input | apartmentType | Expected |
|-------|--------------|---------|
| "Near Metro Station" | Stand Alone | null (landmark prefix) |
| "Opposite Lulu Mall" | Stand Alone | null (landmark prefix) |
| "Green Valley Estates" | Stand Alone | "Green Valley Estates" |
| "Green Valley Estates" | Gated Community | "Green Valley Estates" |

---

## 9. Session Behaviour

### Normal Flow
```
User: Add Property
Engine: 🏡 Property Addition Started...
User: [sends text with property details]
Engine: 📝 Property details received.
User: [sends photos]
Engine: 📸 Received! Current Media: 2 Images
User: Done
Engine: ⏳ Processing Property...
  → Parse → Normalize → Download media → Upload Cloudinary → Append Sheets
Engine: ✅ Property Added Successfully. PID: PID260703001
```

### Validation Failure Flow (Missing Fields)
```
User: Done
Engine: Checks → location missing
  → Session UNLOCKED (not destroyed, text/media retained)
Engine: ❌ Property could not be added. Missing: Location. Please send missing details and type Done again.
User: Location: Koramangala
Engine: 📝 Property details received.
User: Done
  → Re-parses accumulated text → location now found → proceeds
```

### Cancel Flow
```
User: Cancel
  → Session DESTROYED immediately (any state)
Engine: ❌ Property addition cancelled. Nothing was saved.
```

### Timeout
- Session expires after 30 minutes of inactivity.
- Cleanup sweeps every 5 minutes.
- No expiry notification is sent to the user.

### Add Media Flow
```
User: Add Photos
Engine: Please send the PID...
User: PID260703001
  → findByPid → found → session.targetPid = "PID260703001"
Engine: Property PID260703001 found. Now send your photos and videos.
User: [sends photos]
User: Done
  → Download → Upload Cloudinary → updateImageUrls in Sheets
Engine: ✅ Existing Property Updated. PID260703001. Added 2 Files. Total Media: 5.
```

---

## 10. Deployment Assumptions

| Item | Value |
|------|-------|
| Runtime | Node.js ≥ 18 |
| Platform | Render (single web service instance) |
| Build | `npm install` |
| Start | `npm start` (node src/index.js) |
| Port | 3000 (configurable via PORT env var) |
| Health check | `GET /health` → 200 JSON |
| Signal handling | SIGTERM / SIGINT → graceful shutdown → 10s force exit |
| Scaling | Single instance assumed. Multi-instance requires distributed PID lock. |
| GitHub | Auto-deploy from `main` branch (blocked until PAT configured). |

---

## 11. Current Known Bugs

| ID | Bug | Severity | Status |
|----|-----|---------|--------|
| B001 | GitHub OAuth not configured — push blocked | HIGH | Open — requires user action |
| B002 | No live credentials — integrations untested end-to-end | HIGH | Open — requires user action |
| B003 | uuid moderate vulnerability via googleapis transitive dep | MEDIUM | Deferred — upgrading googleapis is a breaking change |
| B004 | No retry on transient API failures | MEDIUM | By design for this phase |
| B005 | No session persistence across restarts | LOW | By design — in-memory |

---

## 12. Areas Requiring Aggressive Testing

### Parser
- **Edge cases for all amount formats.** Test every combination of k/K/l/L/lakh/lakhs/thousand with and without spaces, commas, ₹ prefix.
- **Deposit × months when rent appears after deposit.** Parser processes top-to-bottom; if deposit matches before rent, months-based calculation cannot proceed. Test ordering edge cases.
- **Overlapping regex patterns.** E.g. "2 bathrooms" could match BHK pattern if regex is loose. Verify no cross-contamination.
- **Multi-message sessions.** Text accumulated across multiple messages — verify latest-value-wins works across message boundaries.
- **Non-standard whitespace.** Tabs, double spaces, Unicode whitespace in messages.
- **Mixed-language text.** Numbers in English within non-English text.
- **Adversarial inputs.** Very long messages, messages with no extractable fields, messages with all fields, ReDoS attempts with deeply nested patterns.

### Normalizer
- **"Semi furnished" must NEVER map to Semi Gated.** This is the `exclude` rule — verify it holds.
- **All apartment type variants.** Test every value in the mapping table above. Test unknown values return null.
- **Society name with punctuation.** Apostrophes, hyphens, all-caps names.
- **Stand Alone landmark suppression.** All landmark prefixes (near, opposite, next to, behind, beside, adjacent to).

### Session
- **Concurrent sessions from different senders.** Verify sessions do not bleed data between senders.
- **Session replacement.** Start a session, send data, start another session — verify old data is discarded.
- **Timeout boundary.** Session at exactly 30 minutes — should be expired. At 29:59 — should be alive.
- **Done with no session.** Send "Done" with no active session — should return unknown command.
- **Cancel from any state.** Cancel during ADD_PROPERTY, ADD_MEDIA, PROCESSING.
- **Validation failure + retry.** Trigger missing field error, add missing field, Done again — verify it succeeds.

### Sheets Integration
- **Fail-closed on null rows.** Mock `getAllRows` returning null — verify `generatePIDAndAppend` throws and no media is uploaded.
- **Concurrent PID generation.** Simulate two concurrent `generatePIDAndAppend` calls — verify PIDs are sequential, not duplicate.
- **Column mapping.** Verify all 31 columns land in correct positions.
- **`findByPid` for non-existent PID.** Should return null without throwing.
- **`updateImageUrls` with empty array.** Should write empty string, not crash.

### Webhook
- **Hub challenge verification.** Wrong token → 403. Correct token → 200 with challenge value.
- **Non-WhatsApp webhook events.** `payload.object !== 'whatsapp_business_account'` — should be ignored silently.
- **Empty entries array.** `payload.entry = []` — should process without error.

### End-to-End
- **Full property submission with all fields.** Verify Sheets row has correct data in every column.
- **Submission with media only.** No text, just images — required field check should fire.
- **Submission with text and media.** All fields present — should succeed, Cloudinary URLs in sheet.
- **Add Media to existing PID.** Upload new media — verify URLs appended, old URLs retained.
- **Add Media to invalid PID.** Should return error, no crash.

---

## 13. Expected Outputs

### Successful Property Addition
- Sheets row appended with PID in column A.
- Cloudinary URLs in column AD (comma-separated).
- All extracted/normalized fields in correct columns.
- `dateAdded`, `lastUpdated`, `messageId`, `senderPhone`, `rawMessage`, `uniqueKey` populated.
- WhatsApp reply: `✅ Property Added Successfully` with PID and field list.

### PID Format
```
PID{YY}{MM}{DD}{NNN}
e.g. PID260703001  — first property on 2026-07-03
     PID260703002  — second property same day
     PID260704001  — first property on 2026-07-04
```

### Cloudinary Public ID Format
```
inventory/{PID}_img001   — first image
inventory/{PID}_img002   — second image
inventory/{PID}_vid001   — first video
inventory/{PID}_vid002   — second video
```

---

## 14. Areas Where Breaking the System Is Encouraged

Manus should actively attempt to break the following:

1. **PID collision** — Submit two properties simultaneously. Do PIDs collide? Is the in-process lock actually effective?
2. **Orphaned media** — Force a Sheets write failure after Cloudinary succeeds. Is there a Cloudinary asset with no matching sheet row?
3. **Session bleed** — Two senders, interleaved messages. Does data from sender A appear in sender B's submission?
4. **Validation bypass** — Submit with location set to whitespace-only, empty string, or unicode invisible characters. Does the mandatory field check catch it?
5. **Signature bypass** — Send a webhook POST in production without a signature, with a wrong signature, with a replayed signature from a previous request.
6. **Regex injection** — Send a message designed to break the parser's `lastMatch` RegExp construction. (Pattern source is static — but message content is dynamic input to `text.matchAll`.)
7. **Apartment type ambiguity** — "semi furnished gated community" — does `community` extraction parse correctly AND does normalizer handle "semi" without triggering the Semi Gated exclude rule?
8. **Deposit race** — Send "Deposit: 3 Months" in message 1, "Rent: 60k" in message 2. Does deposit calculate correctly on Done (latest-value-wins across merged text)?
9. **Session timeout during processing** — Trigger a long-running Cloudinary upload. Does session expire mid-processing? (Expected: PROCESSING state does not expire session, but `lockForProcessing` does not reset TTL either — this is a latent bug worth testing.)
10. **Sheets unavailable** — Call Done when Google Sheets API is timing out. Does the system fail closed? Does the user get a clear error?

---

## 15. Cross-References

| Document | Purpose |
|----------|---------|
| `docs/contracts/02_column_contract.md` | Parser field extraction rules |
| `docs/contracts/03_mapping_rules.md` | Normalizer mapping rules |
| `docs/specs/04_property_message_formats.md` | WhatsApp message examples |
| `docs/specs/06_whatsapp_session_flow.md` | Session state machine spec |
| `docs/specs/07_duplicate_detection_specification.md` | Duplicate detection (not yet implemented) |
| `docs/specs/08_media_processing_specification.md` | Cloudinary media naming and upload spec |
| `docs/specs/09_google_sheet_operations.md` | Sheets operations spec |
| `docs/architecture/10_system_architecture.md` | System design |
| `docs/development/PROJECT_STATUS.md` | Current project state |
| `docs/development/REPLIT_ENGINEERING_LOG.md` | Full engineering history |

---

*This document is the official handover from Replit Engineering to Manus Test Engineering.*
*The repository is now ready for full validation.*
*Manus must not modify source code, engineering docs, or infrastructure configuration.*

---

*End of TEST_HANDOVER.md*
