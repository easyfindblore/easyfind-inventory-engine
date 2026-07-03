# EasyFind Inventory Engine

## Overview

The **EasyFind Inventory Engine** is a WhatsApp-driven inventory automation system designed to streamline the collection and management of property details. The system automatically processes property information, images, videos, and map links received via WhatsApp into a master inventory stored in Google Sheets, with media assets managed through Cloudinary.

This repository serves as the **Single Source of Truth** for the project's architecture, specifications, and implementation roadmap.

## Project Goal

To build a production-grade, modular, and maintainable automation engine that:
1.  **Captures** property data through conversational WhatsApp interactions.
2.  **Parses and Normalizes** free-form text into structured data.
3.  **Validates** data against strict business rules and schema requirements.
4.  **Manages Media** by uploading assets to Cloudinary and linking them to property records.
5.  **Maintains** a master inventory in Google Sheets.
6.  **Prevents Duplicates** through intelligent detection logic.

## Repository Structure

- `docs/`: Comprehensive project documentation.
  - `specs/`: Business and functional specifications.
  - `architecture/`: Technical architecture and system design.
  - `contracts/`: Data and API contracts.
  - `schemas/`: Data structure definitions.
  - `governance/`: Repository standards and policies.
- `diagrams/`: Visual representations of system flows and architecture.
- `decisions/`: Architecture Decision Records (ADR).
- `templates/`: Issue and Pull Request templates.
- `workflows/`: CI/CD and automation workflows.

## Documentation Index

| ID | Document Name | Description |
|---|---|---|
| 01 | [Inventory Sheet Specification](docs/specs/01_inventory_sheet_specification.md) | Defines the master Google Sheet schema. |
| 02 | [Column Contract](docs/contracts/02_column_contract.md) | Parser extraction rules for WhatsApp messages. |
| 03 | [Mapping Rules](docs/contracts/03_mapping_rules.md) | Data normalization and mapping logic. |
| 04 | [Property Message Formats](docs/specs/04_property_message_formats.md) | Examples and rules for WhatsApp message parsing. |
| 05 | [API & Integration Contract](docs/contracts/05_api_integration_contract.md) | Registry of external services and credentials. |
| 06 | [WhatsApp Session Flow](docs/specs/06_whatsapp_session_flow.md) | Conversational workflow and state management. |
| 07 | [Duplicate Detection Spec](docs/specs/07_duplicate_detection_specification.md) | Logic for identifying and handling duplicate properties. |
| 08 | [Media Processing Spec](docs/specs/08_media_processing_specification.md) | Cloudinary integration and media management rules. |
| 09 | [Google Sheet Operations](docs/specs/09_google_sheet_operations.md) | CRUD operations and sheet interaction logic. |
| 10 | [System Architecture](docs/architecture/10_system_architecture.md) | High-level system design and component overview. |

## Getting Started

Refer to the [Repository Guide](docs/governance/repository_guide.md) for standards on contributing, document naming, and branch strategy.

## Implementation Roadmap

The project is divided into the following phases:
1.  **Phase 1: Repository Foundation** (Current)
2.  **Phase 2: Architecture Freeze**
3.  **Phase 3: Core Modules Development**
4.  **Phase 4: Integrations (WhatsApp, Cloudinary, Google Sheets)**
5.  **Phase 5: Testing & QA**
6.  **Phase 6: Deployment**
7.  **Phase 7: Future Enhancements**

---
© 2026 EasyFind. All rights reserved.
