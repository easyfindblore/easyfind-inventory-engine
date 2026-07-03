'use strict';

/**
 * Message Parser — EasyFind Inventory Engine
 *
 * Extracts structured property fields from free-form WhatsApp text.
 * Order-independent: fields are found by pattern, not by position.
 * Never guesses. Missing fields remain null.
 *
 * Reference:
 *   - docs/contracts/02_column_contract.md (Column Extraction Contract)
 *   - docs/specs/04_property_message_formats.md (Message Examples)
 */

const logger = require('../utils/logger');

// ─── Regex patterns ───────────────────────────────────────────────────────────

const PATTERNS = {
  // BHK: "2 BHK", "2BHK", "2-BHK", "3 bhk", "1 RK"
  bhk: /(\d+)\s*[-]?\s*(bhk|rk)\b/i,

  // Bathrooms: "2 Bathrooms", "2 Bath", "2 Washrooms", "2 baths"
  bathrooms: /(\d+)\s*(bath(?:room)?s?|washrooms?)\b/i,

  // Balcony: "1 Balcony", "2 Balconies", "One Balcony", "Huge Balcony"
  balcony: /(\d+|one|two|three|four)\s*balcon(?:y|ies)\b/i,

  // Utility
  utility: /\b(utility\s*area|separate\s*utility|attached\s*utility|utility)\b/i,

  // Rent: "Rent: 60k", "Rent - ₹60,000", "Rent: 1.5L"
  rent: /\brent\s*[:\-–]?\s*[₹]?\s*([\d,.]+\s*(?:k|l|lakh|lakhs?|thousand)?)/i,

  // Maintenance
  maintenance: /\bmaintenance\s*[:\-–]?\s*[₹]?\s*([\d,.a-z\s]*?)(?:\n|$)/i,

  // Deposit: "Deposit: 2L", "Deposit: 2 Months", "Deposit: 80K"
  deposit: /\bdeposit\s*[:\-–]?\s*[₹]?\s*([\d,.]+\s*(?:k|l|lakh|lakhs?|thousand|months?))/i,

  // Size / Sqft
  sqft: /(?:sq\.?\s*ft\.?|sqft|sft|square\s*f(?:ee|oo)t)\s*[:\-–]?\s*([\d,.]+)|(\d[\d,.]*)\s*(?:sq\.?\s*ft\.?|sqft|sft)/i,

  // Floor: "Floor: 18/18", "Floor: G/2", "5th floor", "Ground floor"
  floor: /\bfloor\s*[:\-–]?\s*([^\n,]+?)(?:\n|,|$)|\b(\d+(?:st|nd|rd|th)?\s*\/?\s*\d*\s*(?:floor)?)\b/i,

  // Available From
  available: /\bavail(?:able)?\s*(?:from\s*)?[:\-–]?\s*([^\n,]+?)(?:\n|,|$)/i,

  // Preferred Tenant
  tenant: /\bpreferred\s*tenant\s*[:\-–]?\s*([^\n]+?)(?:\n|$)/i,

  // Pets
  pets: /\bpets?\s*[:\-–]?\s*(allowed|not\s*allowed|yes|no)\b/i,

  // Community / Apartment Type
  community: /\bcommunity\s*[:\-–]?\s*([^\n,]+?)(?:\n|,|$)/i,

  // Location
  location: /\blocation\s*[:\-–]?\s*([^\n,]+?)(?:\n|,|$)/i,

  // Society / Landmark
  society: /\b(?:society|landmark|project|building)\s*[:\-–]?\s*([^\n,]+?)(?:\n|,|$)/i,

  // Google Maps link
  mapsLink: /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps)[^\s]*/i,

  // Furnishing (extracted from first line context)
  furnishing: /\b(fully\s*furnished|semi\s*furnished|partially\s*furnished|unfurnished|ff|sf|uf)\b/i,

  // Veg/Non-Veg
  vegNonVeg: /\b(vegetarian[s]?\s*only|no\s*restriction[s]?|veg\s*only|non[\s-]?veg\s*(?:ok|allowed)?)\b/i,

  // Negotiation
  negotiation: /\b(open\s*for\s*negotiat(?:ion|ions)|slight\s*negotiat(?:ion|ions)|fixed|no\s*negotiat(?:ion|ions))\b/i,

  // Visit timings
  visitTimings: /\bvisit(?:\s*timings?)?\s*[:\-–]?\s*([^\n]+?)(?:\n|$)/i,

  // Availability status
  availability: /\b(available|delayed|rented\s*out|occupied|not\s*available)\b/i,

  // Scope / Onboarding
  onboarding: /\b(online|offline|reference|broker\s*network|direct\s*owner)\b/i,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse an amount string into a numeric value (in rupees).
 * e.g. "60k" → 60000, "1.5L" → 150000, "2L" → 200000
 * @param {string} raw
 * @returns {number|null}
 */
