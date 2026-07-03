# Regression Execution Guide

## Introduction

This guide provides the Implementation Team with instructions on how to utilize the testing assets provided in this repository to validate the EasyFind Inventory Engine.

## Testing Strategy

The testing strategy follows a "Black Box" approach. The engine is treated as a processing unit where specific inputs must result in predictable outputs.

### 1. Parser Validation
- **Input**: `tests/fixtures/property_messages/`
- **Verification**: Compare the extracted JSON object against `tests/expected_outputs/parser_results.json`.
- **Goal**: 100% extraction accuracy for all structured fields.

### 2. Duplicate Detection Validation
- **Input**: `tests/fixtures/duplicates/` + `tests/fixtures/sheets/mock_inventory.json`
- **Verification**: Ensure the system correctly identifies matches based on the priority rules defined in Document 07.
- **Goal**: Zero redundant rows created for duplicate scenarios.

### 3. Session Flow Validation
- **Input**: `tests/fixtures/sessions/`
- **Verification**: Replay the conversation through the session manager and verify the final state and media buffer.
- **Goal**: Correct state transitions and data persistence across multi-turn interactions.

## How to Execute Tests

1.  **Load Fixtures**: Programmatically read the files in the `tests/fixtures/` directory.
2.  **Run Engine**: Pass the fixture data through the corresponding module (Parser, Normalizer, etc.).
3.  **Assert Results**: Compare the engine's output with the corresponding file in `tests/expected_outputs/`.
4.  **Log Failures**: Document any discrepancies as bugs for the implementation team to fix.

## Reporting Issues

When a test fails, the implementation team should:
1.  Identify the specific fixture ID that caused the failure.
2.  Compare the actual output vs. the expected output.
3.  Verify if the failure is due to a bug in the code or a missing business rule in the documentation.

---
© 2026 EasyFind Test Engineering.
