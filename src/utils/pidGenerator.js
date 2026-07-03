'use strict';

/**
 * PID Generator — EasyFind Inventory Engine
 *
 * Generates deterministic Property IDs.
 * Format: PID{YYMMDD}{NNN}  e.g. PID240703001
 *
 * The sequence number is derived from the Google Sheets row count
 * so that PIDs are globally unique and reproducible.
 *
 * Reference: docs/architecture/10_system_architecture.md (Media Processing section)
 */

/**
 * Generate a PID from a date and sequence number.
 * @param {Date} date
 * @param {number} sequence — 1-based count of properties added on this date
 * @returns {string} e.g. "PID240703001"
 */
function generatePID(date, sequence) {
  const d = date || new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `PID${yy}${mm}${dd}${seq}`;
}

/**
 * Generate a Cloudinary public_id for a media asset.
 * Format: inventory/{PID}_img{NNN} or inventory/{PID}_vid{NNN}
 * @param {string} pid
 * @param {'img'|'vid'} type
 * @param {number} index — 1-based
 * @returns {string}
 */
function generateMediaPublicId(pid, type, index) {
  const suffix = String(index).padStart(3, '0');
  return `inventory/${pid}_${type}${suffix}`;
}

module.exports = { generatePID, generateMediaPublicId };
