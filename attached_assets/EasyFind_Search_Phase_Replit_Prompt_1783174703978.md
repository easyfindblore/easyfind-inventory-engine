# Prompt for Replit Agent — EasyFind Phase 2: Inventory Search

Paste everything below into the Replit agent as one instruction. It is written against
the **actual current repo** (`easyfind-inventory-engine`, plain Node.js + Express,
CommonJS, no TypeScript, no Redis, no OpenAI wired in yet), not the earlier
speculative architecture docs. Where those docs (SAD/PRD/TDS) assumed something
that doesn't match this repo, this prompt overrides them — that's called out
explicitly below so you don't "fix" it back.

---

## 0. Golden rule — two phases, one house, no mingling

Inventory **Add** and Inventory **Search** are two independent features that
happen to live in the same webhook and the same repo. Search must **never**
modify `inventoryController.js`, `sessionManager.js` (the Add-flow session
machine), `draftStore.js`, `normalizer.js`, `messageParser.js`, or the write
path in `sheets.js` (`generatePIDAndAppend`, `updateImageUrls`, `findByPid`).
Those are Phase 1, done, frozen.

Search gets its **own** session state, its **own** trigger words, its own
read-only Sheets access, and its own files. The only shared surface is the
top-level menu and the webhook dispatcher (`webhookController.js`), which
just needs to learn to route to a second module.

---

## 1. Fix the entry menu (small, do this first)

Today, `src/inventory/inventoryResponses.js` → `mainMenu()` says:

> "Type *2* or *Add Inventory* to add a new property."

Search doesn't exist yet, so it never offers a search option. Change it to
present both, and add "Search Property" as a real trigger:

- New `mainMenu()` copy: something like
  `"🏠 Welcome to EasyFind!\n\nWhat would you like to do?\n\n1️⃣ Search Property\n2️⃣ Add Inventory\n\nJust type 1 or 2, or say what you're looking for."`
- Keep `2` / "Add Inventory" routing to the existing flow — don't touch that.
- Add `1` / "Search Property" / "Search" as new triggers that hand off to the
  new search module (§3).
- **Important nuance**: a customer typing straight into a fresh chat with
  something like `"2bhk bellandur"` should be treated as an implicit
  **Search** trigger too — don't force them through the numbered menu if
  they clearly stated a property need. Broker/onboarding-style trigger words
  (`Add`, `Inventory`, `2`) stay reserved for the Add flow; anything else
  that isn't a recognized command and isn't mid-session in the Add flow
  should fall through to the search intent parser, which itself decides
  whether it has enough to search or needs to ask one clarifying question.

Route this in `webhookController.js`: check `inventoryController.tryHandleMessage()`
first (unchanged, higher priority so an active Add session is never hijacked),
then check the new `searchController.tryHandleMessage()`, then fall through to
the legacy Add Media/Delete Media code that's already there.

---

## 2. Data reality — read from `Live Tracking` only, and defend against its known issues

The live Google Sheet (`Live Tracking` tab) is the only source of truth for
search. Do **not** read `Broker Panel`, `Sheet22`, `Sheet9`, `Sheet12`, or any
other tab — those are scratch/legacy and out of scope.

