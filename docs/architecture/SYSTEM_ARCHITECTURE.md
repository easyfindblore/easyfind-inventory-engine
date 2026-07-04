# EasyFind Inventory Engine — System Architecture

**Last updated:** 2026-07-04  
**Environment:** Production → `https://easyfindautomation.onrender.com`  
**Repo:** `github.com/easyfindblore/easyfind-inventory-engine`

---

## End-to-End Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FIELD AGENT (WhatsApp User)                          │
│                   Sends property details via WhatsApp                       │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │  WhatsApp message (text / image / "Done")
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    META WHATSAPP CLOUD API                                  │
│              (graph.facebook.com / v19.0)                                   │
│                                                                             │
│  • Receives message from user's phone                                       │
│  • Converts it to a webhook POST payload (JSON)                             │
│  • Delivers to registered Callback URL                                      │
│  • Expects HTTP 200 within 5 seconds or will retry                         │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │  HTTPS POST
                               │  → https://easyfindautomation.onrender.com/api/webhook
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RENDER (Cloud Host — Free Tier)                          │
│              easyfindautomation.onrender.com  |  Port 10000                 │
│                                                                             │
│  • Runs:  node src/index.js                                                 │
│  • Build: npm install                                                       │
│  • Auto-deploys from: github.com/easyfindblore/easyfind-inventory-engine   │
│  • Spins down after inactivity (free tier — 50s cold start possible)       │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER  (src/index.js)                           │
│                                                                             │
│  Middleware stack (in order):                                               │
│  1. express.raw()  → for POST /webhook and /api/webhook  (raw Buffer)      │
│  2. express.json() → for all other routes                                  │
│                                                                             │
│  Routes:                                                                    │
│  ├── GET  /health          → 200 OK  (Render health check)                 │
│  ├── GET  /webhook         → Meta verification challenge handler           │
│  ├── POST /webhook         → Incoming message handler                      │
│  ├── GET  /api/webhook     → (alias — same as above)                       │
│  └── POST /api/webhook     → (alias — Meta is configured to this path)     │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK ROUTER  (src/routes/webhook.js)                  │
│                                                                             │
│  GET handler:                                                               │
│  ├── Reads hub.mode, hub.verify_token, hub.challenge from query params      │
│  ├── Compares verify_token against VERIFY_TOKEN secret                      │
│  ├── Match → respond 200 with challenge string  (Meta registers webhook)   │
│  └── No match → 403 Forbidden                                               │
│                                                                             │
│  POST handler:                                                              │
│  ├── Parse raw Buffer → JSON payload                                        │
│  ├── Respond 200 immediately  ← Meta requires < 5 seconds                  │
│  └── Hand off to WebhookController (async, non-blocking)                   │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │  async — after 200 already sent to Meta
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               WEBHOOK CONTROLLER  (src/controllers/webhookController.js)   │
│                          (Main Orchestrator)                                │
│                                                                             │
│  processEntry(entry)                                                        │
│  └── loops through entry.changes                                           │
│      └── processMessage(message, metadata)                                  │
│          │                                                                  │
│          ├── [text message]                                                 │
│          │   ├── SessionManager.identifyCommand(text)                       │
│          │   │   ├── "add" / "new"  → start new AddProperty session        │
│          │   │   ├── "done"         → handleDone() → save to Sheets        │
│          │   │   ├── "add media done" → handleAddMediaDone() → save images │
│          │   │   └── (other)        → SessionManager.addText(text)         │
│          │   └── Reply via WhatsApp API                                     │
│          │                                                                  │
│          └── [image message]                                                │
│              ├── SessionManager.addMedia(mediaId)                           │
│              └── Reply via WhatsApp API                                     │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
              ┌────────────────┼──────────────────┐
              │                │                  │
              ▼                ▼                  ▼
┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────────────┐
│  SESSION MANAGER│  │  PARSER +        │  │  SERVICES                      │
│  (in-memory)    │  │  NORMALIZER      │  │                                │
│                 │  │                  │  │ whatsapp.js                    │
│ sessionManager  │  │ parser/           │  │  • sendTextMessage()          │
│ .js             │  │ messageParser.js  │  │  • downloadMedia()            │
│                 │  │                  │  │  → graph.facebook.com         │
│ State machine   │  │ 1. parseMessage() │  │                                │
│ per sender phone│  │    Regex extracts │  │ cloudinary.js                  │
│                 │  │    BHK, rent,     │  │  • uploadMedia()              │
│ States:         │  │    location, type │  │  • uploadAllMedia()           │
│ • idle          │  │    society, floor │  │  → api.cloudinary.com         │
│ • collecting    │  │    furnishing etc │  │                                │
│ • processing    │  │                  │  │ sheets.js                      │
│                 │  │ 2. normalize()    │  │  • generatePIDAndAppend()     │
│ Timeout: 30 min │  │    Maps to Sheet  │  │  • updateImageUrls()          │
│                 │  │    dropdown values│  │  → sheets.googleapis.com      │
└────────┬────────┘  └────────┬─────────┘  └──────────────┬─────────────────┘
         │                    │                             │
         └────────────────────┴─────────────────────────────┘
                                        │
                    ┌───────────────────┼──────────────────────┐
                    │                   │                      │
                    ▼                   ▼                      ▼
        ┌───────────────────┐  ┌─────────────────┐  ┌────────────────────┐
        │  META WHATSAPP    │  │   CLOUDINARY    │  │  GOOGLE SHEETS     │
        │  CLOUD API        │  │                 │  │  (Primary DB)      │
        │                   │  │ Stores property │  │                    │
        │  Sends reply back │  │ images under    │  │ "Live Tracking"    │
        │  to field agent's │  │ /inventory/     │  │ sheet — 31 columns │
        │  WhatsApp         │  │ folder with     │  │ A (PID) → AE       │
        │                   │  │ PID-based IDs   │  │ (mapsLink)         │
        │  Confirms: "Added"│  │ for idempotency │  │                    │
        │  or prompts next  │  │                 │  │ Mutex-protected    │
        │  step             │  │ Returns secure  │  │ PID generation     │
        └───────────────────┘  │ HTTPS URLs      │  └────────────────────┘
                               └─────────────────┘
```

---

## Multi-Message Session Flow

A single property listing typically spans **multiple WhatsApp messages**:

```
Field Agent                    Engine                       Sheet
    │                             │                           │
    │── "add" ──────────────────▶ │  Start session            │
    │◀─ "Send property details" ─ │                           │
    │                             │                           │
    │── "3BHK Indiranagar..." ──▶ │  Accumulate text          │
    │── [image 1] ──────────────▶ │  Queue media ID           │
    │── [image 2] ──────────────▶ │  Queue media ID           │
    │── "done" ─────────────────▶ │  Parse + Normalize        │
    │                             │── generatePID ──────────▶ │
    │                             │── appendRow ────────────▶ │
    │                             │── downloadMedia ▶ upload  │
    │                             │── updateImageUrls ──────▶ │
    │◀─ "Property BLR-00123      │                           │
    │    added successfully!" ─── │                           │
```

---

## Platform & Credentials Map

| Platform | Purpose | Credentials in Render |
|---|---|---|
| **Meta WhatsApp Cloud API** | Receive & send WhatsApp messages; media download | `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN` |
| **Google Sheets** | Primary database — one row per property | `SPREADSHEET_ID`, `CLIENT_EMAIL`, `PRIVATE_KEY` |
| **Cloudinary** | Image/video storage for property photos | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| **Render** | Cloud host for the Node.js engine | _(hosts the service — no credential needed here)_ |
| **GitHub** | Source code; Render auto-deploys on push to `main` | _(connected via GitHub App in Render dashboard)_ |

---

## Webhook Configuration (Meta Developer Console)

| Setting | Value |
|---|---|
| Callback URL | `https://easyfindautomation.onrender.com/api/webhook` |
| Verify Token | Value of `VERIFY_TOKEN` secret in Render |
| Subscribed Fields | `messages` |

---

## Google Sheet Column Contract

Columns A → AE (31 total) — sheet name: **Live Tracking**

```
A   PID              B   Onboarding Type    C   Location
D   Apartment Type   E   Society Name       F   BHK
G   Bathrooms        H   Balcony            I   Utility
J   Size             K   Floor              L   Furnishing
M   Tenant Type      N   Veg/Non-Veg        O   Pets Friendly
P   Rent             Q   Maintenance        R   Deposit
S   Available From   T   Negotiation        U   Visit Timings
V   Availability     W   Date Added         X   Last Updated
Y   Message ID       Z   Sender Phone       AA  Raw Message
AB  Timestamp        AC  Unique Key         AD  Image URLs
AE  Maps Link
```

---

## Deployment Pipeline

```
Developer / Agent
      │
      │  git push origin main
      ▼
GitHub (easyfindblore/easyfind-inventory-engine)
      │
      │  Auto-deploy webhook (GitHub App)
      ▼
Render Build
      ├── npm install   (≈ 1–2 min)
      ├── node src/index.js
      └── Health check → GET /health → 200

      ▼  Live at:
https://easyfindautomation.onrender.com
```

---

## Key Design Decisions

| Decision | Reason |
|---|---|
| Google Sheets as only DB | No separate database to manage; sheet is visible to non-technical ops team |
| Cloudinary for media | WhatsApp media URLs expire in ~10 min; Cloudinary URLs are permanent |
| Respond 200 before processing | Meta retries if no response within 5s; all processing is async after ACK |
| Session state in-memory | Multi-message listings need temporary state; 30-min timeout clears stale sessions |
| No HMAC verification | Engine accepts all Meta payloads without signature checking — consistent with original architecture |
| `/api/webhook` alias | Meta console configured with this path; both `/webhook` and `/api/webhook` served |
