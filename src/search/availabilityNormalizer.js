'use strict';

/**
 * Availability Normalizer — EasyFind Search
 *
 * Converts the messy `availableFrom` (column S) values in Live Tracking
 * into a human-readable string for display and sort.
 *
 * Real-world issues handled:
 *  - Excel serial numbers (e.g. 46235 → Dec 30 1899 epoch)
 *  - "Immediately" / "Ready to occupy" variants → "Ready now"
 *  - Noisy text with an embedded date ("abl from : August 3") → extracted date
 *  - Ordinal fragments ("25th") → kept verbatim
 *  - Anything else → returned verbatim (never invented)
 */

// Excel epoch: Dec 31 1899 so that serial 1 → Jan 1 1900.
// For serials ≥ 60 we subtract 1 to correct for the Lotus 1-2-3 leap-year bug
// (serial 60 = Feb 29 1900 which never existed). Using Dec 31 + the -1 adjustment
// correctly maps serial 61 → Mar 1 1900, etc.
const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 31)); // Dec 31 1899

const READY_NOW_PATTERNS = [
  /\bimmediate(ly)?\b/i,
  /\bready\s+to\s+occupy\b/i,
  /\beasy\s+to\s+occupy\b/i,
  /\bready\s+to\s+move\b/i,
  /\bvacant\b/i,
  /\bnow\b/i,
  /\brtm\b/i,
];

const MONTH_MAP = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Convert an Excel serial date number to a JS Date.
 * Excel serial 1 = Jan 1 1900, with the Lotus 1-2-3 leap-year bug
 * (serial 60 = Feb 29 1900 which didn't exist; we skip it gracefully).
 * @param {number} serial
 * @returns {Date}
 */
function excelSerialToDate(serial) {
  // Excel incorrectly treats 1900 as a leap year — serials ≥ 60 are off by 1
  const adjusted = serial >= 60 ? serial - 1 : serial;
  return new Date(EXCEL_EPOCH.getTime() + adjusted * 86400000);
}

/**
 * Try to extract a date embedded in noisy text.
 * Returns a formatted string if found, null otherwise.
 * @param {string} text
 * @returns {string|null}
 */
function extractEmbeddedDate(text) {
  // Pattern: "August 3", "3 August", "Aug 2026", "3rd Aug", "25th July 2026", etc.
  const monthPattern = Object.keys(MONTH_MAP).join('|');
  const re = new RegExp(
    `(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthPattern})|(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:\\s+(\\d{4}))?`,
    'i'
  );
  const m = text.match(re);
  if (!m) return null;

  let day, monthName, year;
  if (m[1] && m[2]) {
    day = parseInt(m[1], 10);
    monthName = m[2].toLowerCase();
    year = m[5] ? parseInt(m[5], 10) : new Date().getFullYear();
  } else if (m[3] && m[4]) {
    monthName = m[3].toLowerCase();
    day = parseInt(m[4], 10);
    year = m[5] ? parseInt(m[5], 10) : new Date().getFullYear();
  } else {
    return null;
  }

  const month = MONTH_MAP[monthName];
  if (month === undefined || day < 1 || day > 31) return null;

  const date = new Date(year, month, day);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Normalize an `availableFrom` cell value for display.
 * @param {string|null|undefined} raw
 * @returns {string} human-readable availability string
 */
function normalizeAvailability(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return '';

  const trimmed = raw.trim();

  // Excel serial number?
  const asNum = Number(trimmed);
  if (!isNaN(asNum) && asNum > 1000 && asNum < 100000) {
    const d = excelSerialToDate(asNum);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // "Ready now" patterns
  for (const pat of READY_NOW_PATTERNS) {
    if (pat.test(trimmed)) return 'Ready now';
  }

  // Try to extract an embedded date from noisy text
  const embedded = extractEmbeddedDate(trimmed);
  if (embedded) return embedded;

  // Verbatim fallback — never invent a date
  return trimmed;
}

/**
 * Parse the normalized availability into a sort-friendly timestamp.
 * "Ready now" → 0 (earliest), parseable date → timestamp, unknown → Infinity.
 * @param {string} normalized
 * @returns {number}
 */
function availabilitySortKey(normalized) {
  if (!normalized || normalized === 'Ready now') return 0;

  // Try to parse a full date string like "1 August 2026"
  const parsed = Date.parse(normalized);
  if (!isNaN(parsed)) return parsed;

  return Infinity;
}

module.exports = { normalizeAvailability, availabilitySortKey };
