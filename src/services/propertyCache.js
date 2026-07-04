'use strict';

/**
 * Property Cache — EasyFind Search
 *
 * Loads all rows from `Live Tracking` into memory and refreshes every 5 minutes.
 * Read-only — never writes to the sheet.
 *
 * Only rows where availability === 'Available' are included.
 * Each property in the cache has its 1-based rowIndex preserved so the
 * search engine can use it as the true unique handle (PID is not unique).
 */

const { google } = require('googleapis');
const logger = require('../utils/logger');
const { config } = require('../config/config');
const { COLUMN_ORDER } = require('./sheets');
const { normalizeAvailability } = require('../search/availabilityNormalizer');

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

/** @type {Array<{ rowIndex: number, data: Object }>} */
let _cache = [];
let _lastLoaded = null;

function getSheetsClient() {
  const { clientEmail, privateKey } = config.google;
  if (!clientEmail || !privateKey) return null;

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Load all Available properties from Live Tracking into the cache.
 */
async function loadProperties() {
  const sheets = getSheetsClient();
  if (!sheets) {
    logger.warn('PropertyCache: Google Sheets not configured — skipping load');
    return;
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.sheetName}!A:AE`,
    });

    const rows = res.data.values || [];
    const properties = [];

    // rows[0] is the header row — skip it
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const data = {};
      COLUMN_ORDER.forEach((col, idx) => {
        data[col] = (row[idx] || '').trim() || null;
      });

      // Only index Available properties
      if (!data.availability || data.availability.trim() !== 'Available') continue;

      // Pre-compute normalized availability for display/sort
      data._availabilityDisplay = normalizeAvailability(data.availableFrom);

      // Pre-compute image/video URL arrays (classify by URL path)
      const urlList = (data.imageUrls || '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);

      data._imageList = urlList.filter((u) => u.includes('/image/upload/'));
      data._videoList = urlList.filter((u) => u.includes('/video/upload/'));
      data._allUrls = urlList;

      // rowIndex is 1-based (Google Sheets row number; header is row 1)
      properties.push({ rowIndex: i + 1, data });
    }

    _cache = properties;
    _lastLoaded = new Date();
    logger.info(`PropertyCache: loaded ${properties.length} available properties`);
  } catch (err) {
    logger.error('PropertyCache: failed to load', { error: err.message });
    // Keep stale cache rather than clearing — better to serve old data than none
  }
}

/**
 * Get the cached list of available properties.
 * @returns {Array<{ rowIndex: number, data: Object }>}
 */
function getProperties() {
  return _cache;
}

/**
 * Get the cache load timestamp.
 * @returns {Date|null}
 */
function getLastLoaded() {
  return _lastLoaded;
}

/**
 * Start the 5-minute background refresh.
 * Call once from src/index.js bootstrap.
 */
function startRefresh() {
  loadProperties(); // initial load (non-blocking)
  setInterval(loadProperties, REFRESH_MS).unref();
}

/**
 * Force a synchronous-style refresh (returns a promise).
 * Used after a new property is added so the cache stays warm.
 */
async function forceRefresh() {
  await loadProperties();
}

module.exports = { getProperties, getLastLoaded, startRefresh, forceRefresh, loadProperties };
