# DOCUMENT 07  
# Duplicate Detection Specification

Version: 1.0  
Status: Business Contract  

## Purpose  
Defines exactly how the system determines whether a property is new, an update, or a duplicate.  
This document is the single source of truth for duplicate detection.  

## Philosophy  
Duplicate detection exists to prevent duplicate inventory.  
It should never reject useful information.  
If a property already exists but contains new information, the system must update the existing property instead of creating another row.  
Every incoming property must end in exactly one outcome:  
- New Property  
- Existing Property Updated  
- Duplicate (Nothing New)  
Never anything else.

## Duplicate Detection Timing  
Detection happens only after the user sends "Done."  
Never while the session is still collecting information.

## Detection Priority  
Always compare in this order:  
1. PID  
2. Unique Key  
3. Location + Society + BHK  
4. Location + Map Link  
5. Location + Rent + BHK + Floor  
Stop as soon as a confident match is found.

## Rule 1 — PID Match  
If the user explicitly provides an existing PID, treat it as an update.  
Never create a new row.

## Rule 2 — Unique Key Match  
If the generated Unique Key already exists, treat it as the same property. Update the existing row.

## Rule 3 — Society-Based Match  
If all are equal (Society Name, Location, BHK), assume the same property.

## Rule 4 — Map Link Match  
If the normalized Google Maps link is identical, treat it as the same property.

## Rule 5 — Fallback Match  
If Society Name is blank, compare Location, Rent, BHK, and Floor. If all match, treat as an existing property.

## Standalone / Villas  
Standalone houses often have no Society name. Compare Map Location, Landmark, Rent, Floor, BHK. High confidence triggers update.

## Never Compare  
Ignore Raw Message, Message ID, Timestamp, Image URLs, Sender Phone, Date Added, Last Updated.

## Media Comparison  
Check media independently. Only upload new media. Never upload duplicate media.

## Existing Property + New Images  
If only new media arrives, update image URLs.

## Existing Property + Updated Rent  
If rent changes, update rent and last updated timestamp.

## Existing Property + Better Info  
If new info is more complete, update it.

## Existing Property + Missing Info  
Do not overwrite fields with blanks.

## Existing Property + Conflicting Info  
Latest session wins; update fields.

## Duplicate Decision Matrix  
- No match: Create a new property  
- Existing + new fields: Update property  
- Existing + only media: Add new media  
- Existing + fields + media: Update everything  
- Existing + nothing new: No change

## Summary Messages  
- New Property: Confirm addition.  
- Existing Property: Confirm update.  
- Only Media Added: Confirm media update.  
- Nothing Changed: Confirm no changes.

## Rules for AI  
Never create duplicates if one is identifiable.  
Never delete automatically.  
Never overwrite with blanks.  
Always merge, preserve history, and update timestamps.

## Future Expansion  
Support advanced matching (GPS, image fingerprinting, etc.) without changing the user flow.

## Final Principle  
Duplicate detection is about preserving quality, merging new info, and ensuring one authoritative record per property.