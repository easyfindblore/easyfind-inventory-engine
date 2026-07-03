# Repository Guide

## Introduction

This guide outlines the standards and conventions for the **EasyFind Inventory Engine** repository. Adhering to these standards ensures consistency, maintainability, and clarity for all contributors.

## Naming Conventions

### Folders
- Use lowercase.
- Use hyphens for spaces (e.g., `issue-templates`).
- Keep names concise and descriptive.

### Documents
- Use lowercase.
- Use underscores for spaces (e.g., `system_architecture.md`).
- Prefix with a two-digit number for ordering (e.g., `01_inventory_sheet_specification.md`).

## Markdown Standards
- Use GitHub Flavored Markdown (GFM).
- Ensure every document has a clear title (H1).
- Use subheadings (H2, H3) for logical sections.
- Use tables for structured data and comparisons.
- Maintain consistent spacing and formatting.

## Versioning Policy
- Documents use semantic-like versioning (e.g., `v1.0`).
- Major version increments for breaking changes or significant redesigns.
- Minor version increments for additions or clarifications.

## Git Standards

### Branching Strategy
- `main`: Production-ready documentation and code.
- `develop`: Integration branch for features and fixes.
- `feature/*`: New features or major documentation updates.
- `hotfix/*`: Urgent fixes.
- `release/*`: Preparation for a new release.

### Commit Messages
- Use the imperative mood (e.g., "Add documentation index").
- Prefix with the scope (e.g., `docs:`, `feat:`, `fix:`).
- Keep the subject line under 50 characters.

## Issue and Pull Request Workflow
1.  **Open an Issue**: Use the appropriate template.
2.  **Create a Branch**: Branch from `develop`.
3.  **Submit a Pull Request**: Link to the issue and provide a clear description of changes.
4.  **Review**: At least one peer review is required before merging.
5.  **Merge**: Merge into `develop`, then periodically into `main`.

---
© 2026 EasyFind. All rights reserved.
