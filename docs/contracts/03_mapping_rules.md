# Document 03
# Mapping Rules (Normalization Contract)

**Version:** 1.0  
**Status:** Final  
**Repository:** `docs/03_mapping_rules.md`

---

# Purpose

This document defines how raw property information received from WhatsApp is normalized before being inserted into the Live Tracking sheet.

The parser extracts values.

This document standardizes those values.

Google Sheets should receive only normalized values.

---

# Core Principles

1. Never modify the user's raw message.
2. Raw Message column always stores the original message exactly.
3. Only normalized values are written into inventory columns.
4. If a value cannot be confidently mapped, leave the destination cell blank.
5. Never invent information.

---

# Mapping Pipeline

Incoming WhatsApp Session

↓

Parser

↓

Normalization (This Document)

↓

Dropdown Validation

↓

Google Sheet Insert

---

# Apartment Type Mapping

## Gated Community

Accept all variations

- Gated
- Gated Community
- Gated Apartment
- Gated Society

Store

```
Gated Community
```

---

## Semi Gated

Accept

- Semi
- Semi Gated
- Semi-Gated
- Semi gated

Store

```
Semi Gated
```

IMPORTANT

Never confuse

```
Semi Furnished
```

with

```
Semi Gated
```

These are completely different columns.

---

## Stand Alone

Accept

- Standalone
- Stand Alone
- Stand-Alone

Store

```
Stand Alone
```

---

## Independent House

Accept

- Independent House
- Independent Villa
- Villa
- Duplex Villa
- Independent Floor

Store

```
Stand Alone
```

(Current inventory does not have a separate value for Independent House.)

---

# Society Name Rules

## Gated Community

Apartment/Society name should always be extracted.

Example

```
Prestige Lakeside Habitat
```

↓

```
Prestige Lakeside Habitat
```

---

## Semi Gated

If apartment/building name is mentioned

Store it.

Example

```
SJR Blue Waters
```

↓

```
SJR Blue Waters
```

If no apartment/building name is mentioned

Leave blank.

---

## Stand Alone / Independent House

Usually society name does not exist.

If only landmark is provided

```
Near Ecospace

Near RMZ

Opposite Decathlon
```

Do NOT use it as society.

Leave Society Name blank.

---

## Capitalization

Normalize society names.

Example

```
prestige lakeside habitat
```

↓

```
Prestige Lakeside Habitat
```

---

# BHK Mapping

Normalize spacing only.

Examples

```
2bhk

2 BHK

2-BHK
```

↓

```
2 BHK
```

---

# Bathroom Mapping

Accept

```
2 Bath

2 Bathrooms

2 Washrooms
```

↓

```
2
```

---

# Balcony Mapping

Accept

```
1 Balcony

One Balcony

Huge Balcony

Large Balcony

Long Balcony

Spacious Balcony
```

↓

```
1
```

If quantity is provided

```
2 Balconies
```

↓

```
2
```

Property highlight words

"Huge"

"Long"

"Private"

are ignored for inventory columns.

They remain inside Raw Message.

---

# Utility Mapping

If message contains

```
Utility

Utility Area

Separate Utility

Attached Utility
```

Store

```
Yes
```

If utility is not mentioned

Leave blank.

Do NOT write

```
No
```

---

# Furnishing Mapping

Normalize to dropdown values.

Examples

```
Fully furnished

Fully

FF
```

↓

```
Fully Furnished
```

---

```
Semi furnished

Semi Furnished

SF
```

↓

```
Semi Furnished
```

---

```
Unfurnished

UF
```

↓

```
Unfurnished
```

---

```
Partially Furnished

Partial Furnished
```

↓

```
Partially Furnished
```

---

# Rent Normalization

Accept

```
40K

40 k

40,000

₹40K

40000

40 Thousand
```

↓

```
40000
```

Accept

```
1 Lakh

1.5 Lakh

2 Lakhs

75 Thousand

100K
```

↓

Numeric values only.

Examples

```
100K

↓

100000
```

```
1.5 Lakh

↓

150000
```

---

# Maintenance

Normalize exactly like Rent.

Store numeric value only.

---

# Deposit Normalization

Accept

```
80000

80K

₹80K

80 Thousand
```

↓

Numeric value.

---

If deposit is written as

```
2 Months
```

Calculate

```
Deposit

=

Rent × 2
```

Example

```
Rent

45000

Deposit

2 Months
```

↓

```
90000
```

---

Similarly

```
3 Months

↓

Rent × 3
```

```
5 Months

↓

Rent × 5
```

---

If rent is unavailable

Deposit remains blank.

No guessing.

---

# Floor

Preserve original value.

Examples

```
Ground

GF

Ground Floor

5th

5/14

Top Floor
```

No normalization.

---

# Available From

Preserve original.

Examples

```
Immediate

Tomorrow

Ready to Move

Next Week

1 July

10 Aug

01/07/2026
```

Store exactly as received.

---

# Property Highlights

These are NOT inventory columns.

Examples

```
Huge Balcony

Private Terrace

Open Terrace

Garden

Corner Flat

Lake View

Pool Facing

Park Facing

East Facing

West Facing

Road Facing

Sunlight

Ventilation
```

Do NOT map these.

Do NOT invent new columns.

Preserve inside

```
Raw Message
```

only.

---

# Dropdown Rule

Every dropdown column must finally contain ONLY valid dropdown values.

No free text is allowed.

Examples

```
Semi

↓

Semi Gated
```

```
Standalone

↓

Stand Alone
```

```
Fully

↓

Fully Furnished
```

If no valid mapping exists

Leave blank.

---

# Unknown Values

Unknown information must never be guessed.

Unknown values remain blank.

Raw Message always preserves the original content.

---

# Normalization Responsibilities

This module is responsible for:

✓ Standardizing apartment type

✓ Standardizing furnishing

✓ Normalizing rent

✓ Normalizing deposit

✓ Normalizing BHK

✓ Normalizing bathrooms

✓ Normalizing balcony

✓ Normalizing society capitalization

✓ Converting dropdown values

✓ Preserving Raw Message

✓ Leaving unknown values blank

---

# This Module Does NOT

✗ Detect duplicates

✗ Upload media

✗ Write to Google Sheets

✗ Create Cloudinary folders

✗ Manage WhatsApp sessions

✗ Validate business logic

Those responsibilities are covered in later documents.

---

**End of Document**