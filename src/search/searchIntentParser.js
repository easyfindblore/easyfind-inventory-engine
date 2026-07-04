'use strict';

/**
 * Search Intent Parser — EasyFind Search
 *
 * Converts free-text customer input into a structured search intent.
 * Rule-based only — no AI, no OpenAI. Reuses referenceData.json LOVs.
 *
 * Output shape:
 * {
 *   bhk: '2 BHK' | null,
 *   budgetMax: number | null,
 *   budgetMin: number | null,
 *   rawLocation: string | null,   // resolved by searchEngine via locationMapping
 *   furnishing: 'Fully Furnished' | 'Semi Furnished' | 'Unfurnished' | null,
 *   pets: true | false | null,    // null = no preference
 *   tenantSignal: 'family' | 'bachelor' | null,
 *   hasIntent: boolean,           // true if at least one field was found
 * }
 */

const REF = require('../config/referenceData.json');

// ── BHK ──────────────────────────────────────────────────────────────────────

// Build a flat alias→value map from referenceData.json
const BHK_MAP = {};
for (const entry of REF.bhk) {
  BHK_MAP[entry.value.toLowerCase()] = entry.value;
  for (const alias of entry.aliases) {
    BHK_MAP[alias.toLowerCase()] = entry.value;
  }
}

// Regex: "2bhk", "2 bhk", "2-bhk", also handles "2.5 bhk"
const BHK_RE = /\b(\d(?:\.\d)?)\s*[-]?\s*bhk\b|\b(\d(?:\.\d)?)\s*[-]?\s*rk\b|\b(\d(?:\.\d)?)\s*bedroom/i;

function parseBhk(text) {
  // Try direct alias match first (catches "1rk", "studio", etc.)
  const lower = text.toLowerCase();
  for (const [alias, value] of Object.entries(BHK_MAP)) {
    // Only match whole words to avoid "2bhk" matching "2" inside other words
    const re = new RegExp(`(?<![\\w.])(${escapeRe(alias)})(?![\\w.])`, 'i');
    if (re.test(lower)) return value;
  }
  // Fallback regex
  const m = text.match(BHK_RE);
  if (!m) return null;
  const num = m[1] || m[2] || m[3];
  if (!num) return null;
  const key = `${num} bhk`;
  return BHK_MAP[key] || `${num} BHK`;
}

// ── Budget ────────────────────────────────────────────────────────────────────

function parseAmount(str) {
  if (!str) return null;
  const s = str.toLowerCase().replace(/,/g, '').trim();
  const kMatch = s.match(/^(\d+(?:\.\d+)?)\s*k$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const lMatch = s.match(/^(\d+(?:\.\d+)?)\s*l(?:akh)?s?$/);
  if (lMatch) return Math.round(parseFloat(lMatch[1]) * 100000);
  const plain = parseFloat(s);
  if (!isNaN(plain) && plain > 0) return Math.round(plain);
  return null;
}

function parseBudget(text) {
  let budgetMax = null;
  let budgetMin = null;

  // Range: "45k-60k", "45000 to 60000", "45k to 60k"
  const rangeRe = /(\d+(?:\.\d+)?k?)\s*(?:to|-)\s*(\d+(?:\.\d+)?k?)/i;
  const rangeM = text.match(rangeRe);
  if (rangeM) {
    budgetMin = parseAmount(rangeM[1]);
    budgetMax = parseAmount(rangeM[2]);
    return { budgetMin, budgetMax };
  }

  // Max: "under 55k", "below 60k", "max 50k", "upto 45k", "within 55k", "budget 50k", "less than 60k"
  const maxRe = /(?:under|below|max(?:imum)?|upto|up to|within|budget(?:\s+of)?|less\s+than|not\s+more\s+than)\s*([\d.,]+\s*(?:k|l(?:akh)?s?)?)/i;
  const maxM = text.match(maxRe);
  if (maxM) {
    budgetMax = parseAmount(maxM[1]);
  }

  // Min: "above 30k", "minimum 30k", "at least 30k", "more than 30k"
  const minRe = /(?:above|minimum|min(?:imum)?|at\s+least|more\s+than|greater\s+than)\s*([\d.,]+\s*(?:k|l(?:akh)?s?)?)/i;
  const minM = text.match(minRe);
  if (minM) {
    budgetMin = parseAmount(minM[1]);
  }

  // Standalone number with ₹ or "rs": "₹55000", "rs 55k"
  if (!budgetMax) {
    const currencyRe = /[₹rs]\s*([\d.,]+\s*(?:k|l(?:akh)?s?)?)/i;
    const currM = text.match(currencyRe);
    if (currM) budgetMax = parseAmount(currM[1]);
  }

  return { budgetMin, budgetMax };
}

// ── Furnishing ────────────────────────────────────────────────────────────────

const FURNISHING_MAP = {};
for (const entry of REF.furnishing) {
  FURNISHING_MAP[entry.value.toLowerCase()] = entry.value;
  for (const alias of entry.aliases) {
    FURNISHING_MAP[alias.toLowerCase()] = entry.value;
  }
}

function parseFurnishing(text) {
  const lower = text.toLowerCase();
  // Sort by alias length descending to prefer longer matches
  const aliases = Object.keys(FURNISHING_MAP).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const re = new RegExp(`(?<![\\w])(${escapeRe(alias)})(?![\\w])`, 'i');
    if (re.test(lower)) return FURNISHING_MAP[alias];
  }
  return null;
}

