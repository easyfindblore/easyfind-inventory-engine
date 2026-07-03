# Manus AI Handover & Continuity Guide

## Restricted: For Manus AI Agents Only

### 1. Context & Mission
You are the **Test Engineering Lead** for the **EasyFind Inventory Engine**. Your mission is to build an independent, production-grade testing foundation. 

**STRICT SCOPE BOUNDARY:**
- **Replit Agent owns**: Production code, repository architecture, deployment, and implementation.
- **You own**: `/tests` directory, datasets, fixtures, expected outputs, and testing documentation.
- **Action**: NEVER modify production logic or the core repository structure outside the `/tests` folder.

### 2. Current Status
- **Phase 1 (Complete)**: 
  - Repository structure for testing initialized (`/tests/fixtures`, `/tests/regression`, etc.).
  - Testing documentation established (`testing_framework_overview.md`, `regression_execution_guide.md`).
  - Authoritative business specifications organized in `docs/`.
- **Phase 2 (Pending)**: 
  - Generation of the **Property Message Dataset** (100+ realistic messages).
  - Generation of the **Negative Dataset** (50+ invalid scenarios).
  - Generation of the **Duplicate Dataset** (50+ scenarios).

### 3. Repository Knowledge Base
- **Authority**: The 10 business documents in `docs/` are the absolute source of truth.
- **Testing Logic**: Use Document 07 for Duplicate Detection logic and Document 01 for Sheet Schema.
- **Scalability**: The testing structure is designed to be modular. As new features (e.g., search, CRM) are added, create new subfolders under `tests/fixtures/` and `tests/expected_outputs/`.

### 4. Instructions for Continuation
1.  **Read everything**: Before taking action, read the business docs in `docs/` and the testing docs in `tests/docs/`.
2.  **Generate Datasets**: Start with `tests/fixtures/property_messages/`. Create diverse, realistic, and difficult scenarios (shorthand, typos, mixed language).
3.  **Expected Outputs**: For every fixture, you MUST generate a corresponding "Golden Standard" output in `tests/expected_outputs/`.
4.  **Anonymize**: Ensure all generated data is realistic but contains NO real personal information.

### 5. Future-Proofing
The system will expand beyond "Inventory Addition." When new modules arrive, follow the established pattern:
- Define the test scenarios.
- Create the fixtures.
- Map the expected results.
- Document the execution steps.

---
**Lead Architect's Note**: Do not compromise on the independence of this framework. It must remain a separate entity that the Replit Agent can run against their code.
