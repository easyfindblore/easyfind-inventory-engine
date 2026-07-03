# Test Coverage Tracker

This document tracks the coverage of business requirements by the current testing framework.

## Requirement Coverage Summary

| Module | Requirement ID | Requirement Name | Test Fixture Count | Coverage Status |
|---|---|---|---|---|
| **Parser** | REQ-01 | Field Extraction (Rent, BHK, etc.) | 100 | **100%** |
| **Parser** | REQ-02 | Google Maps Link Recognition | 100 | **100%** |
| **Validation** | REQ-03 | Missing Field Recovery | 50 | **100%** |
| **Validation** | REQ-04 | Invalid Input Handling | 50 | **100%** |
| **Duplicates** | REQ-05 | Exact Duplicate Detection | 10 | **100%** |
| **Duplicates** | REQ-06 | Near-Duplicate (Rent/Society) | 40 | **100%** |
| **Sessions** | REQ-07 | Session State Management | 30 | **90%** |
| **Media** | REQ-08 | Multi-Image Upload Counting | 5 | **50%** |
| **Search** | REQ-09 | Property Filtering Logic | 100 | **80%** |

## Coverage Gaps & Action Plan

### 1. Media Processing (High Priority)
- **Gap**: We only have 5 basic media upload fixtures.
- **Action**: Generate 20+ edge cases for media (corrupted files, large videos, multiple rapid uploads).

### 2. Session Timeouts (Medium Priority)
- **Gap**: Only 2 scenarios cover session timeouts.
- **Action**: Expand `tests/fixtures/sessions/` to include diverse timeout and resumption scenarios.

### 3. Google Sheet Edge Cases (Low Priority)
- **Gap**: Limited testing for sheet-level errors (e.g., sheet full, permissions issues).
- **Action**: Develop mock responses for API-level sheet failures.

---
**Last Updated**: July 3, 2026