The column order is already defined in `src/services/sheets.js` as
`COLUMN_ORDER` — reuse that exact list for reading, don't invent new field
names. Build a new **read-only** function, e.g. `getAllProperties()` in
`sheets.js` (or a new `sheetsReader.js` if you'd rather not grow `sheets.js`
further — your call, but don't duplicate the `COLUMN_ORDER` array, import it).

Known real-world issues in this data that the search engine **must** handle,
found by directly inspecting the live sheet:

1. **PID is not guaranteed unique.** `EF-20260704-000005` currently exists
   twice (two different properties). Search results must be built and
   displayed using the **row index** as the true unique handle internally
   (never trust PID alone to fetch "the one property" — always resolve by
   row, and if a PID is ambiguous, use the most recently added row with that
   PID and log a warning). This is a defensive read-time fix; the write-side
   PID-generation bug is separate and out of scope for this task.
2. **`Availability` must be respected.** Only rows where `availability`
   (column V) is exactly `Available` are eligible for search. `Delayed` and
   `Rented out` must never appear in results.
3. **`Available From` (column S) is messy free text**, not a clean date:
   Excel serial numbers (e.g. `46235`), leaked partial text
   (`"abl from : August 3"`), ordinal fragments (`"25th"`), and normal phrases
   (`"Immediately"`, `"Ready to occupy"`). Write a small normalizer
   (`availabilityNormalizer.js`) that:
   - Converts Excel serials to real dates (serial date epoch: Dec 30 1899).
   - Recognizes `Immediate(ly)`, `Ready to occupy`, `Easy to occupy` → "Ready now".
   - Extracts a date if one is embedded in noisy text, otherwise falls back
     to displaying the original string verbatim rather than guessing — never
     invent a date that isn't there.
   - This is a **display/sort** concern, not a hard filter — don't exclude a
     property just because this field is messy.
4. **Tenant Type compatibility, not exact-match.** The real LOV (`Sheet
   Structure` tab) has values like `Family Only`, `Family & Bachelors
   Females`, `Family & Bachelors Males`, `Only Bachelors`, `Hindu Family`,
   `Vegetarian Family`, etc. When a customer says "family", match every
   value that includes family-friendliness and **exclude** `Only Bachelors`.
   When they say "bachelor", exclude `Family Only`, `Vegetarian Family`,
   `Hindu Family`. Build this as a small compatibility table, not a single
   string-contains check — e.g.:
   ```js
   // tenantCompatibility.js
   const FAMILY_EXCLUDES = ['Only Bachelors'];
   const BACHELOR_EXCLUDES = ['Family Only', 'Vegetarian Family', 'Hindu Family'];
   ```
5. **Video vs image — trust the URL, not a count column.** `imageUrls`
   (column AD) is a comma-separated list mixing Cloudinary image and video
   URLs. Classify by substring: `/video/upload/` → video, `/image/upload/`
   → image. Don't rely on any "video count" column since one doesn't
   reliably exist for every row.
6. **Location aliasing already exists — use it.** The `Location Mapping` tab
   (~40 master localities with alias/typo lists, e.g. `kasa`, `kasavanhalli`,
   `kasvanahalli` → `Kasavanahalli, Sarjapur Road`) is currently unused by
   anything. Load it once at startup (cached in memory, refreshed on the same
   interval as the property cache, §5) and use it to resolve whatever
   locality text the customer typed — including partial/misspelled input —
   to a master location before filtering. This directly replaces any
   speculative "localityClusters.ts" concept from earlier planning docs;
   the sheet is the source of truth, don't hardcode a duplicate list in code.
7. **Duplicate consecutive text blocks inside `Raw Message`.** Several real
   rows have the same property description pasted twice into one cell
   (copy-paste artifact from onboarding). This only matters if you ever
   surface `rawMessage` directly — don't; always build the customer-facing
   card text from the structured columns (BHK, rent, location, etc.), never
   from `rawMessage`.

None of the above needs the onboarding/Add side to change. If you also want
the two small corrections already flagged separately (PID-generation
collision fix, adding "Independent House" as a 4th Apartment Type) — those
are Phase 1 fixes, not part of this task, and should be a separate PR against
`inventoryController.js` / the Sheet's data-validation dropdown, not mixed
into this one.

---

## 3. Search engine — the actual logic (keep it this simple)

Five steps. Don't over-engineer this into a scoring framework on day one —
get this working end-to-end first, tune weights later.

1. **Parse intent from free text.** BHK, budget (max, and min if stated),
   location (raw text → resolved via Location Mapping), furnishing, pets,
   tenant type, "family"/"bachelor" signal. No AI call needed for v1 — write
   a rule-based parser (`searchIntentParser.js`) using regex/keyword
   matching against the same LOVs already defined in
   `src/config/referenceData.json` (reuse that file, don't redefine BHK/
   furnishing/tenant-type lists again). This keeps Phase 2 running with zero
   new paid dependencies; an AI-based parser can replace this module later
   (OpenAI is explicitly a placeholder in `.env.example`, "not active until
   Phase 7" — respect that, don't turn it on here).
2. **Filter.** From all `Available` rows: BHK match, rent ≤ budget (with a
   little headroom, e.g. up to 10% over, only used for the fallback case in
   step 5), location match (exact locality or same Location Mapping cluster),
   tenant-type compatibility (§2.4), pets if specified.
3. **Rank what's left.** Closer to budget ceiling without exceeding it first,
   then more images (`imageUrls` count) as a simple quality proxy, then more
   recently added (`dateAdded`). No AI, no precomputed scores needed —
   arithmetic ranking on data you already have.
4. **Diversity pass on the top 3.** If two of the top 3 share the same
   `societyName`, drop the lower-ranked duplicate and pull the next distinct
   one up. Users shown the same building twice don't feel served.
5. **Cache the full ranked list for the session** (not just top 3) so "show
   me more" pages through the same list instead of re-querying. See §5 for
   where this lives.

**Zero-result handling — never a dead end:**
- If loosening budget by ~10% or checking the same Location Mapping cluster
  produces matches, show those, explicitly labeled "closest match, not
  exact" — never silently pretend a relaxed result is an exact one.
- If truly nothing matches even relaxed, say so plainly and store the
  original ask (phone number + parsed intent) in a simple `Watch_List`
  tab (new, additive, in the same spreadsheet) so a future onboarding event
  can check it. Actually wiring up the "notify when a match appears" job is
  a nice-to-have for a later milestone — for this task, just make sure the
  ask is captured somewhere real, not just spoken and forgotten.

---

## 4. WhatsApp response format — corrected to what Meta's Cloud API can actually send

Earlier planning docs said "native WhatsApp carousel/catalog cards." That
requires a **Meta Commerce Manager product catalog** connected to the
WhatsApp Business Account — a separate integration that isn't in
`MASTER PLATFORM REGISTRY` and isn't set up. Don't build toward that unless
the user explicitly sets up a Commerce catalog first; it's a business
onboarding step outside this codebase.

What **is** achievable right now, inside a normal customer-initiated
session, using only `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`
already in `.env.example`:

- **One message per property** (so "3 cards" = 3 sequential WhatsApp
  messages, which reads as a swipeable set in the chat thread even without
  a true carousel widget):
  - An **image message** (`type: image`) using the property's best cover
    photo, with a `caption` containing: `{BHK} · {Locality}`, `₹{rent}/mo`,
    and one specific highlight line (e.g. "Gated, pets allowed, ready now" —
    built from real filtered facts, never a generic adjective).
  - Immediately followed by an **interactive reply-buttons message**
    (`type: interactive`, `interactive.type: button`) with exactly two
    buttons: `Contact Now` and `More Details`. Meta allows up to 3 quick-reply
    buttons per interactive message and does **not** support attaching
    buttons directly to an image message, so it has to be these two
    messages back-to-back per property, not one combined bubble.
  - You'll need to add `sendImageMessage(to, imageUrl, caption)` and
    `sendInteractiveButtonsMessage(to, bodyText, buttons)` to
    `src/services/whatsapp.js`, alongside the existing `sendTextMessage`.
    Follow the same style already in that file (axios call, same error
    handling/logging pattern).
- **Message 1 (text, before the 3 property messages):** the acknowledgement
  + count, e.g. `"Found 6 places matching 2 BHK near Bellandur, under
  ₹55,000. Here are 3 I'd start with:"`. Restate what was understood — this
  doubles as an implicit "did I get that right?" without a separate turn.
- **After the 3 properties:** one closing text message with the next-step
  options, e.g. `"Want to see more, or should I narrow these down?"` — plain
  text is fine here; free-text replies like "more" / "under 45k" /
  "pet friendly" must all be understood by the intent parser as
  **refinements of the same session**, not fresh unrelated searches (see
  §5 for how that context is kept).
- **Button taps:**
  - `Contact Now` → send back a short confirmation
    (`"Great choice! I've noted your interest in {society}, {locality} —
    someone will reach out on this number shortly."`) and log the lead
    (append a row to a new `Leads` tab: phone, PID/row, timestamp,
    property summary). Do **not** write into `Live Tracking` — that sheet is
    Phase 1's, read-only from Search's perspective.
  - `More Details` → send the gallery URL (§6) as a plain text message,
    one line, nothing fancier needed.

---

## 5. Session & cache — no Redis, match the existing style

There's no Redis in this stack and no reason to add one for this traffic
level. `sessionManager.js` already keeps Add-flow session state in a plain
in-memory `Map` with manual TTL/expiry checks — copy that exact pattern for
search, in a new file, e.g. `src/search/searchSessionManager.js`:

- Per-phone-number entry: `{ lastIntent, rankedResults: [...], page, expiresAt }`.
- 30-minute sliding TTL (touch `expiresAt` on every message).
- On expiry, a bare refinement ("under 55k" with no prior context) is
  treated as underspecified — ask the one most useful clarifying question
  ("Which area are you looking in?") rather than guessing.
- This is process memory only, same limitation the Add flow already
  accepts (a Render restart clears it) — that's an acceptable, already-
  established tradeoff in this codebase, not a new risk being introduced.

**Property cache** (separate from session cache): reading all of
`Live Tracking` on every search request is wasteful. Cache the full parsed
row set in memory, refreshed every 5 minutes on a `setInterval` (same
"recurring task without a job queue" approach the rest of this repo already
uses — check `src/config/config.js` / existing scheduling if any precedent
exists, otherwise just add a simple interval in `src/index.js` bootstrap).
Load `Location Mapping` into memory the same way, same refresh cadence.

---

## 6. Gallery web page — this does not exist yet, build it from scratch

Note: earlier chat history referenced a URL like
`https://easyfindautomation.onrender.com/api/gallery/{PID}` as if it were
already live. It is **not** in this repository — there is no gallery route
or controller anywhere in `src/`. Build it new:

- New route: `GET /api/gallery/:pid` in a new `src/routes/gallery.js`,
  mounted in `src/index.js` next to the webhook router.
- Resolves the property by PID (reuse the existing `findByPid` from
  `sheets.js` if it fits, or the new read-only property list from §2 —
  reuse, don't duplicate the sheet-reading logic).
- Renders a simple server-rendered HTML page (no need for a frontend
  framework/build step for v1 — keep this repo's zero-build-step
  simplicity) showing: cover image, price, BHK/bathrooms/balcony/sqft as a
  compact facts row, furnishing, tenant type, availability, deposit,
  maintenance, full photo grid (images and videos split into two sections,
  since they're identifiable by URL per §2.5), and a WhatsApp deep link
  (`https://wa.me/{business number}?text=...`) as the primary CTA so a
  visitor can jump straight back into the chat.
- Use the refined mock (`EasyFind_Search_Gallery_Mockup_v2.html`, attached
  alongside this prompt) as the visual/structural reference — same warm,
  premium-minimal direction, not WhatsApp green, not a generic real-estate
  portal red. Treat it as a template to server-render from real property
  data, not something to ship as static HTML.
- If a property has a PID collision (§2.1), resolve to the most recently
  added row and don't error — this page should never 404 on a real PID a
  customer was just sent.
- **This must work retroactively with zero backfill.** ~20 real properties
  are already sitting in `Live Tracking` from before this feature existed.
  Because the gallery renders live from the sheet on each request (not from
  a precomputed cache keyed at onboarding time), every existing row with a
  PID and populated `imageUrls` gets a working gallery page the instant this
  route ships — no migration script, no re-running onboarding. The only
  requirement this puts on the page: handle **missing fields gracefully**
  (some older rows may lack `maintenance`, `balcony`, etc.) by omitting that
  line entirely, never rendering `undefined` or `NaN`.

---

## 6b. One small, explicitly-approved Add-flow change: gallery link in the success message

This is the *one* exception to "don't touch Add-flow files" (§0) — done
because the gallery link genuinely belongs in the confirmation message, and
it's a one-line, low-risk addition:

- Add `PUBLIC_BASE_URL` to `.env.example` and `src/config/config.js`
  (e.g. `https://easyfindautomation.onrender.com` in production — no
  trailing slash). This doesn't exist today; nothing currently builds a
  public link anywhere in the codebase.
- In `src/inventory/inventoryResponses.js`, the **real** confirmation
  template is `success({ pid, location, bhk, rent, photoCount,
  videoCount })` (used from `inventoryController.js`, not the legacy
  `RESPONSES.successAdded()` in `webhookController.js` — that one is a
  dead/legacy fallback path, don't bother touching it). Add one line to
  `success()`'s returned string, after the media line:
  ```js
  `📸 Gallery: ${config.publicBaseUrl}/api/gallery/${pid}\n\n` +
  ```
  (import `config` into `inventoryResponses.js`, or pass the built URL in
  from the caller — whichever fits the existing style better; there's
  already a `config` import pattern used elsewhere in `src/`, follow that.)
- This line should appear **every time** a property is successfully
  added — both call sites in `inventoryController.js` that invoke
  `R.success(...)` (there are two — one for the standard save path, one
  for a secondary path per the state machine comments) need it, since both
  produce the same customer-facing confirmation.

---

## 7. File plan (new files only — nothing above touches Phase 1 files)

```
src/search/
  searchController.js          // tryHandleMessage(message) entry point, mirrors inventoryController's shape
  searchIntentParser.js         // free-text -> structured intent
  searchEngine.js               // filter + rank + diversity pass (§3)
  searchSessionManager.js       // per-phone session cache (§5)
  searchResponses.js            // all customer-facing copy, mirrors inventoryResponses.js style
  tenantCompatibility.js        // §2.4 table
  availabilityNormalizer.js     // §2.3
src/services/
  locationMapping.js            // loads + caches Location Mapping tab, alias resolution
  propertyCache.js              // loads + caches Live Tracking rows read-only (§5)
src/routes/
  gallery.js                    // §6
src/views/ (or wherever server-rendered HTML lives — keep consistent with rest of repo)
  gallery.html / gallery template
```

Update (don't rewrite) `src/inventory/inventoryResponses.js` (`mainMenu()`
only, §1) and `src/controllers/webhookController.js` (add the routing hop to
`searchController`, §1). Everything else in `src/inventory/`, `src/session/`,
`src/normalizer/`, `src/parser/` stays untouched.

---

## 8. Non-goals for this task (explicitly out of scope, don't drift into these)

- No Redis, no Postgres migration, no queue system — this repo's whole
  philosophy so far is "no infra you don't need yet."
- No OpenAI/AI parsing — rule-based intent parsing only, per §3.
- No Meta Commerce catalog / true native carousel — per §4.
- No changes to PID generation, the Apartment Type LOV, or any Add-flow
  file.
- No new frontend build tooling for the gallery page — server-rendered HTML.
- No `Broker Panel`/`Sheet22`/other legacy tabs read anywhere.

---

## 9. Acceptance checklist

- [ ] Fresh chat → menu offers both Search and Add, correct routing for both.
- [ ] Free-text query with no prior menu tap (e.g. `"2bhk bellandur under
      55k"`) is recognized as a search, not "unknown command."
- [ ] Only `Available` rows ever appear in results.
- [ ] A typo'd locality ("kasa") resolves via `Location Mapping`.
- [ ] "Family" query excludes `Only Bachelors`; "bachelor" query excludes
      the three family-only variants (§2.4).
- [ ] Video URLs never appear as a photo in the gallery grid or as a card
      cover image.
- [ ] Top-3 never contains two properties with the same `societyName` if a
      distinct third option exists.
- [ ] "More" continues the same cached ranked list, no duplicate AI/Sheets
      call.
- [ ] Zero-result case always returns either a labeled "closest match" set
      or an honest "nothing right now" message with the ask captured in
      `Watch_List` — never a blank reply.
- [ ] `Contact Now` writes to a new `Leads` tab, never to `Live Tracking`.
- [ ] `More Details` sends a working `/api/gallery/:pid` link that renders
      real data for a real PID from the live sheet.
- [ ] The known `EF-20260704-000005` PID collision does not crash or
      silently merge two different properties in the gallery page.
- [ ] All ~20 real properties already in `Live Tracking` render a working
      gallery page with zero backfill, the moment the route ships.
- [ ] The "Property added!" confirmation message includes a working
      `📸 Gallery: {link}` line, for every successful save (both call sites).
