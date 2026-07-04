'use strict';

/**
 * Search Controller — EasyFind Search
 *
 * Entry point for all search-related WhatsApp messages.
 * Called from webhookController AFTER inventoryController declines a message.
 *
 * Returns true if the message was consumed by the search flow.
 * Returns false to let the legacy Add Media / Delete Media flows handle it.
 */

const logger = require('../utils/logger');
const { parseIntent } = require('./searchIntentParser');
const { search, buildHighlightLine, parseRent } = require('./searchEngine');
const searchSession = require('./searchSessionManager');
const R = require('./searchResponses');
const { resolveLocation } = require('../services/locationMapping');
const { sendTextMessage, sendImageMessage, sendInteractiveButtonsMessage } = require('../services/whatsapp');
const { appendToTab } = require('../services/sheets');

// ── Trigger detection ─────────────────────────────────────────────────────────

const EXPLICIT_SEARCH_TRIGGERS = [
  '1', 'search', 'search property', 'search properties',
  'find property', 'find flat', 'find house', 'find home',
  'looking for', 'i need', 'need a flat', 'need a house',
];

// Commands that belong to legacy flows — never steal these
const LEGACY_COMMANDS = [
  'done', 'finish', 'complete',
  'cancel',
  'add media', 'add_media',
  '2', 'add', 'inventory', 'add inventory',
  'status', 'help', 'menu', 'save',
];

// Pagination triggers
const MORE_TRIGGERS = ['more', 'next', 'show more', 'see more', 'next 3', 'next three'];

/**
 * @param {string} text
 * @returns {boolean}
 */
function isExplicitSearchTrigger(text) {
  const lower = text.trim().toLowerCase();
  return EXPLICIT_SEARCH_TRIGGERS.includes(lower);
}

function isLegacyCommand(text) {
  const lower = text.trim().toLowerCase();
  return LEGACY_COMMANDS.includes(lower);
}

