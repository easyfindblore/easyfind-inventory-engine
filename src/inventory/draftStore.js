'use strict';

/**
 * Draft Store — EasyFind Inventory Engine
 *
 * Durable session storage for the Add Inventory workflow.
 * Architecture: in-memory Map (fast reads/writes) + Google Sheets "Drafts" tab
 * (persistence across restarts/crashes). Writes are debounced 400 ms to
 * batch rapid-fire updates (e.g. 20 photos in quick succession).
 *
 * Google Sheets is the ONLY database; this honours that constraint by using
 * a dedicated "Drafts" tab inside the same spreadsheet. The tab schema is
 * two columns only — senderPhone (key) + sessionData (JSON blob) — which
 * handles schema evolution without column-order migrations.
 *
 * On startup call draftStore.initialize() to load all drafts into memory.
 */

const { google } = require('googleapis');
const logger = require('../utils/logger');
const { config } = require('../config/config');

const DRAFTS_SHEET_NAME = 'Drafts';
const DEBOUNCE_MS = 400;

// ── In-memory store ───────────────────────────────────────────────────────────
/** @type {Map<string, Object>} — phone → draft object */
const _memory = new Map();

/** @type {Map<string, ReturnType<typeof setTimeout>>} — pending debounced writes */
const _pending = new Map();

let _initialized = false;

// ── Sheets client ─────────────────────────────────────────────────────────────

function _getSheetsClient() {
  const { clientEmail, privateKey } = config.google;
  if (!clientEmail || !privateKey || !config.google.spreadsheetId) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Ensure Drafts tab exists ──────────────────────────────────────────────────

async function _ensureDraftsTab(sheets) {
  if (!sheets) return;
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: config.google.spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const titles = (meta.data.sheets || []).map((s) => s.properties.title);
    if (titles.includes(DRAFTS_SHEET_NAME)) return;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: DRAFTS_SHEET_NAME } },
        }],
      },
    });
    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${DRAFTS_SHEET_NAME}!A1:B1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['senderPhone', 'sessionData']] },
    });
    logger.info('DraftStore: Drafts sheet tab created');
  } catch (err) {
    logger.warn('DraftStore: could not ensure Drafts tab', { error: err.message });
  }
}

// ── Startup: load all drafts from Sheets ─────────────────────────────────────

async function initialize() {
  if (_initialized) return;
  _initialized = true;

  const sheets = _getSheetsClient();
  if (!sheets) {
    logger.warn('DraftStore: no Sheets credentials — drafts will not survive restarts');
    return;
  }

  try {
    await _ensureDraftsTab(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${DRAFTS_SHEET_NAME}!A2:B`,
    });
    const rows = res.data.values || [];
    let loaded = 0;
    for (const row of rows) {
      const phone = row[0];
      const json = row[1];
      if (!phone || !json) continue;
      try {
        const draft = JSON.parse(json);
        _memory.set(phone, draft);
        loaded++;
      } catch (e) {
        logger.warn('DraftStore: could not parse draft row', { phone });
      }
    }
    logger.info('DraftStore initialized', { draftsLoaded: loaded });
  } catch (err) {
    logger.error('DraftStore: failed to load from Sheets', { error: err.message });
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Get the current draft for a phone, or null. */
function get(phone) {
  return _memory.get(phone) || null;
}

/** Save or update a draft (in-memory immediately, Sheets debounced). */
async function set(phone, draft) {
  _memory.set(phone, draft);
  _schedulePersist(phone);
}

/** Delete a draft (in-memory immediately, Sheets immediately). */
async function del(phone) {
  _memory.delete(phone);
  // Cancel any pending debounced write
  if (_pending.has(phone)) {
    clearTimeout(_pending.get(phone));
    _pending.delete(phone);
  }
  await _deleteFromSheets(phone);
}

/** List all drafts currently in memory. */
function listAll() {
  return [..._memory.values()];
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function _schedulePersist(phone) {
  if (_pending.has(phone)) clearTimeout(_pending.get(phone));
  const t = setTimeout(() => {
    _pending.delete(phone);
    const draft = _memory.get(phone);
    if (draft) _persistToSheets(phone, draft).catch((e) => {
      logger.warn('DraftStore: deferred persist failed', { phone, error: e.message });
    });
  }, DEBOUNCE_MS);
  if (t.unref) t.unref(); // don't block process exit
  _pending.set(phone, t);
}

async function _persistToSheets(phone, draft) {
  const sheets = _getSheetsClient();
  if (!sheets) return;

  const json = JSON.stringify(draft);
  try {
    // Find existing row for this phone
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${DRAFTS_SHEET_NAME}!A:A`,
    });
    const col = res.data.values || [];
    let rowNum = null;
    for (let i = 1; i < col.length; i++) {
      if (col[i][0] === phone) { rowNum = i + 1; break; }
    }

    if (rowNum) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.spreadsheetId,
        range: `${DRAFTS_SHEET_NAME}!A${rowNum}:B${rowNum}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[phone, json]] },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: config.google.spreadsheetId,
        range: `${DRAFTS_SHEET_NAME}!A:B`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [[phone, json]] },
      });
    }
  } catch (err) {
    logger.error('DraftStore: Sheets persist failed', { phone, error: err.message });
  }
}

async function _deleteFromSheets(phone) {
  const sheets = _getSheetsClient();
  if (!sheets) return;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${DRAFTS_SHEET_NAME}!A:A`,
    });
    const col = res.data.values || [];
    for (let i = 1; i < col.length; i++) {
      if (col[i][0] === phone) {
        const rowNum = i + 1;
        // Clear the row content (we don't delete rows to avoid index shifts)
        await sheets.spreadsheets.values.clear({
          spreadsheetId: config.google.spreadsheetId,
          range: `${DRAFTS_SHEET_NAME}!A${rowNum}:B${rowNum}`,
        });
        break;
      }
    }
  } catch (err) {
    logger.warn('DraftStore: delete from Sheets failed', { phone, error: err.message });
  }
}

// ── Exported API ──────────────────────────────────────────────────────────────

module.exports = { initialize, get, set, del, listAll };