function parseAmount(raw) {
  if (!raw) return null;
  const s = raw.replace(/[,₹\s]/g, '').toLowerCase();

  // "included", "water charges", etc. — non-numeric maintenance
  if (!/\d/.test(s)) return null;

  const num = parseFloat(s);
  if (isNaN(num)) return null;

  if (s.endsWith('l') || s.includes('lakh') || s.includes('lacs')) {
    return Math.round(num * 100000);
  }
  if (s.endsWith('k') || s.includes('thousand')) {
    return Math.round(num * 1000);
  }
  return Math.round(num);
}

/**
 * Parse balcony count from matched group.
 * Handles words like "one", "two".
 */
function parseBalcony(raw) {
  if (!raw) return null;
  const wordMap = { one: 1, two: 2, three: 3, four: 4 };
  const lower = raw.toLowerCase().trim();
  if (wordMap[lower] !== undefined) return wordMap[lower];
  const n = parseInt(lower, 10);
  return isNaN(n) ? null : n;
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a merged session text into a structured property object.
 * Input is the combined text from all messages in a session.
 * Output conforms to the Column Contract (Doc 02).
 *
 * @param {string} mergedText — combined text messages from the session
 * @param {string} rawMessage — original unmodified message (stored verbatim)
 * @returns {Object} property object
 */
function parseMessage(mergedText, rawMessage) {
  const text = mergedText || '';

  const result = {
    // System-generated (not parsed)
    pid: null,
    dateAdded: null,
    lastUpdated: null,
    messageId: null,
    senderPhone: null,
    messageTimestamp: null,
    uniqueKey: null,
    imageUrls: [],

    // Parsed fields
    onboardingType: null,
    location: null,
    apartmentType: null,
    societyName: null,
    bhk: null,
    bathrooms: null,
    balcony: null,
    utility: null,
    size: null,
    floor: null,
    furnishing: null,
    tenantType: null,
    vegNonVeg: null,
    petsFriendly: null,
    rent: null,
    maintenance: null,
    deposit: null,
    availableFrom: null,
    negotiation: null,
    visitTimings: null,
    availability: null,

    // Raw message — preserved verbatim
    rawMessage: rawMessage || mergedText || '',
  };

  try {
    // Helper: get last match from a global search (latest-value-wins per Doc 02)
    const lastMatch = (pattern) => {
      const all = [...text.matchAll(new RegExp(pattern.source, 'gi'))];
      return all.length ? all[all.length - 1] : null;
    };

    // BHK — latest value wins
    const bhkMatch = lastMatch(PATTERNS.bhk);
    if (bhkMatch) {
      result.bhk = `${bhkMatch[1]} ${bhkMatch[2].toUpperCase()}`;
    }

    // Bathrooms — latest value wins
    const bathMatch = lastMatch(PATTERNS.bathrooms);
    if (bathMatch) {
      result.bathrooms = parseInt(bathMatch[1], 10);
    }

    // Balcony — "Huge/Large/Spacious Balcony" → 1; "2 Balconies" → 2; latest wins
    const balconyMatches = [...text.matchAll(new RegExp(PATTERNS.balcony.source, 'gi'))];
    if (balconyMatches.length > 0) {
      const lastBalcony = balconyMatches[balconyMatches.length - 1];
      result.balcony = parseBalcony(lastBalcony[1]);
    } else if (/\b(huge|large|spacious|long|private)\s+balcon(?:y|ies)\b/i.test(text)) {
      result.balcony = 1; // descriptor without count → 1
    }

    // Utility
    if (PATTERNS.utility.test(text)) {
      result.utility = 'Yes';
    }

    // Furnishing — latest value wins
    const furnMatch = lastMatch(PATTERNS.furnishing);
    if (furnMatch) {
      result.furnishing = furnMatch[1]; // normalizer will standardize
    }

    // Rent — latest value wins
    const rentMatch = lastMatch(PATTERNS.rent);
    if (rentMatch) {
      result.rent = parseAmount(rentMatch[1]);
    }

    // Maintenance — latest value wins
    const maintMatch = lastMatch(PATTERNS.maintenance);
    if (maintMatch) {
      const maintRaw = maintMatch[1].trim();
      result.maintenance = parseAmount(maintRaw); // null if non-numeric (e.g. "included")
    }

    // Deposit — may reference months; latest value wins
    const depositMatch = lastMatch(PATTERNS.deposit);
    if (depositMatch) {
      const depRaw = depositMatch[1].toLowerCase().trim();
      const monthsMatch = depRaw.match(/(\d+)\s*months?/);
      if (monthsMatch && result.rent) {
        result.deposit = result.rent * parseInt(monthsMatch[1], 10);
      } else {
        result.deposit = parseAmount(depRaw);
      }
    }

    // Size — latest value wins
    const sqftMatch = lastMatch(PATTERNS.sqft);
    if (sqftMatch) {
      const rawSize = (sqftMatch[1] || sqftMatch[2] || '').replace(/,/g, '');
      result.size = parseInt(rawSize, 10) || null;
    }

    // Floor — latest value wins
    const floorMatch = lastMatch(PATTERNS.floor);
    if (floorMatch) {
      result.floor = (floorMatch[1] || floorMatch[2] || '').trim() || null;
    }

    // Available From — latest value wins
    const availMatch = lastMatch(PATTERNS.available);
    if (availMatch) {
      result.availableFrom = availMatch[1].trim() || null;
    }

    // Tenant — latest value wins
    const tenantMatch = lastMatch(PATTERNS.tenant);
    if (tenantMatch) {
      result.tenantType = tenantMatch[1].trim() || null;
    }

    // Pets — latest value wins
    const petsMatch = lastMatch(PATTERNS.pets);
    if (petsMatch) {
      result.petsFriendly = petsMatch[1].toLowerCase().startsWith('not') || petsMatch[1].toLowerCase() === 'no'
        ? 'No'
        : 'Yes';
    }

    // Community / Apartment Type — latest value wins
    const communityMatch = lastMatch(PATTERNS.community);
    if (communityMatch) {
      result.apartmentType = communityMatch[1].trim() || null;
    }

    // Location — latest value wins
    const locationMatch = lastMatch(PATTERNS.location);
    if (locationMatch) {
      result.location = locationMatch[1].trim() || null;
    }

    // Society — latest value wins
    const societyMatch = lastMatch(PATTERNS.society);
    if (societyMatch) {
      result.societyName = societyMatch[1].trim() || null;
    }

    // Google Maps Link — last URL wins
    const allMapsMatches = [...text.matchAll(new RegExp(PATTERNS.mapsLink.source, 'gi'))];
    if (allMapsMatches.length > 0) {
      result.mapsLink = allMapsMatches[allMapsMatches.length - 1][0];
    }

    // Veg/Non-Veg — latest value wins
    const vegMatch = lastMatch(PATTERNS.vegNonVeg);
    if (vegMatch) {
      result.vegNonVeg = vegMatch[1];
    }

    // Negotiation — latest value wins
    const negMatch = lastMatch(PATTERNS.negotiation);
    if (negMatch) {
      result.negotiation = negMatch[1];
    }

    // Visit Timings — latest value wins
    const visitMatch = lastMatch(PATTERNS.visitTimings);
    if (visitMatch) {
      result.visitTimings = visitMatch[1].trim() || null;
    }

    // Availability Status — latest value wins
    const availStatusMatch = lastMatch(PATTERNS.availability);
    if (availStatusMatch) {
      result.availability = availStatusMatch[1];
    }

    // Onboarding Type — latest value wins
    const onboardMatch = lastMatch(PATTERNS.onboarding);
    if (onboardMatch) {
      result.onboardingType = onboardMatch[1];
    }

  } catch (err) {
    logger.error('Parser error', { error: err.message });
  }

  logger.debug('Parser result', {
    bhk: result.bhk,
    rent: result.rent,
    location: result.location,
    apartmentType: result.apartmentType,
  });

  return result;
}

module.exports = { parseMessage };
