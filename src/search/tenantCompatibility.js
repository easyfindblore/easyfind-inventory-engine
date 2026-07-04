'use strict';

/**
 * Tenant Compatibility — EasyFind Search
 *
 * Maps a customer's stated preference ("family" / "bachelor") to the
 * real LOV values in Live Tracking and decides whether a property
 * is eligible for that customer.
 *
 * Built as an explicit table, not a string-contains check, so edge
 * cases like "Family & Bachelors Females" are handled deliberately.
 *
 * Real LOV values (from Sheet Structure tab):
 *   Family Only | Family & Bachelors Females | Family & Bachelors Males
 *   Only Bachelors | Hindu Family | Vegetarian Family
 *   Anyone | Working Professionals | Professionals | Corporate | Students | Female
 */

// Values that are NOT appropriate for a family customer
const FAMILY_EXCLUDES = [
  'Only Bachelors',
  'Bachelor',
];

// Values that are NOT appropriate for a bachelor customer
const BACHELOR_EXCLUDES = [
  'Family Only',
  'Vegetarian Family',
  'Hindu Family',
];

/**
 * Check whether a property's tenantType is compatible with the
 * customer's stated preference.
 *
 * @param {string|null} propertyTenantType — value from Live Tracking column M
 * @param {'family'|'bachelor'|null} customerSignal — extracted from search intent
 * @returns {boolean} true if the property is compatible (or no preference stated)
 */
function isTenantCompatible(propertyTenantType, customerSignal) {
  if (!customerSignal) return true; // no preference → all properties eligible
  if (!propertyTenantType) return true; // no restriction set → open to anyone

  const val = propertyTenantType.trim();

  if (customerSignal === 'family') {
    return !FAMILY_EXCLUDES.some((ex) => val.toLowerCase() === ex.toLowerCase());
  }

  if (customerSignal === 'bachelor') {
    return !BACHELOR_EXCLUDES.some((ex) => val.toLowerCase() === ex.toLowerCase());
  }

  return true;
}

module.exports = { isTenantCompatible, FAMILY_EXCLUDES, BACHELOR_EXCLUDES };
