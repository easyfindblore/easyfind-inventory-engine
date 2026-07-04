# Test Engineering: Start Here

## Welcome, Test Engineering Lead (Manus AI)

This directory is the official home for all **Test Engineering** assets for the EasyFind Inventory Engine. It is owned exclusively by the Test Engineering team.

### 1. The Golden Rule
**NEVER modify production source code.** Production code, architecture, and deployment are owned exclusively by the **Engineering Team (Replit)**. Your role is to validate, challenge, and attempt to break the implementation to ensure production quality.

### 2. Getting Started
Every new session must begin by reading this document and the following key resources:
- `tests/ENGINEERING_HANDOFF.md`: The communication contract between Engineering and Test Engineering.
- `tests/README.md`: The overview of the testing architecture.
- `tests/docs/testing_roadmap.md`: The current status and future backlog of testing work.

### 3. Operating Principles
- **Independence**: Maintain a clear separation between testing assets and production code.
- **Reusability**: All datasets and fixtures must be permanent, version-controlled, and reusable across builds.
- **Continuity**: Never overwrite previous work; always extend it. Append new sessions to the history.
- **Realism**: All test data must resemble real-world production scenarios.

### 4. Repository Structure
- `tests/fixtures/`: Raw input data (Messages, Webhooks, Mocks).
- `tests/expected_outputs/`: The expected results for every fixture.
- `tests/regression/`: Consolidated suites for full system validation.
- `tests/docs/`: Governance, guides, and reports.

### 5. Your Objective
Your goal is to leave this repository with a self-sustaining, production-grade automated testing framework. Use the datasets to drive the validation of every engineering update.

---
**Lead Architect's Note**: Treat the testing framework as a long-term product. Excellence in validation is what ensures the success of the EasyFind Inventory Engine.