// ── Pets ──────────────────────────────────────────────────────────────────────

const PET_YES_RE = /\bpets?\s*(?:allowed|ok|okay|friendly|welcome|permitted)\b|\bpet\s*friendly\b|\bdog\s*allowed\b|\bcat\s*allowed\b/i;
const PET_NO_RE = /\bno\s*pets?\b|\bpets?\s*not\s*allowed\b/i;

function parsePets(text) {
  if (PET_NO_RE.test(text)) return false;
  if (PET_YES_RE.test(text)) return true;
  return null;
}

// ── Tenant signal ─────────────────────────────────────────────────────────────

const FAMILY_RE = /\bfamil(?:y|ies)\b|\bfamily[\s-]?friendly\b/i;
const BACHELOR_RE = /\bbachelor(?:s)?\b|\bsingle(?:s)?\b|\bboys?\b|\bgirls?\b/i;

function parseTenantSignal(text) {
  if (FAMILY_RE.test(text)) return 'family';
  if (BACHELOR_RE.test(text)) return 'bachelor';
  return null;
}

// ── Location extraction ───────────────────────────────────────────────────────

// Words to strip before extracting location candidate
const NOISE_WORDS = [
  'looking', 'for', 'a', 'an', 'the', 'in', 'at', 'near', 'around', 'around',
  'want', 'need', 'flat', 'apartment', 'house', 'property', 'room', 'bed',
  'bedroom', 'bhk', 'rk', 'rent', 'rental', 'lease', 'pg', 'to', 'move',
  'hi', 'hello', 'hey', 'please', 'good', 'morning', 'evening',
  'available', 'any', 'options', 'option', 'help', 'me', 'find', 'show',
  'please', 'kindly', 'searching', 'search', 'require', 'required',
  'immediate', 'immediately', 'urgently', 'urgent',
  'side', 'area', 'location', 'locality', 'place',
];
const NOISE_RE = new RegExp(`\\b(${NOISE_WORDS.join('|')})\\b`, 'gi');

// Patterns that represent budget/BHK/furnishing/pets/tenant — strip them
const STRIP_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*[-]?\s*bhk\b/gi,
  /\b\d+(?:\.\d+)?\s*[-]?\s*rk\b/gi,
  /\b\d+(?:\.\d+)?\s*bedroom/gi,
  /(?:under|below|max(?:imum)?|upto|up to|within|budget|less\s+than)\s*[\d.,]+\s*(?:k|l(?:akh)?s?)?/gi,
  /(?:above|minimum|at\s+least|more\s+than)\s*[\d.,]+\s*(?:k|l(?:akh)?s?)?/gi,
  /[\d.,]+\s*(?:k|l(?:akh)?s?)\s*(?:to|-)\s*[\d.,]+\s*(?:k|l(?:akh)?s?)/gi,
  /[₹rs]\s*[\d.,]+\s*(?:k|l(?:akh)?s?)?/gi,
  /\bfully\s+furnished\b|\bsemi[-\s]?furnished\b|\bunfurnished\b|\bfurnished\b/gi,
  /\bpets?\s*(?:allowed|ok|okay|friendly|welcome|permitted)\b/gi,
  /\bno\s*pets?\b/gi,
  /\bfamil(?:y|ies)\b|\bfamily[-\s]?friendly\b/gi,
  /\bbachelor(?:s)?\b/gi,
];

function parseLocation(text) {
  let cleaned = text;

  for (const pat of STRIP_PATTERNS) {
    cleaned = cleaned.replace(pat, ' ');
  }
  cleaned = cleaned.replace(NOISE_RE, ' ');
  // Remove punctuation except hyphens within words
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s-]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Filter out single-char leftovers and very short noise
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;

  return words.join(' ');
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse free text into a structured search intent.
 * @param {string} text
 * @returns {Object} intent
 */
function parseIntent(text) {
  if (!text || typeof text !== 'string') {
    return {
      bhk: null, budgetMax: null, budgetMin: null,
      rawLocation: null, furnishing: null, pets: null,
      tenantSignal: null, hasIntent: false,
    };
  }

  const bhk = parseBhk(text);
  const { budgetMax, budgetMin } = parseBudget(text);
  const furnishing = parseFurnishing(text);
  const pets = parsePets(text);
  const tenantSignal = parseTenantSignal(text);
  const rawLocation = parseLocation(text);

  const hasIntent = !!(bhk || budgetMax || budgetMin || rawLocation || furnishing || pets !== null || tenantSignal);

  return { bhk, budgetMax, budgetMin, rawLocation, furnishing, pets, tenantSignal, hasIntent };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseIntent };
