'use strict';

/**
 * Search Engine — EasyFind Search
 *
 * Five steps per §3 of the spec:
 *  1. Filter: Available rows only, BHK, rent ≤ budget, location cluster, tenant compat, pets
 *  2. Rank: closest to budget ceiling, more images, more recently added
 *  3. Diversity pass: no two same societyName in top 3
 *  4. Zero-result fallback: loosen budget by 10%, same location cluster
 *  5. Watch_List capture if truly nothing matches
 */

const logger = require('../utils/logger');
const { getProperties } = require('../services/propertyCache');
const { resolveLocation, sameCluster } = require('../services/locationMapping');
const { isTenantCompatible } = require('./tenantCompatibility');
const { availabilitySortKey } = require('./availabilityNormalizer');

const BUDGET_HEADROOM = 0.10; // 10% over budget for fallback pass

/**
 * Run a search against the property cache.
 *
 * @param {Object} intent — from searchIntentParser
 * @returns {{
 *   results: Array,
 *   total: number,
 *   relaxed: boolean,   // true if budget was loosened
 *   fallback: boolean,  // true if location cluster was broadened
 * }}
 */
function search(intent) {
  const allProperties = getProperties();

  // ── Resolve location ──────────────────────────────────────────────────────
  const resolvedLocation = intent.rawLocation ? resolveLocation(intent.rawLocation) : null;

  // ── Pass 1: strict filter ─────────────────────────────────────────────────
  let matches = filterProperties(allProperties, intent, resolvedLocation, false);

  if (matches.length > 0) {
    const ranked = rank(matches, intent);
    const diverse = diversityPass(ranked);
    return { results: diverse, total: diverse.length, relaxed: false, fallback: false };
  }

  // ── Pass 2: loosen budget by 10% ─────────────────────────────────────────
  if (intent.budgetMax) {
    const relaxedIntent = { ...intent, budgetMax: Math.round(intent.budgetMax * (1 + BUDGET_HEADROOM)) };
    matches = filterProperties(allProperties, relaxedIntent, resolvedLocation, false);
    if (matches.length > 0) {
      const ranked = rank(matches, relaxedIntent);
      const diverse = diversityPass(ranked);
      return { results: diverse, total: diverse.length, relaxed: true, fallback: false };
    }
  }

  // ── Pass 3: same location cluster (no budget constraint) ─────────────────
  if (resolvedLocation) {
    matches = filterProperties(allProperties, { ...intent, budgetMax: null, budgetMin: null }, resolvedLocation, true);
    if (matches.length > 0) {
      const ranked = rank(matches, intent);
      const diverse = diversityPass(ranked);
      return { results: diverse, total: diverse.length, relaxed: true, fallback: true };
    }
  }

  return { results: [], total: 0, relaxed: false, fallback: false };
}

/**
 * Filter the property list against an intent.
 * @param {Array} properties
 * @param {Object} intent
 * @param {string|null} resolvedLocation
 * @param {boolean} clusterOnly — if true, match entire location cluster ignoring budget
 * @returns {Array}
 */
function filterProperties(properties, intent, resolvedLocation, clusterOnly) {
  return properties.filter(({ data }) => {
    // ── BHK ──────────────────────────────────────────────────────────────
    if (intent.bhk) {
      const propBhk = (data.bhk || '').trim();
      if (propBhk.toLowerCase() !== intent.bhk.toLowerCase()) return false;
    }

    // ── Rent ─────────────────────────────────────────────────────────────
    if (!clusterOnly && intent.budgetMax) {
      const rent = parseRent(data.rent);
      if (rent === null || rent > intent.budgetMax) return false;
    }
    if (!clusterOnly && intent.budgetMin) {
      const rent = parseRent(data.rent);
      if (rent === null || rent < intent.budgetMin) return false;
    }

    // ── Location ──────────────────────────────────────────────────────────
    if (resolvedLocation) {
      const propLocation = (data.location || '').trim();
      if (!locationsMatch(propLocation, resolvedLocation)) return false;
    }

    // ── Tenant compatibility ───────────────────────────────────────────────
    if (!isTenantCompatible(data.tenantType, intent.tenantSignal)) return false;

    // ── Pets ──────────────────────────────────────────────────────────────
    if (intent.pets === true) {
      const pets = (data.petsFriendly || '').toLowerCase();
      if (!pets.includes('yes') && !pets.includes('allowed') && !pets.includes('ok')) return false;
    }

    // ── Furnishing ────────────────────────────────────────────────────────
    if (intent.furnishing) {
      const propFurnishing = (data.furnishing || '').trim();
      if (propFurnishing.toLowerCase() !== intent.furnishing.toLowerCase()) return false;
    }

    return true;
  });
}

