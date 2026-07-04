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

  // Bathrooms: "2 Bathrooms", "2 Bath", "2 Washrooms", "2 baths" (value-first)
  bathrooms: /(\d+)\s*(bath(?:room)?s?|washrooms?|toilets?)\b/i,

  // Bathrooms: "Bathrooms: 2", "Bathrooms 2", "Washrooms - 3" (label-first)
  bathroomsLabelFirst: /\b(?:bath(?:room)?s?|washrooms?|toilets?)\s*[:\-–]?\s*(\d+)\b/i,

  // Balcony: "1 Balcony", "2 Balconies", "One Balcony", "Huge Balcony" (value-first)
  balcony: /(\d+|one|two|three|four)\s*balcon(?:y|ies)\b/i,

  // Balcony: "Balcony: 2", "Balcony 1", "Balconies - 3" (label-first)
  balconyLabelFirst: /\bbalcon(?:y|ies)\s*[:\-–]?\s*(\d+|one|two|three|four)\b/i,

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

  // Tenant Type: "Preferred Tenant: Family Only", "Tenant: Anyone", "Tenant Type: Bachelors"
  tenant: /\b(?:preferred\s*)?tenant(?:\s*type)?\s*[:\-–]?\s*([^\n.,]+?)(?:\.|,|\n|$)/i,

  // Pets
  pets: /\bpets?\s*[:\-–]?\s*(allowed|not\s*allowed|yes|no)\b/i,

  // Community / Apartment Type
  community: /\bcommunity\s*[:\-–]?\s*([^\n,]+?)(?:\n|,|$)/i,

  // Location
  location: /\blocation\s*[:\-–]?\s*([^\n,]+?)(?:\.|,|\n|$)/i,

  // Society / Landmark — bounded at sentence end so trailing "Link:"/URLs
  // (e.g. "Society: Sobha Dream Acres. Link: https://...") are never swallowed.
  society: /\b(?:society(?:\/landmark)?|landmark|project|building)\s*[:\-–]?\s*([^\n,.]+?)(?:\.|,|\n|$)/i,

  // Society fallback — known builder/developer name prefixes, used only when
  // no explicit Society/Landmark label is present in the message.
  societyFallback: /\b((?:Prestige|Sobha|Purva|Brigade|Salarpuria|Godrej|Adarsh|Mantri|Vaswani|Shriram|Provident|Divya\s*Sree|Century|Confident|SNN|DSR|Elita|Ozone|SJR|Nitesh|Embassy|Total\s*Environment|Sattva|Assetz|Puravankara)\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,3})\b/,

  // Google Maps link
  mapsLink: /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps)[^\s]*/i,

  // Furnishing (extracted from first line context)
  furnishing: /\b(fully\s*furnished|semi\s*furnished|partially\s*furnished|unfurnished|ff|sf|uf)\b/i,

  // Veg/Non-Veg — most specific phrases first (alternation tries left-to-right);
  // bare "vegetarian" is last so it never masks "non veg" mentions.
  vegNonVeg: /\b(vegetarian\s*family|vegetarian[s]?\s*only|veg\s*only|no\s*restriction[s]?|non[\s-]?veg\s*(?:ok|allowed)?|vegetarian)\b/i,

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

/**
 * Strip markdown formatting characters (bold/italic/code) from working text.
 * Replaces them with a single space (not removed outright) so that adjacent
 * tokens like "**Bathrooms**2" never merge into "Bathrooms2".
 * Only used for the parser's internal matching copy — never applied to the
 * raw message, which must always be preserved verbatim.
 * @param {string} s
 * @returns {string}
 */