function isMoreTrigger(text) {
  const lower = text.trim().toLowerCase();
  return MORE_TRIGGERS.some((t) => lower === t || lower.startsWith(t));
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Try to handle an incoming WhatsApp message as a search interaction.
 * @param {Object} message — Meta webhook message object
 * @param {Object} metadata
 * @returns {Promise<boolean>} true if consumed
 */
async function tryHandleMessage(message, metadata) {
  const phone = message.from;
  const messageType = message.type;

  // ── Handle button taps (interactive reply) ────────────────────────────────
  if (messageType === 'interactive') {
    const btnReply = message.interactive?.button_reply;
    if (btnReply) {
      const id = btnReply.id || '';
      if (id.startsWith('CONTACT_')) {
        await handleContactNow(phone, id);
        return true;
      }
      if (id.startsWith('DETAILS_')) {
        await handleMoreDetails(phone, id);
        return true;
      }
    }
    return false;
  }

  // Only handle text messages below this point
  if (messageType !== 'text') return false;

  const text = (message.text?.body || '').trim();
  if (!text) return false;

  // ── Active search session — handle continuation ───────────────────────────
  const session = searchSession.getSession(phone);

  if (session) {
    searchSession.touch(phone);

    // Pagination
    if (isMoreTrigger(text)) {
      const pageData = searchSession.nextPage(phone);
      if (pageData && pageData.results.length > 0) {
        await sendPropertyCards(phone, pageData.results, pageData, session.lastIntent);
      } else {
        await sendTextMessage(phone, R.noMoreResults());
      }
      return true;
    }

    // Awaiting clarification answer — merge answer with partial intent and search
    if (session.awaitingClarification) {
      const mergedIntent = mergeIntentObjects(session.lastIntent || {}, parseIntent(text));
      return await runSearchWithIntent(phone, mergedIntent);
    }

    // Refinement — merge new constraints into existing intent
    const refinementIntent = parseIntent(text);
    if (refinementIntent.hasIntent) {
      await sendTextMessage(phone, R.refining());
      return await runSearchWithIntent(phone, mergeIntentObjects(session.lastIntent, refinementIntent));
    }

    // No recognisable refinement — treat as new search
    if (isLegacyCommand(text)) return false;
    return await runSearch(phone, text, text);
  }

  // ── No active session ─────────────────────────────────────────────────────

  // Explicitly reserve legacy commands
  if (isLegacyCommand(text)) return false;

  // Explicit search trigger
  if (isExplicitSearchTrigger(text)) {
    searchSession.setAwaitingClarification(phone, {});
    await sendTextMessage(phone, R.askLocation());
    return true;
  }

  // Implicit search — try to parse intent from free text
  const intent = parseIntent(text);
  if (intent.hasIntent) {
    return await runSearch(phone, text, text);
  }

  return false;
}

// ── Search execution ──────────────────────────────────────────────────────────

async function runSearch(phone, text, rawText) {
  const intent = parseIntent(text);
  return await runSearchWithIntent(phone, intent, rawText);
}

async function runSearchWithIntent(phone, intent, rawText) {
  const phone2 = arguments[0]; // keep phone in scope

  // Resolve location in intent
  if (intent.rawLocation) {
    intent.resolvedLocation = resolveLocation(intent.rawLocation);
  }

  // Need at least location or BHK to run a useful search
  if (!intent.rawLocation && !intent.bhk && !intent.budgetMax) {
    searchSession.setAwaitingClarification(phone, intent);
    await sendTextMessage(phone, R.askLocation());
    return true;
  }

  // Acknowledge
  await sendTextMessage(phone, R.searching({
    bhk: intent.bhk,
    location: intent.resolvedLocation || intent.rawLocation,
    budgetMax: intent.budgetMax,
  }));

  // Run search
  const { results, total, relaxed, fallback } = search(intent);

  if (results.length === 0) {
    // No results — capture in Watch_List
    await captureWatchList(phone, intent);
    await sendTextMessage(phone, R.noResults({
      bhk: intent.bhk,
      location: intent.resolvedLocation || intent.rawLocation,
      budgetMax: intent.budgetMax,
    }));
    return true;
  }

  // Store full ranked list in session
  searchSession.startSession(phone, intent, results);
  const pageData = searchSession.getPage(phone);

  // Send found header
  const shown = pageData.results.length;
  await sendTextMessage(phone, R.foundHeader({
    total,
    shown,
    bhk: intent.bhk,
    location: intent.resolvedLocation || intent.rawLocation,
    budgetMax: intent.budgetMax,
    relaxed: relaxed || fallback,
  }));

  // Send property cards
  await sendPropertyCards(phone, pageData.results, pageData, intent);
  return true;
}

// ── Sending property cards ────────────────────────────────────────────────────

async function sendPropertyCards(phone, properties, pageData, intent) {
  for (const prop of properties) {
    await sendPropertyCard(phone, prop);
    // Small delay between cards so WhatsApp renders them in order
    await new Promise((r) => setTimeout(r, 400));
  }

  // Pagination footer
  if (pageData.hasMore) {
    const remaining = pageData.total - (pageData.page + 1) * searchSession.PAGE_SIZE;
    await sendTextMessage(phone, R.moreResults({ remaining }));
  } else {
    await sendTextMessage(phone, R.noMoreResults());
  }
}

async function sendPropertyCard(phone, prop) {
  const { data, rowIndex } = prop;
  const pid = data.pid || `row_${rowIndex}`;
  const highlight = buildHighlightLine(data);

  // Pick the best cover image (first image URL, never a video)
  const coverImage = (data._imageList || [])[0] || null;

  // Caption for the image message
  const bhkLine = data.bhk || '—';
  const locLine = data.location || '—';
  const rentLine = data.rent ? `₹${Number(parseRent(data.rent)).toLocaleString('en-IN')}/mo` : '';
  const caption = `${bhkLine} · ${locLine}\n${rentLine}\n${highlight}`;

  if (coverImage) {
    await sendImageMessage(phone, coverImage, caption);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Interactive buttons message
  const bodyText = coverImage ? highlight : caption;
  const buttons = [
    { id: `CONTACT_${rowIndex}`, title: 'Contact Now' },
    { id: `DETAILSROW_${rowIndex}`, title: 'More Details' },
  ];
  await sendInteractiveButtonsMessage(phone, bodyText, buttons);
}

// ── Button tap handlers ───────────────────────────────────────────────────────

async function handleContactNow(phone, buttonId) {
  // CONTACT_{rowIndex}
  const rowIndex = parseInt(buttonId.replace('CONTACT_', ''), 10);
  const session = searchSession.getSession(phone);
  searchSession.touch(phone);

  // Find the property in the session's ranked results
  let prop = null;
  if (session) {
    prop = session.rankedResults.find((r) => r.rowIndex === rowIndex);
  }

  const society = prop?.data?.societyName || 'this property';
  const location = prop?.data?.location || '';
  const pid = prop?.data?.pid || `row_${rowIndex}`;
  const rent = prop?.data?.rent || '';
  const bhk = prop?.data?.bhk || '';

  await sendTextMessage(phone, R.contactNow({ society, location }));

  // Log lead to Leads tab
  try {
    await appendToTab('Leads', [
      phone,
      pid,
      String(rowIndex),
      new Date().toISOString(),
      society,
      location,
      bhk,
      rent,
    ]);
  } catch (err) {
    logger.error('Failed to write lead to Leads tab', { error: err.message, phone, pid });
  }
}

async function handleMoreDetails(phone, buttonId) {
  // DETAILSROW_{rowIndex}
  const rowIndex = parseInt(buttonId.replace('DETAILSROW_', ''), 10);
  searchSession.touch(phone);

  // Find the specific property in the session by rowIndex for collision-safe PID lookup
  const session = searchSession.getSession(phone);
  let pid = null;
  if (session) {
    const prop = session.rankedResults.find((r) => r.rowIndex === rowIndex);
    pid = prop?.data?.pid || null;
  }

  if (!pid) {
    await sendTextMessage(phone, 'Sorry, I couldn\'t find that property. Please try searching again.');
    return;
  }

  // Append rowIndex as a query param so the gallery can resolve the exact row
  await sendTextMessage(phone, R.moreDetails({ pid, rowIndex }));
}

// ── Watch List capture ────────────────────────────────────────────────────────

async function captureWatchList(phone, intent) {
  try {
    await appendToTab('Watch_List', [
      phone,
      new Date().toISOString(),
      JSON.stringify({
        bhk: intent.bhk,
        budgetMax: intent.budgetMax,
        budgetMin: intent.budgetMin,
        location: intent.resolvedLocation || intent.rawLocation,
        furnishing: intent.furnishing,
        pets: intent.pets,
        tenantSignal: intent.tenantSignal,
      }),
    ]);
    logger.info('Watch_List entry captured', { phone });
  } catch (err) {
    logger.error('Failed to write to Watch_List', { error: err.message, phone });
  }
}

// ── Intent merging ────────────────────────────────────────────────────────────

/**
 * Merge a clarification answer into a partial intent from free text.
 */
function mergeIntents(existingIntent, newText) {
  const parsed = parseIntent(newText);
  return mergeIntentObjects(existingIntent || {}, parsed);
}

/**
 * Merge two intent objects — new values override existing ones,
 * existing values are preserved where the new intent has no signal.
 */
function mergeIntentObjects(base, overlay) {
  return {
    bhk: overlay.bhk || base.bhk || null,
    budgetMax: overlay.budgetMax || base.budgetMax || null,
    budgetMin: overlay.budgetMin || base.budgetMin || null,
    rawLocation: overlay.rawLocation || base.rawLocation || null,
    resolvedLocation: overlay.resolvedLocation || base.resolvedLocation || null,
    furnishing: overlay.furnishing || base.furnishing || null,
    pets: overlay.pets !== null ? overlay.pets : (base.pets !== undefined ? base.pets : null),
    tenantSignal: overlay.tenantSignal || base.tenantSignal || null,
    hasIntent: true,
  };
}

module.exports = { tryHandleMessage };
