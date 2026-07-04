# Bug Report: BUG-001

**Title**: Parser fails to extract numeric rent from "Rent 45k + 4k maint"  
**Severity**: High  
**Status**: New

## 1. Description
The parser correctly identifies the "Rent" keyword but fails to extract the numeric value when it is followed by a maintenance addition in the same line. This results in a `null` value for the Rent column.

## 2. Reproduction Steps
1.  **Fixture Used**: `tests/fixtures/property_messages/property_message_090.md`
2.  **Input Data**: "Rent 45k + 4k maint"
3.  **Action**: Run the parser against this message.
4.  **Observation**: The parser returns `null` for Rent.

## 3. Actual vs. Expected Behavior

| Type | Details |
|---|---|
| **Expected Behavior** | Rent should be extracted as `45000`. |
| **Actual Behavior** | Rent is extracted as `null`. |

## 4. Supporting Evidence
- **Raw Message**: "2BHK Semi furn in Bellandur gated community. 2 bath, 1 balc. Rent 45k + 4k maint. Dep 1.5L..."

## 5. Suggested Engineering Fix
Update the Rent extraction regex to handle trailing text or mathematical operators (like `+`) and ensure that "k" is correctly normalized to "000" even when not at the very end of the string.

---
**Reported By**: Test Engineering Lead (Manus AI)  
**Date**: July 3, 2026
