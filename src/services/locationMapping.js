'use strict';

/**
 * Location Mapping Service — EasyFind Search
 *
 * Loads the `Location Mapping` tab from Google Sheets once at startup,
 * caches it in memory, and refreshes every 5 minutes.
 *
 * The sheet has ~40 master localities, each with a list of aliases/typos.
 * Example row: master="Kasavanahalli, Sarjapur Road", aliases="kasa,kasavanhalli,kasvanahalli"
 *
 * Assumed column layout in `Location Mapping` tab:
 *   A: Master Location name
 *   B: Aliases (comma-separated)
 *
 * resolveLocation(rawText) returns the master location string, or the
 * original text if no alias matches.
 */

const { google } = require('googleapis');
const logger = require('../utils/logger');
const { config } = require('../config/config');

const LOCATION_MAPPING_TAB = 'Location Mapping';
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @type {Array<{ master: string, aliases: string[] }>}
 */
let _mappings = [];
let _loaded = false;

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
 * Load (or reload) the Location Mapping tab into memory.
 */
async function loadLocationMappings() {
  const sheets = getSheetsClient();
  if (!sheets) {
    logger.warn('LocationMapping: Google Sheets not configured — skipping load');
    return;
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range: `${LOCATION_MAPPING_TAB}!A:B`,
    });

    const rows = res.data.values || [];
    const mappings = [];

    // Actual sheet layout (confirmed from live sheet):
    //   A: empty / serial number
    //   B: Master Location name  (index 1)
    //   C: Aliases — comma-separated (index 2)
    for (const row of rows) {
      const master = (row[1] || '').trim(); // column B
      if (!master || master.toLowerCase() === 'master location' || master.toLowerCase() === 'location') continue;

      const rawAliases = (row[2] || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean); // column C
      // Always include the master itself as a self-alias (normalised)
      rawAliases.push(master.toLowerCase());

      mappings.push({ master, aliases: rawAliases });
    }

    _mappings = mappings;
    _loaded = true;
    logger.info(`LocationMapping: loaded ${mappings.length} master locations`);
  } catch (err) {
    logger.error('LocationMapping: failed to load', { error: err.message });
  }
}

/**
 * Resolve a raw location string (potentially typo'd, partial, alias) to a
 * master location name. Returns the original text if no match found.
 *
 * @param {string|null} rawText
 * @returns {string|null}
 */
function resolveLocation(rawText) {
  if (!rawText || !rawText.trim()) return null;
  const query = rawText.trim().toLowerCase();

  // Exact alias match
  for (const { master, aliases } of _mappings) {
    if (aliases.includes(query)) return master;
  }

  // Partial / substring match — query is contained in an alias, or vice versa
  for (const { master, aliases } of _mappings) {
    for (const alias of aliases) {
      if (alias.includes(query) || query.includes(alias)) {
        return master;
      }
    }
  }

  // No match — return raw text (let search engine do a loose string match)
  return rawText.trim();
}

/**
 * Get all known master location names.
 * @returns {string[]}
 */
function getMasterLocations() {
  return _mappings.map((m) => m.master);
}

/**
 * Check if two location strings belong to the same cluster
 * (i.e. resolve to the same master).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameCluster(a, b) {
  if (!a || !b) return false;
  const ra = resolveLocation(a);
  const rb = resolveLocation(b);
  return ra && rb && ra.toLowerCase() === rb.toLowerCase();
}

/**
 * Start the 5-minute background refresh.
 * Call once from src/index.js bootstrap.
 */
function startRefresh() {
  loadLocationMappings(); // initial load (non-blocking)
  setInterval(loadLocationMappings, REFRESH_MS).unref();
}

module.exports = { resolveLocation, getMasterLocations, sameCluster, startRefresh, loadLocationMappings };
