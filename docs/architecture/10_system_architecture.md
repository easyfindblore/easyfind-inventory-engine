# Document 10 — System Architecture

Version: 1.0
Status: Production Architecture
Authoritative Design Document

---

# Purpose

This document defines the complete backend architecture of the Inventory Automation System.

It explains how every component communicates, the lifecycle of an inventory session, and how data flows from WhatsApp to Google Sheets.

This document is the master reference for developers.

---

# Core Design Principles

The system is designed around four principles:

- Session-driven conversations.
- Stateless webhook requests.
- Deterministic processing.
- Single source of truth (Google Sheets).

Every module performs exactly one responsibility.

---

# High-Level Architecture

```
WhatsApp User
      │
      ▼
Meta WhatsApp Cloud API Webhook
      │
      ▼
Webhook Controller
      │
      ▼
Session Manager
      │
      ├───────────────┐
      ▼               ▼
Message Parser    Media Collector
      │               │
      └──────┬────────┘
             ▼
Normalization Engine
             │
             ▼
Validation Engine
             │
             ▼
Duplicate Detection
             │
             ▼
Media Upload Service
             │
             ▼
Cloudinary
             │
             ▼
Google Sheets Service
             │
             ▼
Live Tracking Sheet
             │
             ▼
Response Generator
             │
             ▼
WhatsApp Reply
```

---

# Component Responsibilities

## 1. Webhook Controller

Responsible for:

- Receiving all WhatsApp webhook events.
- Verifying webhook authenticity.
- Identifying message type.
- Forwarding requests to Session Manager.

Contains no business logic.

---

## 2. Session Manager

Responsible for managing inventory sessions.

Tracks:

- Current state
- Current PID (when applicable)
- Pending property details
- Pending media
- User timeout
- Session command handling

Supported commands:

- Add Property
- Add Media
- Delete Media
- Cancel
- Exit
- Done

Only one active session per WhatsApp number.

Inactive sessions expire after 30 minutes.

---

## 3. Message Parser

Responsible for extracting structured data from free-form WhatsApp messages.

Examples:

- Furnishing
- Rent
- Deposit
- BHK
- Bathrooms
- Balcony
- Utility
- Floor
- Pets
- Availability
- Community
- Society
- Location

Parser is completely order-independent.

---

## 4. Mapping Engine

Converts parsed values into Inventory Master values.

Examples:

```
Semi
↓

Semi Gated

Independent House

↓

Stand Alone

Pets Allowed

↓

Yes

Pets Not Allowed

↓

No

2 Months Deposit

↓

Rent × 2
```

All normalization rules are defined in Document 03.

---

## 5. Validation Engine

Checks every mapped value against Inventory Sheet Specification.

Responsibilities:

- Dropdown validation
- Mandatory field validation
- Numeric validation
- Date validation
- Enumeration validation

No invalid value reaches Google Sheets.

---

## 6. Duplicate Detection Engine

Prevents duplicate properties.

Checks:

- Unique Key
- Message ID
- Existing PID
- Media checksum

Duplicate detection never blocks media updates.

---

## 7. Media Processing Service

Responsible for:

- Receiving images/videos
- Temporary session storage
- Uploading to Cloudinary
- Returning secure URLs
- Updating Image URL field

### Important Design Decision

Cloudinary folders are **not** treated as the source of truth.

Instead:

- Every uploaded asset receives a deterministic `public_id`.
- The property is linked through its PID.
- Google Sheets (Image URL column) is the authoritative mapping between a property and its media.

Example naming:

```
PID240703001_img001
PID240703001_img002
PID240703001_vid001
```

or

```
inventory/PID240703001_img001
inventory/PID240703001_vid001
```

The naming convention must be deterministic and never random.

The backend should always be able to reconstruct the relationship using the PID, even if Cloudinary assets are moved or renamed later.

---

# Why We Do NOT Depend on Cloudinary Folders

Cloudinary folders are primarily organizational.

They are **not** relational storage.

Therefore:

Property ↔ Media relationship is maintained by:

```
PID
↓

Google Sheet Row

↓

Image URL Array

↓

Cloudinary Asset
```

Google Sheets remains the source of truth.

Cloudinary only stores files.

---

## 8. Google Sheets Service

Responsible for:

- Reads
- Writes
- Updates
- Lookups
- Appends

Implements all rules defined in Document 09.

---

## 9. Response Generator

Creates interactive WhatsApp replies.

Examples:

- Progress messages
- Validation errors
- Success summaries
- Upload statistics
- Menu options
- Retry prompts

Responses should feel conversational and engaging while remaining concise.

---

# End-to-End Inventory Flow

```
User

↓

Add Property

↓

Session Created

↓

User sends text

↓

Parser

↓

Mapping

↓

Validation

↓

User sends media

↓

Media Buffer

↓

Done

↓

Duplicate Detection

↓

Cloudinary Upload

↓

Google Sheets Write

↓

Success Response

↓

Session Destroyed
```

---

# Add Media Flow

```
User

↓

Add Media

↓

Enter PID

↓

PID Lookup

↓

Receive Images/Videos

↓

Done

↓

Upload New Media

↓

Update Image URL Array

↓

Success

↓

Session Closed
```

---

# Delete Media Flow

```
User

↓

Delete Media

↓

Enter PID

↓

Fetch Existing Media

↓

Select/Delete Media

↓

Delete from Cloudinary

↓

Update Image URL Array

↓

Success

↓

Session Closed
```

---

# Failure Handling

The system must gracefully recover from:

- Network failures
- Cloudinary failures
- Google Sheets failures
- Duplicate messages
- Session timeout
- Partial media upload
- Invalid user input

A single failure must never corrupt inventory data.

---

# Source of Truth

| Component | Source of Truth |
|-----------|-----------------|
| Property Data | Google Sheets |
| Media Files | Cloudinary |
| Property ↔ Media Relationship | Google Sheets Image URL Column + PID |
| Session State | Backend Memory / Session Store |
| Mapping Rules | Document 03 |
| Sheet Structure | Document 01 |

---

# Architecture Principles

✓ One property = One Google Sheet row.

✓ One property can have multiple images and videos.

✓ PID is the permanent identity of a property.

✓ Cloudinary stores files only.

✓ Google Sheets stores business data and media references.

✓ Every backend component has a single responsibility.

✓ Every operation is deterministic and idempotent.

✓ Session state is temporary; inventory data is permanent.

---

# Future Expansion

The architecture supports future modules without redesign:

- AI-powered property parser
- Voice message parsing
- OCR from images
- Broker dashboard
- Property search API
- Admin panel
- Analytics dashboard
- CRM integration
- Notification engine
- Multi-city inventory support

---

End of Document 10