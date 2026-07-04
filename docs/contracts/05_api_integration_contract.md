# DOC 05 — API CONTRACT
Version: 1.0
Status: Approved
Project: EasyFind Inventory Engine
Repository: easyfind-inventory-engine

---

# Purpose

This document defines every external platform, API, credential, webhook and secret used by the EasyFind Inventory Engine.

This document is NOT for storing credentials.

It is only the master registry that tells developers:

• what service is used
• why it exists
• what credentials are required
• where those credentials belong
• what happens if the service fails

This document is considered the Source of Truth for all integrations.

---

# System Overview

Current Automation Flow

WhatsApp Business API

↓

Webhook (Render)

↓

Inventory Engine

↓

Cloudinary

↓

Google Sheets

↓

WhatsApp Response

Future integrations will be added here without changing existing architecture.

---

# Integration Registry

-----------------------------------------------------------------------

Platform
Meta WhatsApp Business Cloud API

Purpose
Receive property messages
Receive images
Receive videos
Send interactive replies
Send completion reports

Required Credentials

✓ Phone Number ID

✓ Business Account ID

✓ Permanent Access Token

✓ App ID

✓ App Secret

✓ Verify Token

✓ Webhook URL

Required Permissions

messages.read

messages.write

webhook

media

Status

Mandatory

-----------------------------------------------------------------------

Platform

Render

Purpose

Public webhook server

Runs inventory engine

Hosts API

Runs processing logic

Required Credentials

Render Service

Render Environment Variables

Webhook URL

GitHub Deployment

Status

Mandatory

-----------------------------------------------------------------------

Platform

GitHub

Purpose

Source Code

Version Control

Documentation

Deployment Source

Required Credentials

Repository Access

PAT (if required)

GitHub Account

Branch Permissions

Status

Mandatory

Repository becomes permanent project memory.

No implementation should exist outside GitHub.

-----------------------------------------------------------------------

Platform

Google Sheets API

Purpose

Inventory Database

Insert Rows

Update Rows

Read Duplicate Data

Lookup Existing Listings

Required Credentials

Google Service Account JSON

Spreadsheet ID

Sheet Name

Google Cloud Project

Status

Mandatory

---

Platform

Google Drive

Purpose

Currently none.

Reserved for future document storage if required.

Status

Optional

---

Platform

Cloudinary

Purpose

Store Images

Store Videos

Generate Secure URLs

Create Folder Structure

Required Credentials

Cloud Name

API Key

API Secret

Upload Preset (if used)

Folder Name

Status

Mandatory

Notes

Media files never stored locally.

Only Cloudinary URLs stored inside Inventory Sheet.

---

Platform

Google Maps

Purpose

Store Property Location Link

No API required currently.

Status

Optional

Future

Reverse Geocoding

Coordinate Extraction

Location Validation

---

Platform

OpenAI

Purpose

Property Parsing

Normalization

Future Search

Future Chat

Future Recommendation Engine

Required Credentials

OpenAI API Key

Project ID (if used)

Organization (optional)

Status

Mandatory

---

Platform

Node.js

Purpose

Runtime

Status

Mandatory

---

Platform

Express

Purpose

Webhook API Server

Status

Mandatory

---

Platform

Cloudinary SDK

Purpose

Media Upload

Status

Mandatory

---

Platform

Google APIs SDK

Purpose

Google Sheet Operations

Status

Mandatory

---

Platform

dotenv

Purpose

Environment Variable Loading

Status

Mandatory

---

# Environment Variables

The following variables are expected.

Never hardcode any credential.

WHATSAPP_ACCESS_TOKEN

WHATSAPP_PHONE_NUMBER_ID

WHATSAPP_VERIFY_TOKEN

WHATSAPP_APP_ID

GOOGLE_SPREADSHEET_ID

GOOGLE_SERVICE_ACCOUNT_JSON

CLOUDINARY_CLOUD_NAME

CLOUDINARY_API_KEY

CLOUDINARY_API_SECRET

OPENAI_API_KEY

PORT

NODE_ENV

---

# Webhook Registry

Webhook

Meta WhatsApp

Direction

Meta

↓

Inventory Engine

Purpose

Incoming Messages

Authentication

Verify Token

Status

Mandatory

---

Webhook

Cloudinary

Purpose

Future Upload Notifications

Status

Optional

---

# Authentication Types

Meta

Bearer Token

Google Sheets

Service Account

Cloudinary

API Key + Secret

GitHub

PAT (if required)

Render

Environment Variables

OpenAI

Bearer Token

---

# External Dependencies

Meta WhatsApp

↓

Render

↓

Inventory Engine

↓

Cloudinary

↓

Google Sheets

↓

WhatsApp Response

Failure of any mandatory dependency must stop processing and return an appropriate user-facing error.

---

# API Failure Behaviour

WhatsApp API Failure

Do not process inventory.

Notify user that message could not be delivered.

------------------------------------------------

Cloudinary Failure

Do not create inventory row.

Return:

❌ Property not added.

Reason:
Media upload failed.

------------------------------------------------

Google Sheets Failure

Do not partially save.

Return:

❌ Property not added.

Reason:
Inventory database unavailable.

------------------------------------------------

OpenAI Failure

Parsing unavailable.

Return:

❌ Property not added.

Reason:
Unable to process property details.

------------------------------------------------

Render Failure

Webhook unavailable.

Meta automatically retries.

---

# Security Rules

Never expose secrets.

Never log API Keys.

Never log Access Tokens.

Never commit .env to GitHub.

Always use HTTPS.

Validate every webhook.

Reject unknown requests.

---

# Credential Ownership Registry

| Platform | Owner | Storage |
|----------|-------|---------|
| Meta WhatsApp | EasyFind | Render Environment |
| Google Sheets | EasyFind | Service Account |
| Cloudinary | EasyFind | Render Environment |
| OpenAI | EasyFind | Render Environment |
| GitHub | EasyFind | GitHub Account |
| Render | EasyFind | Render Dashboard |

---

# Future Integrations

Reserved

CRM

Notion

Firebase

Supabase

Elasticsearch

Twilio

Google Drive

Google Calendar

Broker Dashboard

Analytics Engine

Search Engine

No changes required to existing architecture when adding future integrations.

---

# Design Principles

One responsibility per platform.

No duplicate storage.

No credentials inside repository.

Everything configurable using environment variables.

GitHub remains the permanent project memory.

Google Sheet remains the operational inventory database.

Cloudinary remains the media storage layer.

WhatsApp remains the user interface.

This contract must be updated whenever a new external platform is introduced.
