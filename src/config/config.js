'use strict';

/**
 * Configuration Layer — EasyFind Inventory Engine
 * Loads and validates all environment variables.
 * Reference: docs/contracts/05_api_integration_contract.md
 */

require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Meta WhatsApp Cloud API
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    appId: process.env.WHATSAPP_APP_ID || '',
    apiVersion: 'v19.0',
    get apiBaseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}`;
    },
  },

  // Google Sheets
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Live Tracking',
    get serviceAccountJson() {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: 'inventory',
  },

  // OpenAI — placeholder only, not active at this phase
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    enabled: false,
  },

  // Session
  session: {
    timeoutMs: 30 * 60 * 1000, // 30 minutes
  },
};

/**
 * Validate mandatory configuration.
 * Logs warnings for missing values but does not crash on startup.
 * Individual services will fail gracefully when credentials are absent.
 */
function validateConfig() {
  const warnings = [];

  if (!config.whatsapp.verifyToken) {
    warnings.push('WHATSAPP_VERIFY_TOKEN is not set — GET /webhook will reject all challenges');
  }
  if (!config.whatsapp.accessToken) {
    warnings.push('WHATSAPP_ACCESS_TOKEN is not set — WhatsApp replies will fail');
  }
  if (!config.whatsapp.phoneNumberId) {
    warnings.push('WHATSAPP_PHONE_NUMBER_ID is not set — WhatsApp replies will fail');
  }
  if (!config.whatsapp.appSecret) {
    warnings.push('WHATSAPP_APP_SECRET is not set — webhook signature verification disabled');
  }
  if (!config.google.spreadsheetId) {
    warnings.push('GOOGLE_SPREADSHEET_ID is not set — Google Sheets integration disabled');
  }
  if (!config.google.serviceAccountJson) {
    warnings.push('GOOGLE_SERVICE_ACCOUNT_JSON is not set or invalid — Google Sheets integration disabled');
  }
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    warnings.push('Cloudinary credentials incomplete — media upload disabled');
  }

  return warnings;
}

module.exports = { config, validateConfig };
