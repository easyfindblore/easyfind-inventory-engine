# Release Validation Checklist

This checklist must be completed and verified by the **Test Engineering Lead** before any production deployment.

## 1. Regression Testing
- [ ] **Full Regression Suite**: All 300+ fixtures in `tests/fixtures/` have been executed against the current build.
- [ ] **Expected Outputs**: 100% match between actual engine output and `tests/expected_outputs/`.
- [ ] **No New Regressions**: Functionality that worked in the previous build is still working.

## 2. Core Feature Validation
- [ ] **Parser Accuracy**: Verified extraction for all mandatory fields (BHK, Rent, Location, Community, Map Link).
- [ ] **Normalization**: Verified that shorthand (e.g., "45k") is correctly converted to numeric values (45000).
- [ ] **Duplicate Detection**: Verified that exact and near-duplicates are correctly flagged/updated.
- [ ] **Session Logic**: Verified that "Done", "Cancel", and "Restart" commands work as expected.

## 3. Stability & Edge Cases
- [ ] **Negative Inputs**: System handles malformed or missing data without crashing or creating corrupt rows.
- [ ] **Media Handling**: System correctly counts and processes multiple media uploads in a single session.
- [ ] **Webhook Robustness**: System handles diverse Meta WhatsApp API payload variations.

## 4. Documentation & Compliance
- [ ] **Bug Reports**: All Critical and High severity bugs discovered during validation have been resolved and verified.
- [ ] **Coverage Tracker**: Updated to reflect any new features added in this release.
- [ ] **Handover Logs**: Current testing session has been appended to `testing_session_history.md`.

---
**Validation Status**: [PENDING | PASS | FAIL]  
**Approved By**: ____________________  
**Date**: ____________________
