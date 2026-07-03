# Document 04
# Property Message Formats

**Version:** 1.0  
**Status:** Approved  
**Repository:** `docs/04_property_message_formats.md`

---

## Purpose

This document defines the expected format of property detail messages sent via WhatsApp. These formats guide the parser so that it can reliably extract structured information regardless of the order or presentation style used by the user. 

All property details must follow a defined structure for extraction, but the order of fields in the message should not affect the processing as long as the session is completed before the "Done" or "Commit" action.

---

## Core Principles

1. **Raw Message Preservation**  
   The original property message, including formatting, highlights, and additional context, must always be preserved in the "Raw Message" column exactly as received. This ensures traceability and auditability.

2. **Structured Fields**  
   Certain property attributes must be extracted as structured data points (e.g., Rent, BHK, Community). These must map to specific columns in the inventory sheet and strictly adhere to the normalized values defined in the mapping rules.

3. **Property Highlights**  
   Any descriptive highlights or embellishments (such as "huge private garden," "lake view," or "premium interiors") should be considered part of the raw message. They are not mapped to any structured field but must be retained for future reference.

4. **Flexible Order**  
   The order in which the fields appear in the message does not matter. The parser should identify and extract fields by keywords or patterns. The session will still represent one property as long as all required fields are received before the user sends the "Done" signal.

5. **Google Maps Link**  
   Google Maps links must be recognized regardless of their format. All variations—whether from `maps.app.goo.gl`, `goo.gl/maps`, or `maps.google.com`—should be accepted as valid, and the link should be stored exactly as sent.

---

## Structured Message Template

Each property message should include these structured fields. The exact phrasing may vary, but each field must appear somewhere in the message. Here’s the standard structure (the order is not mandatory):

```
**Furnished** [e.g., Fully Furnished]
**BHK** [e.g., 2 BHK]
**Bathrooms** [e.g., 2 Bathrooms]
**Balcony** [e.g., 1 Balcony] & Utility [Optional]

Rent: [e.g., 60k]
Maintenance: [e.g., 5135]
Deposit: [e.g., 2L]
Sq.ft: [e.g., 1300]
Floor: [e.g., 18/18]
Available From: [e.g., Immediately]
Preferred Tenant: [e.g., Family & Male Bachelors]
Pets: [e.g., not Allowed]
Community: [e.g., Gated]
Location: [e.g., Sarjapur Road]
Society/Landmark: [e.g., VRR Fortuna]
Google Maps Link: [e.g., https://maps.app.goo.gl/...]
```

---

## Example Messages

### Example 1

```
Fully Furnished 2 BHK with 2 Bathrooms & 1 Balcony.

Rent: 60k  
Maintenance: 5135  
Deposit: 2L  
Sqft: 1300  
Floor: 18/18  
Available From: Immediately  
Preferred Tenant: Family & Male Bachelors  
Pets: not Allowed  
Community: Gated  
Location: Sarjapur Road  

Society/Landmark: VRR Fortuna  
https://maps.app.goo.gl/oQCKEG435u8Fp93U7?g_st=ic
```

### Example 2

```
Semi Furnished 2 BHK with 2 Bathrooms & 1 Balcony

Rent: 38k  
Maintenance: water charges  
Deposit: 1.2L  
Sqft: 1350  
Floor: 3/4  
Available From: July 15  
Preferred Tenant: Family  
Pets: not allowed  
Community: Stand Alone  
Location: Kasavanahalli  

Landmark:  
https://maps.app.goo.gl/4nfELrcWceTNMZ61A?g_st=ac
```

### Example 3

```
Semi Furnished 4 BHK with 3 Bath and 1 toilet with huge private garden area with plantation.

Rent: 1.1L  
Maintenance: included  
Deposit: 6.5L  
Sqft: 3200  
Floor: G/2  
Available From: July 1  
Preferred Tenant: Anyone  
Pets: allowed  
Dedicated Parking  
Community: Independent Villa  
Location: Shubh Enclave, Harlur  

Landmark:  
https://maps.app.goo.gl/YmmaEHU6KrqMtX3t7
```

---

## Parsing Behavior

1. **Field Extraction**  
   Each field (Rent, Maintenance, Deposit, BHK, etc.) must be extracted independently, using flexible parsing patterns.  
   - Example: Rent could be written as "Rent: 60k", "Rent - ₹60k", or "Rent: 60,000." The parser must normalize these to numeric values.

2. **Google Maps Links**  
   The parser should identify the first valid Google Maps link and store it exactly as received. It does not need to validate the format, just confirm it is a Google Maps link.

3. **Property Session Completion**  
   Once all fields are received in a session, the user will send a "Done" or "Commit" message. This will signal the end of the property input, and the entire session will be treated as one property record.

4. **Order Independence**  
   The parser should not rely on field order. Whether the user lists "Rent" before "Community" or after "Preferred Tenant," it should still extract all fields as long as the session is finished.

5. **Unknown Fields**  
   Any information not mapped to a structured field (e.g., "huge garden," "lake view") is purely descriptive. These must remain in the raw message and should not disrupt field extraction or mapping.

---

## Invalid Messages

The following are examples of invalid formats (either missing required fields or lacking structure):

- Missing Rent
- Missing Google Maps Link
- Missing Community or Location

In such cases, the parser should return a prompt asking the user to complete the missing fields before the session can be finalized.

---

## Media Handling

1. Images, videos, and other media files are optional and can appear anywhere within the session.  
2. The parser should not depend on the media order; it should count how many media files were sent in the entire session and store them separately.  
3. All media URLs (from Cloudinary or other sources) are processed later, after the property data is finalized.

---

## Raw Message

Every received message (including structure, formatting, and extra highlights) must be stored in the Raw Message column. This ensures that the full context remains available for later review or analysis.

---

## This Document Does NOT

- Handle duplicate detection.
- Manage AI decision-making.
- Handle media uploads.
- Write to Google Sheets directly.

All of these tasks belong to other documents in the repository.

---

# End of Document
