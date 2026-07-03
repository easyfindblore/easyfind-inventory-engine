# Document 08 — Media Processing Specification

Version: 1.0
Status: Production Specification

---

# Objective

This document defines how every image and video received during an Inventory Add Session is processed.

This is the single source of truth for media handling.

The system MUST NEVER depend on the order in which media arrives.

Media processing is completely independent from property detail processing.

Both are merged only when the session ends.

---

# Design Principles

• User can send media in any order.

• User can send images first.

• User can send videos first.

• User can send property details first.

• User can mix everything.

• Nothing should be processed until user finishes the session.

Session begins only after:

Add Property

Session ends only after:

Done
Finish
End
Submit

Everything received between those two commands belongs to one property.

---

# Session Media Buffer

Every session maintains a temporary media buffer.

Example

Session

Property Details

Image1

Image2

Video1

Image3

Property Details Again

Video2

Done

↓

Media Buffer

Image1

Image2

Video1

Image3

Video2

↓

Only now processing starts.

---

# Accepted Media

Supported

JPEG

PNG

WEBP

HEIC

MP4

MOV

Unsupported

PDF

GIF

ZIP

RAR

APK

Unknown files

Unsupported files should be ignored with warning.

---

# Maximum Limits

Maximum Images
50

Maximum Videos
10

Maximum File Size

Images
20 MB

Videos
200 MB

Anything larger should fail individually.

Entire property should continue processing.

---

# Media Processing Pipeline

For every media file

Step 1

Download

↓

Step 2

Verify media

↓

Step 3

Generate checksum

↓

Step 4

Duplicate check

↓

Step 5

Upload

↓

Step 6

Receive URL

↓

Step 7

Store URL

↓

Repeat until all media complete.

---

# Duplicate Media Detection

Duplicate media should be detected using checksum.

If checksum already exists for same PID

Skip upload.

If checksum belongs to different property

Still upload.

Duplicate detection is only inside same property.

---

# Upload Destination

Cloudinary

Every uploaded file returns

Secure URL

Public ID

Resource Type

Width

Height

Duration (video)

Bytes

Format

Created Time

Only Secure URL is stored inside inventory.

Other metadata remains internal.

---

# Folder Structure

property-media/

    PID/

        images/

        videos/

Example

property-media/

    PID-240621001/

        images/

            image_001.jpg

            image_002.jpg

        videos/

            video_001.mp4

Folder names must be deterministic.

Never random.

---

# Naming Convention

Images

image_001

image_002

image_003

Videos

video_001

video_002

video_003

Do not preserve WhatsApp filenames.

---

# Image URL Storage

Inventory Sheet

Image Url column

contains

JSON Array

Example

[
"https://...",
"https://...",
"https://..."
]

NOT comma separated text.

NOT multiple columns.

NOT individual rows.

One property

One media array.

---

# Processing Order

Upload order is irrelevant.

Display order

should follow

first received

↓

last received

---

# Failed Upload

If one upload fails

Continue remaining uploads.

Never abort property.

Summary should mention

Processed

Skipped

Failed

Example

Images Received

12

Uploaded

11

Failed

1

---

# Retry Policy

Automatic retry

3 attempts

Exponential delay

If still fails

Mark failed

Continue property creation.

---

# Media Count

Store

Image Count

Video Count

Total Media Count

Example

Images

7

Videos

2

Total

9

Returned in completion summary.

---

# Property Completion Response

Property Added Successfully

PID
PID-240621001

Property Status
Created

Images Uploaded
7

Videos Uploaded
2

Total Media
9

Image URL
Stored

Duplicate Images
1 skipped

Failed Uploads
0

Property Link
...

Would you like to:

1. Add another property

2. Add media to existing property

3. Exit Inventory

---

# Add Media to Existing Property

Command

Add Media

↓

Enter PID

↓

Send Images/Videos

↓

Done

System

Loads existing property

↓

Checks duplicate media

↓

Uploads only new media

↓

Updates Image URL array

↓

Returns summary

Example

Property Found

PID-240621001

Received

5 Images

Already Existing

2

New Uploaded

3

Videos

1

Updated Successfully

---

# Delete Media

Command

Delete Media

↓

Enter PID

↓

User sends media

OR

selects index

↓

System removes

Cloudinary

Inventory URLs

Cache

↓

Returns summary

Example

Deleted

4 Images

Remaining

12 Images

Updated Successfully

---

# Raw Message Preservation

Media captions

must never be parsed into structured fields unless explicitly supported.

Original captions remain inside

Raw Message.

---

# Processing Rules

✓ Never depend on upload order.

✓ Never fail entire property because one image failed.

✓ Duplicate images should not upload again.

✓ Missing media should never block inventory.

✓ Every uploaded media must belong to exactly one PID.

✓ Property completes even with partial media failure.

✓ Completion response must include exact upload statistics.

---

End of Document 08