/**
 * Rank properties: closest to budget ceiling first, then image count, then dateAdded (newest).
 * @param {Array} properties
 * @param {Object} intent
 * @returns {Array}
 */
function rank(properties, intent) {
  return [...properties].sort((a, b) => {
    const rentA = parseRent(a.data.rent) || 0;
    const rentB = parseRent(b.data.rent) || 0;

    // Closest to budget ceiling (without exceeding it) first
    if (intent.budgetMax) {
      const diffA = intent.budgetMax - rentA;
      const diffB = intent.budgetMax - rentB;
      // Both within budget — smaller diff wins
      const aOver = rentA > intent.budgetMax;
      const bOver = rentB > intent.budgetMax;
      if (!aOver && !bOver) {
        if (diffA !== diffB) return diffA - diffB;
      } else if (aOver && !bOver) {
        return 1; // b wins
      } else if (!aOver && bOver) {
        return -1; // a wins
      }
    }

    // More images (quality proxy)
    const imgA = (a.data._imageList || []).length;
    const imgB = (b.data._imageList || []).length;
    if (imgA !== imgB) return imgB - imgA;

    // More recently added
    const dateA = Date.parse(a.data.dateAdded) || 0;
    const dateB = Date.parse(b.data.dateAdded) || 0;
    return dateB - dateA;
  });
}

/**
 * Diversity pass: if two of the top 3 share the same societyName,
 * drop the lower-ranked duplicate and pull the next distinct one up.
 * @param {Array} ranked
 * @returns {Array}
 */
function diversityPass(ranked) {
  if (ranked.length <= 3) return ranked;

  const result = [];
  const usedSocieties = new Set();
  const remainder = [];

  for (const prop of ranked) {
    const society = (prop.data.societyName || '').trim().toLowerCase();
    if (result.length < 3) {
      if (!society || !usedSocieties.has(society)) {
        result.push(prop);
        if (society) usedSocieties.add(society);
      } else {
        remainder.push(prop);
      }
    } else {
      remainder.push(prop);
    }
  }

  // Backfill from remainder — prefer unseen societies first
  const remainderCopy = [...remainder];
  remainder.length = 0;
  for (const prop of remainderCopy) {
    if (result.length >= 3) { remainder.push(prop); continue; }
    const s = (prop.data.societyName || '').trim().toLowerCase();
    if (!s || !usedSocieties.has(s)) {
      result.push(prop);
      if (s) usedSocieties.add(s);
    } else {
      remainder.push(prop);
    }
  }
  // If still short after distinct-society pass, fill with anything left
  while (result.length < 3 && remainder.length > 0) {
    result.push(remainder.shift());
  }

  // Return top 3 + all remaining (for pagination)
  return [...result, ...remainder];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse rent to a number, handling "₹55,000" etc.
 * @param {string|null} raw
 * @returns {number|null}
 */
function parseRent(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Check if a property's location matches the resolved search location.
 * Uses exact match, cluster match, and substring match.
 * @param {string} propLocation
 * @param {string} resolvedLocation
 * @returns {boolean}
 */
function locationsMatch(propLocation, resolvedLocation) {
  if (!propLocation || !resolvedLocation) return false;

  const pl = propLocation.toLowerCase();
  const rl = resolvedLocation.toLowerCase();

  if (pl === rl) return true;
  if (pl.includes(rl) || rl.includes(pl)) return true;

  // Check cluster membership
  if (sameCluster(propLocation, resolvedLocation)) return true;

  return false;
}

/**
 * Build a short highlight line for a property card.
 * Picks the most interesting single fact to show.
 * @param {Object} data — property data object
 * @returns {string}
 */
function buildHighlightLine(data) {
  const parts = [];

  const furnishing = (data.furnishing || '').trim();
  if (furnishing) parts.push(furnishing);

  const apartmentType = (data.apartmentType || '').trim();
  if (apartmentType && apartmentType !== 'Stand Alone') parts.push(apartmentType);

  const pets = (data.petsFriendly || '').toLowerCase();
  if (pets.includes('yes') || pets.includes('allowed') || pets.includes('ok')) {
    parts.push('pets allowed');
  }

  const avail = data._availabilityDisplay || '';
  if (avail && avail !== 'Ready now') {
    parts.push(`ready ${avail}`);
  } else if (avail === 'Ready now') {
    parts.push('ready now');
  }

  return parts.slice(0, 3).join(', ') || 'Available now';
}

module.exports = { search, parseRent, buildHighlightLine };
