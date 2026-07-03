# Dataset Catalog

This catalog provides a comprehensive index of all datasets available in the testing framework.

## 1. Property Message Dataset
- **Location**: `tests/fixtures/property_messages/`
- **Total Count**: 100
- **Description**: Realistic property detail messages in various formats (bullet, paragraph, shorthand).
- **Categories**:
  - `001-025`: Standard structured messages.
  - `026-050`: Shorthand and Indian broker styles.
  - `051-075`: Paragraph style with heavy descriptive text.
  - `076-100`: Mixed language and typo-heavy messages.

## 2. Negative Dataset
- **Location**: `tests/fixtures/negative_messages/`
- **Total Count**: 50
- **Description**: Invalid, malformed, or missing-field scenarios designed to test system resilience.
- **Scenarios Covered**: Missing Rent, Missing Map Link, Invalid BHK, Spam, Random Text, Empty Messages.

## 3. Duplicate Scenario Dataset
- **Location**: `tests/fixtures/duplicates/`
- **Total Count**: 50
- **Description**: Paired messages designed to trigger duplicate detection logic.
- **Scenarios Covered**: Exact duplicates, Rent changes, Deposit changes, Location typos, Case/Spacing variations.

## 4. Session Transcript Dataset
- **Location**: `tests/fixtures/sessions/`
- **Total Count**: 30
- **Description**: Multi-turn WhatsApp conversation flows.
- **Scenarios Covered**: Add Property, Cancel, Restart, Timeout, Recovery, Unexpected Replies.

## 5. Search Query Dataset
- **Location**: `tests/fixtures/searches/`
- **Total Count**: 100
- **Description**: Natural language search queries for property filtering.
- **Scenarios Covered**: Budget-based, Location-based, BHK-based, Preference-based (Pet friendly, etc.).

---
**Last Updated**: July 3, 2026
