# DOCUMENT 06
# WhatsApp Session Flow Specification

Version: 1.0
Status: Business Contract
Purpose: Defines the complete conversational workflow for adding, updating and managing inventory through WhatsApp.

---

# Philosophy

The user should never have to think about the order.

The system should adapt to the user.

Not the opposite.

From the moment the user starts an Add Property session until the session ends, everything received belongs to one property.

Regardless of order.

Examples

Property details

↓

Images

↓

Video

↓

Location

↓

Correction

↓

More Images

↓

Done

All belong to ONE property.

---

# Session States

IDLE

↓

ADD PROPERTY

↓

COLLECTING INFORMATION

↓

PROCESSING

↓

SUCCESS / FAILED

↓

IDLE

---

# Starting a Session

Accepted commands

Add

Add Property

New Property

Inventory Add

Start Property

Create Listing

Response

━━━━━━━━━━━━━━━━━━━━━━

🏡 Property Addition Started

You can now send:

• Property details
• Photos
• Videos
• Maps Link
• Corrections
• Additional information

📌 Send them in ANY order.

When finished simply type

Done

or

Finish

or

Complete

To cancel anytime type

Cancel

━━━━━━━━━━━━━━━━━━━━━━

---

# During Session

Everything received is attached to current Session ID.

Examples

Text

Images

Videos

Map Link

WhatsApp Location

Corrections

Voice Notes (future)

Documents (future)

Everything belongs to same property.

Order NEVER matters.

---

# Session Buffer

Internally maintain

Session ID

Status

Started Time

Sender Number

Collected Text

Collected Images

Collected Videos

Collected Map Links

Raw WhatsApp Messages

Media Count

Last Activity

Nothing gets processed before Done.

---

# User can send in ANY order

Example 1

Images

↓

Details

↓

Done

Accepted

---

Example 2

Map

↓

Video

↓

Text

↓

Images

↓

Done

Accepted

---

Example 3

Text

↓

Correction

↓

Correction

↓

More Images

↓

Done

Accepted

---

# Interactive Replies

Instead of remaining silent, keep the conversation alive.

Examples

📸 Nice!
Received 4 images.

Current Media:
4 Files

━━━━━━━━━━━━━━

📍 Location received.

━━━━━━━━━━━━━━

🎥 Video received.

━━━━━━━━━━━━━━

📝 Property details received.

━━━━━━━━━━━━━━

📦 Total collected

1 Text

5 Images

1 Video

Ready whenever you type Done.

---

Keep replies short.

Friendly.

Human.

Not robotic.

---

# Done Command

Accepted

Done

Finish

Complete

Submit

End

Once Done is received

Lock session.

Begin Processing.

Reply

━━━━━━━━━━━━━━━━━━

⏳ Processing Property...

Checking duplicate...

Uploading media...

Parsing details...

Updating inventory...

Please wait...

━━━━━━━━━━━━━━━━━━

---

# Processing Steps

Step 1

Combine everything collected.

---

Step 2

Extract property fields.

---

Step 3

Normalize values.

---

Step 4

Upload media.

---

Step 5

Generate Image URLs.

---

Step 6

Check duplicates.

---

Step 7

Insert or Update Inventory.

---

Step 8

Return Summary.

---

# Successful Property Addition

━━━━━━━━━━━━━━━━━━

✅ Property Added Successfully

PID
P-00872

Status
New Property

Fields Updated

✓ Apartment Type

✓ Society

✓ Location

✓ BHK

✓ Bathrooms

✓ Balcony

✓ Utility

✓ Furnishing

✓ Rent

✓ Deposit

✓ Maintenance

✓ Floor

✓ Sq.ft

✓ Available From

✓ Tenant

✓ Pets

✓ Negotiation

✓ Availability

✓ Map Link

✓ Raw Message

✓ Image URLs

Media Processed

Images : 5

Videos : 1

Total : 6 Files

Image Folder

<Drive Folder>

Inventory Row

<Row Number>

Property Link

<Inventory Link>

━━━━━━━━━━━━━━━━━━

Anything else?

1️⃣ Add another property

2️⃣ Update existing property

3️⃣ Exit

---

# Duplicate Property

Suppose property already exists.

Instead of failing...

System compares media.

Case

Property Exists

Images Existing

2

Images Received

5

Missing Images

3

Result

Only upload missing media.

Do NOT duplicate.

Response

━━━━━━━━━━━━━━━━━━

ℹ Property already exists.

Existing property updated.

New Media Added

3 Images

0 Videos

Updated Fields

✓ Rent

✓ Deposit

✓ Availability

Media Library Updated Successfully.

━━━━━━━━━━━━━━━━━━

Anything else?

---

# No New Information

Duplicate

No new fields

No new media

Response

━━━━━━━━━━━━━━━━━━

ℹ Property already exists.

No new information detected.

Inventory unchanged.

━━━━━━━━━━━━━━━━━━

---

# Partial Failure

Example

Inventory Updated

But

Drive Upload Failed

━━━━━━━━━━━━━━━━━━

⚠ Property Added Partially

Inventory

✅ Success

Media Upload

❌ Failed

Reason

Google Drive Timeout

Please resend media later.

━━━━━━━━━━━━━━━━━━

---

# Complete Failure

━━━━━━━━━━━━━━━━━━

❌ Property could not be added.

Reason

Mandatory information missing.

Missing

Location

Rent

Apartment Type

Nothing has been saved.

Please resend details.

━━━━━━━━━━━━━━━━━━

---

# Cancel Session

Accepted

Cancel

Stop

Exit

Abort

Response

━━━━━━━━━━━━━━━━━━

❌ Property addition cancelled.

Everything collected during this session has been discarded.

Nothing was saved.

━━━━━━━━━━━━━━━━━━

---

# Automatic Timeout

If no activity for

30 Minutes

Session expires.

Response

━━━━━━━━━━━━━━━━━━

⌛ Session expired.

No activity detected for 30 minutes.

Collected information has been discarded.

Start again by typing

Add Property

━━━━━━━━━━━━━━━━━━

---

# Update Existing Property Media

New Feature

User

Add Photos

↓

PID

↓

P-00872

↓

Send Images

↓

Done

System

Find PID

Upload Images

Merge

Update URLs

Response

━━━━━━━━━━━━━━━━━━

✅ Existing Property Updated

PID

P-00872

Added

5 Images

Total Images

17

Inventory Updated Successfully.

━━━━━━━━━━━━━━━━━━

---

# Delete Property Media

User

Delete Photos

↓

PID

↓

P-00872

System

Fetch Media

Delete

Update URLs

Response

━━━━━━━━━━━━━━━━━━

🗑 Media Deleted Successfully

PID

P-00872

Deleted

4 Images

Inventory Updated.

━━━━━━━━━━━━━━━━━━

---

# Session Rules

Only one active Add session per sender.

Nothing writes to inventory before Done.

Everything received before Done belongs to same property.

Order never matters.

Media never processed independently.

Duplicate detection happens only during Processing.

Summary shown after every operation.

Conversation should remain interactive.

---

# Design Principles

The AI adapts to humans.

Humans never adapt to the AI.

Simple.

Fast.

Forgiving.

Interactive.

Professional.

Extensible.

This document serves as the authoritative specification for all WhatsApp inventory interactions.