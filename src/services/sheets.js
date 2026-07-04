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
  const { clientEmail, privateKey } = config.google;

  if (!clientEmail || !privateKey) {
    logger.warn('Google Sheets credentials not configured (CLIENT_EMAIL / PRIVATE_KEY missing)');
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key:  privateKey,
    },
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
 * In-process mutex that serializes the full PID-generation + Sheets-append
 * critical section. Holding the lock through both the row-count read AND the
 * append prevents two concurrent sessions from computing the same sequence
 * number before either commit lands.
 *
 * Single-process guard — one Render instance at a time, which is the
 * deployment model described in docs/architecture/10_system_architecture.md.
 */
let _pidLock = Promise.resolve();

/**
 * Atomically generate the next PID, upload media, and append the property row
 * to Google Sheets — all inside a single serialized critical section.
 *
 * Holding the lock from row-count read through append prevents any concurrent
 * session from receiving the same PID before either write commits.
 *
 * The Cloudinary upload also runs inside the lock so the real PID is available
 * for deterministic public_id naming before the row is written.
 *
 * @param {Object} property — normalized property fields
 * @param {Function} getImageUrls — async (pid: string) => string[]
 *   Called inside the lock with the confirmed PID. Must throw on failure.
 * @param {string} senderPhone
 * @param {string} messageId
 * @param {Object} [options]
 * @param {Function} [options.pidGenerator] — (date: Date, seq: number) => string
 *   Defaults to legacy PID format. Pass generateEFPID for the new inventory flow.
 * @returns {Promise<{ok: boolean, pid: string|null}>}
 */
function generatePIDAndAppend(property, getImageUrls, senderPhone, messageId, options = {}) {
  const pidGen = (typeof options.pidGenerator === 'function')
    ? options.pidGenerator
    : generatePID;

  _pidLock = _pidLock.then(async () => {
    // 1. Read current rows to determine today's sequence number.
    //    FAIL-CLOSED: if the read fails or returns null for any reason, abort
    //    the entire operation. Generating a PID against an unknown row-count
    //    would risk duplicate PIDs; no write must ever occur in that state.
    const rows = await getAllRows();

    if (rows === null) {
      logger.error('generatePIDAndAppend aborted — Sheets row read returned null; cannot guarantee unique PID', {
        senderPhone,
        messageId,
      });
      return { ok: false, pid: null, reason: 'SHEETS_READ_FAILURE' };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let todayCount = 0;
    for (let i = 1; i < rows.length; i++) {
      const dateAdded = rows[i][COLUMN_ORDER.indexOf('dateAdded')];
      if (dateAdded && dateAdded.startsWith(todayStr)) {
        todayCount++;
      }
    }

    const pid = pidGen(today, todayCount + 1);

    // 2. Upload media (if any) using the confirmed PID — still inside lock.
    //    Any upload failure throws, which propagates to the catch below.
    const imageUrls = await getImageUrls(pid);

    // 3. Append row — still inside lock.
    const ok = await appendProperty(property, pid, imageUrls, senderPhone, messageId);
    return { ok, pid };
  }).catch((err) => {
    logger.error('generatePIDAndAppend failed', { error: err.message });
    return { ok: false, pid: null, reason: 'UNEXPECTED_ERROR' };
  });

  return _pidLock;
}

/**
 * @deprecated Use generatePIDAndAppend instead. Kept for reference only.
 * Generates a PID without holding the lock through the append — unsafe for
 * concurrent sessions. Will be removed once all callers migrate.
 */
function generateNextPID() {
  logger.warn('generateNextPID called outside lock — use generatePIDAndAppend for write safety');
  return Promise.resolve(generatePID(new Date(), Date.now() % 1000));
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

/**
 * Find the MOST RECENTLY ADDED row matching a given PID.
 * Because PID is not guaranteed unique in Live Tracking (known data issue),
 * we scan all rows and return the last match. Always resolves by row index.
 * @param {string} pid
 * @returns {Promise<{rowIndex: number, data: Object}|null>}
 */
async function findByPidLatest(pid) {
  const rows = await getAllRows();
  if (!rows) return null;

  let result = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if ((row[0] || '').trim().toUpperCase() === pid.trim().toUpperCase()) {
      const data = {};
      COLUMN_ORDER.forEach((col, idx) => {
        data[col] = row[idx] || null;
      });
      // Overwrite on each match — last one wins (most recently added)
      result = { rowIndex: i + 1, data };
    }
  }

  if (!result) return null;

  if (result) {
    logger.debug('findByPidLatest resolved', { pid, rowIndex: result.rowIndex });
  }
  return result;
}

/**
 * Append a row to any named tab in the spreadsheet.
 * Used for Search's Leads and Watch_List tabs (never touches Live Tracking).
 * Creates the tab implicitly via Google Sheets append (it will error if the
 * tab doesn't exist — the tab must be created manually or via the sheet UI).
 * @param {string} tabName — exact tab name
 * @param {Array<string>} values — row values in order
 * @returns {Promise<boolean>}
 */
async function appendToTab(tabName, values) {
  const sheets = getSheetsClient();
  if (!sheets) {
    logger.warn('appendToTab: Google Sheets not configured', { tabName });
    return false;
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${tabName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values.map((v) => (v === null || v === undefined ? '' : String(v)))] },
    });
    logger.info('appendToTab success', { tabName, cols: values.length });
    return true;
  } catch (err) {
    logger.error('appendToTab failed', { tabName, error: err.message });
    return false;
  }
}

module.exports = {
  COLUMN_ORDER,
  getAllRows,
  appendProperty,
  findByPid,
  findByPidLatest,
  updateImageUrls,
  generateNextPID,
  generatePIDAndAppend,
  appendToTab,
};
