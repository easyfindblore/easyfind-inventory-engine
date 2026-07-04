'use strict';

/**
 * Search Session Manager — EasyFind Search
 *
 * Per-phone in-memory session state for the search flow.
 * Mirrors the pattern used by src/session/sessionManager.js —
 * plain Map, 30-minute sliding TTL, no Redis.
 *
 * Session shape:
 * {
 *   lastIntent: Object,          // parsed intent from searchIntentParser
 *   rankedResults: Array,        // full ranked property list (not just top 3)
 *   page: number,                // current page (0-based, 3 per page)
 *   expiresAt: number,           // ms timestamp
 *   awaitingClarification: bool, // true when we asked a clarifying question
 * }
 */

const logger = require('../utils/logger');

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const PAGE_SIZE = 3;

/** @type {Map<string, Object>} */
const _sessions = new Map();

// Periodic cleanup of expired sessions (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of _sessions.entries()) {
    if (session.expiresAt < now) {
      _sessions.delete(phone);
      logger.debug('Search session expired and cleared', { phone });
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Get the current search session for a phone number, or null if none/expired.
 * @param {string} phone
 * @returns {Object|null}
 */
function getSession(phone) {
  const session = _sessions.get(phone);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    _sessions.delete(phone);
    return null;
  }
  return session;
}

/**
 * Start (or replace) a search session with a fresh intent and ranked results.
 * @param {string} phone
 * @param {Object} intent — parsed intent
 * @param {Array} rankedResults — full ranked list of matching properties
 */
function startSession(phone, intent, rankedResults) {
  _sessions.set(phone, {
    lastIntent: intent,
    rankedResults,
    page: 0,
    expiresAt: Date.now() + TTL_MS,
    awaitingClarification: false,
  });
}

/**
 * Update the intent on an existing session (refinement).
 * Replaces results and resets to page 0.
 * @param {string} phone
 * @param {Object} intent
 * @param {Array} rankedResults
 */
function updateSession(phone, intent, rankedResults) {
  const existing = getSession(phone);
  _sessions.set(phone, {
    lastIntent: intent,
    rankedResults,
    page: 0,
    expiresAt: Date.now() + TTL_MS,
    awaitingClarification: false,
  });
}

/**
 * Mark the session as waiting for a clarifying question answer.
 * @param {string} phone
 * @param {Object} partialIntent
 */
function setAwaitingClarification(phone, partialIntent) {
  _sessions.set(phone, {
    lastIntent: partialIntent,
    rankedResults: [],
    page: 0,
    expiresAt: Date.now() + TTL_MS,
    awaitingClarification: true,
  });
}

/**
 * Advance to the next page. Returns the slice for the new page.
 * @param {string} phone
 * @returns {{ results: Array, page: number, total: number, hasMore: boolean } | null}
 */
function nextPage(phone) {
  const session = getSession(phone);
  if (!session || session.rankedResults.length === 0) return null;

  session.page += 1;
  session.expiresAt = Date.now() + TTL_MS; // touch TTL
  _sessions.set(phone, session);

  return getPage(phone);
}

/**
 * Get the current page of results without advancing.
 * @param {string} phone
 * @returns {{ results: Array, page: number, total: number, hasMore: boolean } | null}
 */
function getPage(phone) {
  const session = getSession(phone);
  if (!session) return null;

  const start = session.page * PAGE_SIZE;
  const results = session.rankedResults.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < session.rankedResults.length;

  return {
    results,
    page: session.page,
    total: session.rankedResults.length,
    hasMore,
  };
}

/**
 * Touch the TTL on an active session (sliding window).
 * @param {string} phone
 */
function touch(phone) {
  const session = _sessions.get(phone);
  if (session) {
    session.expiresAt = Date.now() + TTL_MS;
  }
}

/**
 * Destroy a search session.
 * @param {string} phone
 */
function destroySession(phone) {
  _sessions.delete(phone);
}

module.exports = {
  getSession,
  startSession,
  updateSession,
  setAwaitingClarification,
  nextPage,
  getPage,
  touch,
  destroySession,
  PAGE_SIZE,
};
