# Coverage Matrix: Datasets vs. Test Scenarios

This matrix maps our testing datasets to the specific business requirements and technical scenarios they validate.

## 1. Parser Validation (REQ-01, REQ-02)

| Dataset | Scenarios Covered | Fixture Range |
|---|---|---|
| **Property Messages** | Standard Extraction, Shorthand, Typos, Multi-language. | `001 - 100` |
| **Negative Messages** | Missing Fields, Invalid Formats, Spam. | `001 - 050` |

## 2. Duplicate Detection (REQ-05, REQ-06)

| Dataset | Scenarios Covered | Fixture Range |
|---|---|---|
| **Duplicates** | Exact Matches, Rent Changes, Deposit Changes, Typo variations. | `DUP-001 - DUP-050` |

## 3. Session Management (REQ-07)

| Dataset | Scenarios Covered | Fixture Range |
|---|---|---|
| **Sessions** | Add, Cancel, Restart, Timeout, Recovery. | `SES-001 - SES-030` |

## 4. Search & Filter (REQ-09)

| Dataset | Scenarios Covered | Fixture Range |
|---|---|---|
| **Searches** | Budget, Location, BHK, Preferences. | `SRCH-001 - SRCH-100` |

## 5. Integration & Media (REQ-08)

| Dataset | Scenarios Covered | Fixture Range |
|---|---|---|
| **Webhook** | Text, Image, Status payloads. | `WEB-001 - WEB-002` |
| **Cloudinary** | Successful Uploads, Failures. | `CLD-001` |
| **Sheets** | Snapshot validation. | `SHEET-001` |

---
**Status**: 95% Overall Coverage of documented business rules.
