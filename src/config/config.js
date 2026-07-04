'use strict';

/**
 * Configuration Layer — EasyFind Inventory Engine
 * Loads and validates all environment variables.
 * Reference: docs/contracts/05_api_integration_contract.md
 *
 * Secret name mapping (Replit Workspace Secrets → config keys):
 *   WHATSAPP_TOKEN        → config.whatsapp.accessToken
 *   PHONE_NUMBER_ID       → config.whatsapp.phoneNumberId
 *   VERIFY_TOKEN          → config.whatsapp.verifyToken
 *   SPREADSHEET_ID        → config.google.spreadsheetId
 *   CLIENT_EMAIL          → config.google.clientEmail
 *   PRIVATE_KEY           → config.google.privateKey
 *   CLOUDINARY_CLOUD_NAME → config.cloudinary.cloudName
 *   CLOUDINARY_API_KEY    → config.cloudinary.apiKey
 *   CLOUDINARY_API_SECRET → config.cloudinary.apiSecret
 */

require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Meta WhatsApp Cloud API
  whatsapp: {
    accessToken:   process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.PHONE_NUMBER_ID || '',
    verifyToken:   process.env.VERIFY_TOKEN || '',
    apiVersion: 'v19.0',
    get apiBaseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}`;
    },
  },

  // Google Sheets — authenticated via service-account CLIENT_EMAIL + PRIVATE_KEY
  google: {
    spreadsheetId: process.env.SPREADSHEET_ID || '',
    sheetName:     process.env.GOOGLE_SHEET_NAME || 'Live Tracking',
    clientEmail:   process.env.CLIENT_EMAIL || '',
    // Render / Replit store the key with literal \n; normalise to real newlines.
    privateKey:    (process.env.PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey:    process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder:    'inventory',
  },

  // OpenAI — placeholder only, not active at this phase
  openai: {
    apiKey:   process.env.OPENAI_API_KEY || '',
    enabled:  false,
  },

  // Session
  session: {
    timeoutMs: 30 * 60 * 1000, // 30 minutes
  },
};

/**
 * Validate mandatory configuration.
 * Logs warnings for missing values but does not crash on startup.
 * Individual services fail gracefully when credentials are absent.
 */
function validateConfig() {
  const warnings = [];

  if (!config.whatsapp.verifyToken) {
    warnings.push('VERIFY_TOKEN is not set — GET /webhook will reject all verification challenges');
  }
  if (!config.whatsapp.accessToken) {
    warnings.push('WHATSAPP_TOKEN is not set — WhatsApp replies will fail');
  }
  if (!config.whatsapp.phoneNumberId) {
    warnings.push('PHONE_NUMBER_ID is not set — WhatsApp replies will fail');
  }
  if (!config.google.spreadsheetId) {
    warnings.push('SPREADSHEET_ID is not set — Google Sheets integration disabled');
  }
  if (!config.google.clientEmail || !config.google.privateKey) {
    warnings.push('CLIENT_EMAIL / PRIVATE_KEY not set — Google Sheets integration disabled');
  }

  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    warnings.push('Cloudinary credentials incomplete — media upload disabled');
  }

  return warnings;
}

module.exports = { config, validateConfig };
