# Document 09 — Google Sheet Operations

Version: 1.0
Status: Production Specification

---

# Purpose

This document defines every interaction between the Inventory Automation System and Google Sheets.

No module may directly manipulate sheet data outside the rules defined here.

Google Sheets is the primary operational database for the inventory system.

---

# Primary Sheets

## 1. Live Tracking

Purpose

Primary inventory database.

Contains one row per property.

All inventory operations happen here.

---

## 2. Broker Panel

Purpose

Read-only helper sheet.

Provides broker-facing filtered views.

Never directly written by the backend.

---

## 3. Location Mapping

Purpose

Master lookup table.

Maps aliases to canonical locations.

Used during parser normalization.

Read-only during runtime.

---

# Live Tracking Column Contract

| Column | Field |
|---------|------------------------|
| A | PID |
| B | Onboarding Type |
| C | Property Location |
| D | Apartment Type |
| E | Society Name |
| F | BHK |
| G | Bathrooms |
| H | Balcony |
| I | Utility |
| J | Size |
| K | Floor |
| L | Furnishing |
| M | Tenant Type |
| N | Veg / Non-Veg |
| O | Pets Friendly |
| P | Rent |
| Q | Maintenance |
| R | Deposit |
| S | Available From |
| T | Scope Of Negotiations |
| U | Visit Timings |
| V | Availability |
| W | Date Added |
| X | Last Updated |
| Y | Message ID |
| Z | Sender Phone |
| AA | Raw Message |
| AB | Message Timestamp |
| AC | Unique Key |
| AD | Image URL |

AE is currently unused.

---

# Allowed Operations

## Create Property

Append one new row.

Generate PID.

Populate every mapped field.

Populate metadata.

Store media URLs.

Return PID.

---

## Read Property

Lookup by

PID

or

Unique Key

or

Message ID

Return complete row.

---

## Update Property

Locate row by PID.

Only update supplied fields.

Never overwrite unspecified values.

Always update Last Updated.

---

## Add Media

Locate PID.

Read Image URL array.

Append new URLs.

Write updated JSON array.

Update Last Updated.

---

## Delete Media

Locate PID.

Remove selected media URLs.

Rewrite JSON array.

Update Last Updated.

---

## Mark Availability

Allowed values

Available

Delayed

Rented Out

No other values allowed.

---

## Search

Supported filters

Location

Society

Rent

BHK

Apartment Type

Availability

PID

Phone Number

Unique Key

---

# Sheet Read Rules

Read only required ranges.

Never read entire sheet unless required.

Cache lookup tables.

Avoid repetitive reads.

---

# Sheet Write Rules

Only append when creating property.

Never insert rows.

Never delete rows.

Never reorder rows.

Never modify headers.

---

# Atomic Transactions

Every property creation must be atomic.

Sequence

Generate PID

↓

Normalize Data

↓

Upload Media

↓

Append Row

↓

Success Response

If append fails

No partial property should exist.

---

# Timestamp Rules

Date Added

Written only once.

Never modified again.

Last Updated

Updated on every edit.

---

# Raw Message Rules

Entire original WhatsApp conversation must be stored.

Never modify.

Never normalize.

Never truncate.

Acts as permanent audit log.

---

# Image URL Rules

Stored as JSON array.

Example

[
"https://...",
"https://..."
]

Never use comma-separated strings.

Never use multiple columns.

---

# Lookup Operations

Location Mapping

Read once.

Cache in memory.

Refresh every configurable interval.

Used only for normalization.

Never edited automatically.

---

# Validation Enforcement

Backend validation is mandatory.

Google Sheet dropdowns are secondary validation only.

Every value written must already conform to the Inventory Sheet Specification.

---

# Error Handling

If sheet unavailable

Retry.

If append fails

Abort transaction.

If update fails

Retry.

If lookup fails

Return Property Not Found.

Never silently ignore errors.

---

# Concurrency

Multiple inventory sessions may execute simultaneously.

Every write operation must:

Read latest state.

Validate.

Write.

Prevent overwriting concurrent updates.

---

# Unique Constraints

Must be unique

PID

Unique Key

Message ID (when available)

Duplicate insertions must be rejected.

---

# Performance Guidelines

Cache Location Mapping.

Minimize API calls.

Batch reads where possible.

Never scan unnecessary rows.

Avoid repeated writes.

---

# Audit Fields

Always maintain

Date Added

Last Updated

Sender Phone

Message Timestamp

Raw Message

Message ID

Unique Key

These fields must never be manually edited by operators.

---

# Future Expansion

Reserved for

Property Status

Assigned Broker

Notes

Owner Details

Latitude

Longitude

Thumbnail URL

Video URL

No structural changes required for future additions.

---

# Non-Negotiable Rules

✓ Live Tracking is the single source of truth.

✓ Every property occupies exactly one row.

✓ Never delete inventory rows.

✓ Never modify headers.

✓ Never overwrite unspecified fields.

✓ Every update refreshes Last Updated.

✓ Backend performs validation before writing.

✓ Raw Message is always preserved.

✓ Image URLs are stored as a JSON array.

✓ All sheet operations must be deterministic and idempotent.

---

End of Document 09