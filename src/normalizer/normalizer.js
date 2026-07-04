'use strict';

/**
 * Normalizer — EasyFind Inventory Engine
 *
 * Converts parsed raw values into Google Sheets dropdown-compliant values.
 * Reference: docs/contracts/03_mapping_rules.md
 *
 * Principles:
 *  - Never modify the raw message
 *  - Only normalized values go to the sheet
 *  - Unknown values → blank (null), never guessed
 *  - Latest value wins for duplicates
 */

const logger = require('../utils/logger');

// ─── Apartment Type Mapping ───────────────────────────────────────────────────

// Apartment type patterns are evaluated top-to-bottom; first match wins.
// Each entry may have an `exclude` list that must NOT match (checked before patterns).
// Patterns are anchored to prevent partial cross-matching (e.g. "semi furnished" ≠ "semi gated").
const APARTMENT_TYPE_MAP = [
  // ── Semi Gated (must come before Gated Community to avoid "semi gated" → Gated Community) ──
  {
    output: 'Semi Gated',
    patterns: [
      /^semi[\s-]?gated(\s+(community|apartment|society|flat|complex))?$/i,
      /^semi[\s-]?gated\s+area$/i,
      // standalone "semi" only when clearly not "semi furnished"
      /^semi$/i,
    ],
    // "semi furnished", "semi-furnished" must NEVER match here
    exclude: [/furnished/i],
  },

  // ── Gated Community ──────────────────────────────────────────────────────────
  {
    output: 'Gated Community',
    patterns: [
      // simple "gated" / "gated community" / "gated apartment" / "gated society"
      /^gated(\s+(community|apartment|society|flat|complex|area|colony|layout|project))?$/i,
      // "apartment(s) in gated community/society/layout"
      /^apartments?\s+in\s+gated(\s+(community|society|layout|complex|project))?$/i,
      // "flat(s) in gated …"
      /^flats?\s+in\s+gated(\s+(community|society|layout|complex|project))?$/i,
      // "gated community property" / "gated society property" etc.
      /^gated\s+(community|apartment|society|flat|complex|area|colony|layout|project)\s+(property|flat|apartment|unit|area|complex)$/i,
      // "community" alone → almost always gated in practice
      /^community$/i,
    ],
  },

  // ── Stand Alone ───────────────────────────────────────────────────────────────
  {
    output: 'Stand Alone',
    patterns: [
      /^stand[\s-]?alone$/i,
      /^standalone$/i,
      /^independent\s+(house|villa|floor|apartment|flat|building|bungalow|duplex|property|home|unit)$/i,
      /^villa$/i,
      /^duplex\s+villa$/i,
      /^row\s+house$/i,
      /^bungalow$/i,
    ],
  },
];

function normalizeApartmentType(raw) {
  if (!raw) return null;
  const s = raw.trim();

  for (const entry of APARTMENT_TYPE_MAP) {
    if (entry.exclude && entry.exclude.some((ex) => ex.test(s))) continue;
    if (entry.patterns.some((p) => p.test(s))) {
      return entry.output;
    }
  }

  // "apartment", "flat", "society" alone are genuinely ambiguous — return null
  // so the session manager re-prompts the sender for clarification.
  logger.debug('normalizeApartmentType: no match — will re-prompt sender', { raw: s });
  return null;
}

// ─── Furnishing Mapping ───────────────────────────────────────────────────────

function normalizeFurnishing(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  if (/^fully\s*furnished$|^fully$|^ff$/.test(s)) return 'Fully Furnished';
  if (/^semi\s*furnished$|^sf$/.test(s)) return 'Semi Furnished';
  if (/^partially\s*furnished$|^partial\s*furnished$/.test(s)) return 'Partially Furnished';
  if (/^unfurnished$|^uf$/.test(s)) return 'Unfurnished';

  return null;
}

// ─── BHK Normalization ────────────────────────────────────────────────────────

function normalizeBHK(raw) {
  if (!raw) return null;
  // Already extracted as "2 BHK" by parser; just clean spacing
  const s = raw.trim();
  const match = s.match(/(\d+)\s*(BHK|RK)/i);
  if (!match) return null;
  return `${match[1]} ${match[2].toUpperCase()}`;
}

// ─── Pets Mapping ─────────────────────────────────────────────────────────────

