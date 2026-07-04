# Fixture Catalog

This catalog indexes all technical fixtures (JSON mocks and payloads) used to validate system integrations.

## 1. Webhook Payloads
- **Location**: `tests/fixtures/webhook/`
- **Fixtures**:
  - `webhook_WEB-001.json`: Standard text message payload from Meta WhatsApp API.
  - `webhook_WEB-002.json`: Image message payload including media ID and mime type.
- **Usage**: Use these to test the entry point of the application and initial message handling.

## 2. Google Sheet Snapshots
- **Location**: `tests/fixtures/sheets/`
- **Fixtures**:
  - `sheet_SHEET-001.json`: A small inventory snapshot with 2 existing properties.
- **Usage**: Use these as the "initial state" when testing duplicate detection or search logic.

## 3. Cloudinary Mock Responses
- **Location**: `tests/fixtures/cloudinary/`
- **Fixtures**:
  - `cloudinary_CLD-001.json`: Successful upload response with secure URL and public ID.
- **Usage**: Use these to mock the response from the Cloudinary API during media processing.

## 4. Expected Outputs (Golden Standard)
- **Location**: `tests/expected_outputs/`
- **Description**: This directory will house the verified "Golden" results for every fixture to enable automated assertion.

---
**Last Updated**: July 3, 2026
