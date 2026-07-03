# DOCUMENT 07
# Duplicate Detection Specification

Version: 1.0

Status: Business Contract

Purpose:
Defines exactly how the system determines whether a property is NEW, an UPDATE, or a DUPLICATE.

This document is the single source of truth for duplicate detection.

---

# Philosophy

Duplicate detection exists to prevent duplicate inventory.

It should NEVER reject useful information.

If a property already exists but contains new information, the system must UPDATE the existing property instead of creating another row.

Every incoming property must end in exactly one outcome.

• New Property
• Existing Property Updated
• Duplicate (Nothing New)

Never anything else.

---

# Duplicate Detection Timing

Duplicate detection happens ONLY after the user sends

Done

Never while the session is still collecting information.

---

# Detection Priority

Always compare in this order.

Priority 1

PID

↓

Priority 2

Unique Key

↓

Priority 3

Location + Society + BHK

↓

Priority 4

Location + Map Link

↓

Priority 5

Location + Rent + BHK + Floor

Stop as soon as a confident match is found.

---

# Rule 1 — PID Match

If user explicitly provides an existing PID

Example

P-00182

Treat it as an UPDATE.

Never create a new row.

---

# Rule 2 — Unique Key Match

If generated Unique Key already exists

Treat as same property.

Update existing row.

---

# Rule 3 — Society Based Match

If ALL are equal

Society Name

+

Location

+

BHK

then assume same property.

Example

VRR FORTUNA

Sarjapur Road

2 BHK

Existing

↓

Incoming

Same

Result

Existing Property

---

# Rule 4 — Map Link Match

If normalized Google Maps destination is identical

Treat as same property.

Different URL formats pointing to the same destination must still be considered identical.

---

# Rule 5 — Fallback Match

If Society Name is blank

Compare

Location

+

Rent

+

BHK

+

Floor

If all match

Treat as existing property.

---

# Standalone / Villas

Standalone houses often have

No Society

No Apartment Name

Therefore compare

Map Location

+

Landmark

+

Rent

+

Floor

+

BHK

If confidence is high

Treat as existing property.

---

# Never Compare

Ignore

Raw Message

Message ID

Message Timestamp

Image URLs

Sender Phone

Date Added

Last Updated

These never determine duplicates.

---

# Media Comparison

Media is checked independently.

Example

Existing

5 Images

Incoming

8 Images

Compare every uploaded file.

Only upload media not already present.

Never upload duplicate media.

---

# Duplicate Media

If image already exists

Ignore image.

Continue processing remaining images.

Do NOT fail the property.

---

# Existing Property + New Images

Existing Property

↓

No field changes

↓

New Images

Update Image URLs only.

Response

Existing Property Updated

Media Added

---

# Existing Property + Updated Rent

Existing

Rent

50000

Incoming

Rent

52000

Update Rent.

Update Last Updated.

Do NOT create new row.

---

# Existing Property + Better Information

Example

Old

Society Blank

Incoming

Society Available

Update Society.

Always prefer more complete information.

---

# Existing Property + Missing Information

Example

Existing

Floor

15/20

Incoming

Floor Missing

Keep existing value.

Never overwrite populated cells with blank values.

---

# Existing Property + Conflicting Information

Example

Existing

Rent

55000

Incoming

Rent

60000

Latest session wins.

Update inventory.

Preserve original Raw Message.

Update Last Updated timestamp.

---

# Duplicate Decision Matrix

Case

No Match

Result

Create New Property

----------------------------

Existing Property

New Fields

Result

Update Property

----------------------------

Existing Property

Only New Media

Result

Update Media

----------------------------

Existing Property

Fields + Media

Result

Update Everything

----------------------------

Existing Property

Nothing New

Result

No Change

---

# Summary Messages

New Property

Property Added Successfully

---

Existing Property

Property Already Exists

Inventory Updated Successfully

---

Only Media Added

Property Already Exists

New Media Added

---

Nothing Changed

Property Already Exists

No New Information Found

Inventory Unchanged

---

# Rules for AI

Never create duplicate rows if an existing property can reasonably be identified.

Never delete existing data automatically.

Never overwrite populated values with blanks.

Always merge.

Always preserve history in Raw Message.

Always preserve media.

Always update Last Updated.

---

# Future Expansion

This specification supports future duplicate matching using

GPS Coordinates

Google Place ID

Image Fingerprinting

Perceptual Hash (pHash)

Owner Phone

Broker Phone

Property Embeddings

Without changing the external workflow.

---

# Final Principle

Duplicate detection is not about rejecting properties.

It is about protecting inventory quality.

If new information exists,

merge it.

If nothing is new,

do nothing.

If no match exists,

create a new property.

Inventory must always contain exactly one authoritative record for each physical property.