function normalizePets(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'yes' || s === 'allowed') return 'Yes';
  if (s === 'no' || s === 'not allowed') return 'No';
  return null;
}

// ─── Society Name Capitalization ──────────────────────────────────────────────

function normalizeSocietyName(raw, apartmentType) {
  if (!raw) return null;

  // Stand Alone / Independent House properties never have a Society Name —
  // enforced here as a safety net regardless of what the parser captured.
  if (apartmentType === 'Stand Alone') return null;

  const s = raw.trim();

  // A URL/maps link must never be stored as a society name, regardless of
  // how it ended up in the parsed value (defense-in-depth alongside the
  // parser's own cleanup).
  if (/https?:\/\/|www\.|goo\.gl|maps\.google|maps\.app/i.test(s)) return null;

  // Pure landmark descriptions ("Opposite Decathlon", "Near Metro Station")
  // are not society names — regardless of apartment type. A landmark
  // mentioned under a Gated Community is just as invalid as one under a
  // Stand Alone listing.
  const landmarkPrefixes = /^(near|opposite|next\s*to|behind|beside|adj(?:acent)?\s*to)\b/i;
  if (landmarkPrefixes.test(s)) return null;

  // Title-case the name
  return s
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ─── Veg/Non-Veg Restriction ───────────────────────────────────────────────────

/**
 * Normalize the Vegetarian Restriction field.
 * Populates "Vegetarian" only when the broker explicitly mentions
 * Vegetarian / Vegetarian Only / Veg Only / Vegetarian Family.
 * Any other explicit statement (e.g. "Non Veg OK") or no mention at all
 * defaults to "No Restriction" — the field is never left blank and is
 * never inferred as Vegetarian without an explicit mention.
 * @param {string} raw
 * @returns {string} 'Vegetarian' | 'No Restriction'
 */
function normalizeVegNonVeg(raw) {
  if (!raw) return 'No Restriction';
  const s = raw.trim().toLowerCase();

  if (/non[\s-]?veg/.test(s)) return 'No Restriction';
  if (/vegetarian|veg\s*only/.test(s)) return 'Vegetarian';

  return 'No Restriction';
}

// ─── Preferred Tenant Mapping ──────────────────────────────────────────────────

// Broker input is normalized before writing to Google Sheets so that
// capitalization, spacing and wording variants never fail to map onto the
// LOV. First matching group wins; comparison is case-insensitive with
// whitespace collapsed.
const TENANT_TYPE_MAP = [
  { output: 'Family Only', match: ['family', 'family only', 'families', 'family preferred'] },
  { output: 'Anyone', match: ['anyone', 'any', 'open for all', 'all', 'anyone preferred'] },
  { output: 'Bachelor', match: ['bachelor', 'bachelors', 'bachelor preferred'] },
  { output: 'Working Professionals', match: ['working professionals'] },
  { output: 'Professionals', match: ['professionals'] },
  { output: 'Corporate', match: ['corporate'] },
  { output: 'Students', match: ['students', 'student'] },
];

function normalizeTenantType(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '');
  if (!s) return null;
  const key = s.toLowerCase();

  for (const entry of TENANT_TYPE_MAP) {
    if (entry.match.includes(key)) return entry.output;
  }

  // No exact LOV match (e.g. "Family & Male Bachelors") — preserve the
  // broker's original text rather than guessing or blanking it out.
  logger.debug('normalizeTenantType: no LOV match — preserving original text', { raw: s });
  return s;
}

// ─── Available From Normalization ─────────────────────────────────────────────

// Phrases that mean "available right now" — mapped to today's date.
const IMMEDIATE_AVAILABILITY = /^(immediately|immediate|ready\s*to\s*occupy|ready\s*for\s*occupancy|vacant)$/i;

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function todayDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Attempt to parse a broker-provided "Available From" date string into a
 * UTC Date (date-only, no time component). Supports the formats seen in
 * fixtures: "July 15", "15 July", "July 15 2026", "15/07/2026", "2026-07-15".
 * Returns null if the text cannot be confidently parsed as a date (e.g. it
 * is a free-form phrase) — in that case the original text is preserved.
 * @param {string} s
 * @returns {Date|null}
 */