function stripMarkdownFormatting(s) {
  if (!s) return s;
  return s.replace(/[*_`]+/g, ' ').replace(/[ \t]+/g, ' ');
}

/**
 * Clean a captured Society/Landmark value: strip any trailing URL or
 * "Link:"/"Map:" fragment that may have run on in the same sentence, and
 * strip out any raw URL captured directly as the value. Never lets a
 * Google Maps link (or any URL) end up as a society name.
 * @param {string} raw
 * @returns {string|null}
 */
function cleanSocietyCapture(raw) {
  if (!raw) return null;
  let s = raw;
  // Cut at the start of any embedded URL.
  s = s.split(/\s*(?:https?:\/\/|www\.)\S*/i)[0];
  // Cut at a trailing "Link:"/"Map:"/"Google Maps:" fragment.
  s = s.split(/\b(?:link|map|google\s*maps?)\s*[:\-]/i)[0];
  s = s.trim().replace(/[.,\s]+$/, '').trim();
  return s || null;
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
  // Working copy has markdown formatting (bold/italic/code) stripped so that
  // labels like "**Bathrooms**" or "*Bellandur*" match the same way plain
  // text does. rawMessage (stored verbatim below) is never touched.
  const text = stripMarkdownFormatting(mergedText || '');

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

    // Bathrooms — supports both "2 Bathrooms" (value-first) and
    // "Bathrooms 2" / "Bathrooms: 2" (label-first, common with markdown
    // headers). Latest occurrence across either form wins.
    const bathAllMatches = [
      ...text.matchAll(new RegExp(PATTERNS.bathrooms.source, 'gi')),
      ...text.matchAll(new RegExp(PATTERNS.bathroomsLabelFirst.source, 'gi')),
    ];
    if (bathAllMatches.length > 0) {
      const lastBath = bathAllMatches.reduce((a, b) => (b.index > a.index ? b : a));
      result.bathrooms = parseInt(lastBath[1], 10);
    }

    // Balcony — "Huge/Large/Spacious Balcony" → 1; "2 Balconies" → 2;
    // "Balcony 1" / "Balcony: 1" (label-first) also supported. Latest wins.
    const balconyAllMatches = [
      ...text.matchAll(new RegExp(PATTERNS.balcony.source, 'gi')),
      ...text.matchAll(new RegExp(PATTERNS.balconyLabelFirst.source, 'gi')),
    ];
    if (balconyAllMatches.length > 0) {
      const lastBalcony = balconyAllMatches.reduce((a, b) => (b.index > a.index ? b : a));
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

    // Tenant — latest value wins. "Preferred" is optional so bare
    // "Tenant: Anyone" messages (no "Preferred") are captured too.
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

    // Location — latest value wins. Working text already has markdown
    // stripped, so "*Bellandur*" no longer leaks asterisks into the sheet.
    const locationMatch = lastMatch(PATTERNS.location);
    if (locationMatch) {
      result.location = locationMatch[1].replace(/\s+/g, ' ').trim() || null;
    }

    // Society — latest value wins. Cleaned to cut off any trailing
    // "Link:"/URL fragment that ran on in the same sentence.
    const societyMatch = lastMatch(PATTERNS.society);
    if (societyMatch) {
      result.societyName = cleanSocietyCapture(societyMatch[1]);
    }

    // Society fallback — if no labeled Society/Landmark was found, look for
    // a known builder/developer name mentioned in free text (e.g.
    // "Prestige Lakeside Habitat" with no "Society:" label at all).
    if (!result.societyName) {
      const fallbackMatch = lastMatch(PATTERNS.societyFallback);
      if (fallbackMatch) {
        result.societyName = cleanSocietyCapture(fallbackMatch[1]);
      }
    }

    // Society fallback — Gated/Semi Gated with no "Society:"/"Landmark:"
    // label at all, e.g.:
    //   Community: Gated
    //   Amrutha Platinum Towers
    // The society name is given as a bare line directly under the
    // Community line. Only applies when Community indicates Gated or
    // Semi Gated (never for Stand Alone). The candidate line is rejected
    // if it is itself a URL or another field's label, so a Google Maps
    // link or an unrelated field is never mistaken for a society name.
    if (!result.societyName && result.apartmentType && /gated/i.test(result.apartmentType)) {
      const communityLineMatch = text.match(/\bcommunity\s*[:\-–]?\s*[^\n]*\n+\s*([^\n]+)/i);
      if (communityLineMatch) {
        const candidateLine = communityLineMatch[1].trim();
        const isUrl = PATTERNS.mapsLink.test(candidateLine) || /https?:\/\/|www\./i.test(candidateLine);
        const isOtherLabel = /^(location|society|landmark|project|building|rent|deposit|maintenance|bhk|bathroom|washroom|toilet|balcon|floor|avail|tenant|pets?|veg|furnish|negotiat|visit|community|size|sqft|sq\.?\s*ft|utility|onboard|online|offline)\b/i.test(candidateLine);
        if (candidateLine && !isUrl && !isOtherLabel) {
          result.societyName = cleanSocietyCapture(candidateLine);
        }
      }
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
