'use strict';

/**
 * Google Sheets Service — EasyFind Inventory Engine
 *
 * Reads and writes to the master inventory Google Sheet.
 * Google Sheets is the ONLY database. Never partially saves.
 *
 * Reference:
 *   - docs/specs/09_google_sheet_operations.md
 *   - docs/specs/01_inventory_sheet_specification.md
 */

const { google } = require('googleapis');
const logger = require('../utils/logger');
const { config } = require('../config/config');
const { generatePID } = require('../utils/pidGenerator');

// Column order in the Google Sheet (must match the actual sheet header row)
// Reference: docs/contracts/02_column_contract.md
const COLUMN_ORDER = [
  'pid',             // A
  'onboardingType',  // B
  'location',        // C
  'apartmentType',   // D
  'societyName',     // E
  'bhk',             // F
  'bathrooms',       // G
  'balcony',         // H
  'utility',         // I
  'size',            // J
  'floor',           // K
  'furnishing',      // L
  'tenantType',      // M
  'vegNonVeg',       // N
  'petsFriendly',    // O
  'rent',            // P
  'maintenance',     // Q
  'deposit',         // R
  'availableFrom',   // S
  'negotiation',     // T
  'visitTimings',    // U
  'availability',    // V
  'dateAdded',       // W
  'lastUpdated',     // X
  'messageId',       // Y
  'senderPhone',     // Z
  'rawMessage',      // AA
  'messageTimestamp',// AB
  'uniqueKey',       // AC
  'imageUrls',       // AD
  'mapsLink',        // AE
];

/**
 * Build an authorized Google Sheets client.
 * @returns {import('googleapis').sheets_v4.Sheets|null}
 */
function getSheetsClient() {
  const credentials = config.google.serviceAccountJson;
  if (!credentials) {
    logger.warn('Google service account credentials not configured');
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Get all rows from the sheet.
 * @returns {Promise<Array[]|null>} 2D array of cell values
 */
async function getAllRows() {
  const sheets = getSheetsClient();
  if (!sheets) return null;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.sheetName}!A:AE`,
    });
    return response.data.values || [];
  } catch (err) {
    logger.error('Google Sheets read failed', { error: err.message });
    return null;
  }
}

/**
 * Append a new property row to the sheet.
 * @param {Object} property — normalized property object
 * @param {string} pid
 * @param {string[]} imageUrls — Cloudinary URLs
 * @param {string} senderPhone
 * @param {string} messageId
 * @returns {Promise<boolean>}
 */
async function appendProperty(property, pid, imageUrls, senderPhone, messageId) {
  const sheets = getSheetsClient();
  if (!sheets) {
    logger.warn('Google Sheets not configured — property not saved');
    return false;
  }

  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];

  // Build unique key: location|bhk|rent|apartmentType
  const uniqueKey = [
    (property.location || '').toLowerCase().replace(/\s+/g, ''),
    property.bhk || '',
    property.rent || '',
    (property.apartmentType || '').toLowerCase().replace(/\s+/g, ''),
  ]
    .filter(Boolean)
    .join('|');

  // Map property to row in column order
  const enriched = {
    ...property,
    pid,
    dateAdded: dateStr,
    lastUpdated: now,
    messageId: messageId || '',
    senderPhone: senderPhone || '',
    messageTimestamp: now,
    uniqueKey,
    imageUrls: imageUrls.join(', '),
  };

  const row = COLUMN_ORDER.map((col) => {
    const val = enriched[col];
    if (val === null || val === undefined) return '';
    return String(val);
  });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.sheetName}!A:AE`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    logger.info('Property appended to Google Sheets', { pid, senderPhone });
    return true;
  } catch (err) {
    logger.error('Google Sheets append failed', { pid, error: err.message });
    return false;
  }
}

/**
 * Find a property row by PID.
 * @param {string} pid
 * @returns {Promise<{rowIndex: number, data: Object}|null>}
 */
async function findByPid(pid) {
  const rows = await getAllRows();
  if (!rows) return null;

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[0] === pid) {
      const data = {};
      COLUMN_ORDER.forEach((col, idx) => {
        data[col] = row[idx] || null;
      });
      return { rowIndex: i + 1, data }; // rowIndex is 1-based (Google Sheets)
    }
  }
  return null;
}

/**
 * Update the imageUrls column for an existing property.
 * @param {number} rowIndex — 1-based Google Sheets row number
 * @param {string[]} imageUrls
 * @returns {Promise<boolean>}
 */
async function updateImageUrls(rowIndex, imageUrls) {
  const sheets = getSheetsClient();
  if (!sheets) return false;

  const urlColumnIndex = COLUMN_ORDER.indexOf('imageUrls'); // AD = index 29 = column 30
  const colLetter = columnIndexToLetter(urlColumnIndex + 1);
  const updatedAt = COLUMN_ORDER.indexOf('lastUpdated');
  const updatedColLetter = columnIndexToLetter(updatedAt + 1);

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `${config.google.sheetName}!${colLetter}${rowIndex}`,
            values: [[imageUrls.join(', ')]],
          },
          {
            range: `${config.google.sheetName}!${updatedColLetter}${rowIndex}`,
            values: [[new Date().toISOString()]],
          },
        ],
      },
    });
    logger.info('Image URLs updated in Google Sheets', { rowIndex });
    return true;
  } catch (err) {
    logger.error('Google Sheets update failed', { rowIndex, error: err.message });
    return false;
  }
}

/**
 * In-process lock to prevent concurrent PID generation races.
 * Single-process guard — sufficient for one Render instance.
 */
let _pidLock = Promise.resolve();

/**
 * Generate the next available PID in a serialized, collision-safe way.
 * Uses a chained promise lock so concurrent sessions cannot read the same
 * row count before either has written.
 * @returns {Promise<string>}
 */
function generateNextPID() {
  _pidLock = _pidLock.then(async () => {
    const rows = await getAllRows();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let todayCount = 0;
    if (rows) {
      for (let i = 1; i < rows.length; i++) {
        const dateAdded = rows[i][COLUMN_ORDER.indexOf('dateAdded')];
        if (dateAdded && dateAdded.startsWith(todayStr)) {
          todayCount++;
        }
      }
    }

    return generatePID(today, todayCount + 1);
  }).catch((err) => {
    logger.error('generateNextPID failed', { error: err.message });
    // Return a fallback timestamp-based PID to avoid blocking
    return generatePID(new Date(), Date.now() % 1000);
  });

  return _pidLock;
}

/**
 * Convert a 1-based column index to a letter (e.g. 1 → A, 27 → AA).
 */
function columnIndexToLetter(index) {
  let result = '';
  while (index > 0) {
    const rem = (index - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    index = Math.floor((index - 1) / 26);
  }
  return result;
}

module.exports = {
  getAllRows,
  appendProperty,
  findByPid,
  updateImageUrls,
  generateNextPID,
};