function tryParseAvailableFromDate(s) {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); // DD/MM/YYYY

  const lower = s.toLowerCase();

  m = lower.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (m && MONTH_NAMES.includes(m[1])) {
    const year = m[3] ? +m[3] : new Date().getFullYear();
    return new Date(Date.UTC(year, MONTH_NAMES.indexOf(m[1]), +m[2]));
  }

  m = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:,?\s+(\d{4}))?$/);
  if (m && MONTH_NAMES.includes(m[2])) {
    const year = m[3] ? +m[3] : new Date().getFullYear();
    return new Date(Date.UTC(year, MONTH_NAMES.indexOf(m[2]), +m[1]));
  }

  return null;
}

/**
 * Normalize the "Available From" field per business rule:
 *  - Immediately / Immediate / Ready to Occupy / Ready For Occupancy / Vacant
 *    → today's date.
 *  - Any parseable date before today → today's date.
 *  - A future date → stored unchanged.
 *  - Unparseable free text → preserved unchanged (no guessing).
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeAvailableFrom(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  if (IMMEDIATE_AVAILABILITY.test(s)) return todayDateString();

  const parsed = tryParseAvailableFromDate(s);
  if (parsed) {
    const now = new Date();
    const todayOnly = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (parsed.getTime() < todayOnly) return todayDateString();
  }

  return s;
}

// ─── Amount (already numeric from parser) ────────────────────────────────────

function normalizeAmount(value) {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? parseFloat(value.replace(/[,\s]/g, '')) : value;
  return isNaN(n) ? null : Math.round(n);
}

// ─── Main Normalization Pipeline ──────────────────────────────────────────────

/**
 * Normalize a parsed property object.
 * @param {Object} parsed — output from messageParser.parseMessage()
 * @returns {Object} normalized property object ready for Google Sheets
 */
function normalize(parsed) {
  const normalized = { ...parsed };

  try {
    // Apartment Type
    normalized.apartmentType = normalizeApartmentType(parsed.apartmentType);

    // Furnishing
    normalized.furnishing = normalizeFurnishing(parsed.furnishing);

    // BHK
    normalized.bhk = normalizeBHK(parsed.bhk);

    // Bathrooms — keep as integer
    normalized.bathrooms = parsed.bathrooms != null ? parseInt(parsed.bathrooms, 10) : null;

    // Balcony — keep as integer
    normalized.balcony = parsed.balcony != null ? parseInt(parsed.balcony, 10) : null;

    // Utility — already 'Yes' or null from parser; no change needed

    // Pets
    normalized.petsFriendly = normalizePets(parsed.petsFriendly);

    // Society Name
    normalized.societyName = normalizeSocietyName(parsed.societyName, normalized.apartmentType);

    // Amounts
    normalized.rent = normalizeAmount(parsed.rent);
    normalized.maintenance = normalizeAmount(parsed.maintenance);
    normalized.deposit = normalizeAmount(parsed.deposit);

    // If deposit was expressed as N months and not already calculated
    // (parser handles this; double-check here just in case)
    if (!normalized.deposit && parsed.depositMonths && normalized.rent) {
      normalized.deposit = normalized.rent * parsed.depositMonths;
    }

    // Size — integer sqft
    normalized.size = parsed.size != null ? parseInt(parsed.size, 10) : null;

    // Floor — preserve as-is
    normalized.floor = parsed.floor || null;

    // Available From — Immediate phrases and past dates normalize to
    // today's date; future dates and unparseable text are preserved as-is.
    normalized.availableFrom = normalizeAvailableFrom(parsed.availableFrom);

    // Tenant — normalized against the Preferred Tenant LOV.
    normalized.tenantType = normalizeTenantType(parsed.tenantType);

    // Location — preserve as-is
    normalized.location = parsed.location || null;

    // Vegetarian Restriction — always explicit ('Vegetarian' or 'No
    // Restriction'), never blank and never inferred without a mention.
    normalized.vegNonVeg = normalizeVegNonVeg(parsed.vegNonVeg);

    // rawMessage — NEVER modified
    normalized.rawMessage = parsed.rawMessage;

  } catch (err) {
    logger.error('Normalizer error', { error: err.message });
  }

  logger.debug('Normalizer result', {
    apartmentType: normalized.apartmentType,
    furnishing: normalized.furnishing,
    rent: normalized.rent,
    deposit: normalized.deposit,
    bhk: normalized.bhk,
  });

  return normalized;
}

module.exports = { normalize };
