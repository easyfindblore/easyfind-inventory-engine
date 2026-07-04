'use strict';

/**
 * Inventory Controller — EasyFind Inventory Engine
 *
 * State machine for the Add Inventory workflow.
 *
 * States
 *   COLLECTING     — silent collection of text / media / location
 *   INACTIVE       — timed out; draft preserved intact
 *   CONFIRM_CANCEL — broker typed CANCEL; awaiting Yes/No
 *   MID_SESSION_MENU — broker typed MENU mid-session; awaiting choice 1–4
 *   RETURN_MENU    — broker returned to INACTIVE draft; awaiting choice 1–4
 *   POST_SUCCESS   — property saved; awaiting "What's next?" choice 1–3
 *   CONFIRM_DUPLICATE — duplicate detected; awaiting Save-Anyway/Cancel
 *
 * Reliability guarantees
 *   - Webhook dedup: each message.id processed at most once (in-memory TTL set)
 *   - Draft persistence: every state change written through to Google Sheets
 *   - No duplicate media: seenMediaIds tracks already-stored WhatsApp IDs
 *   - No concurrent DONE: processingLock flag prevents re-entrant processing
 */

const logger = require('../utils/logger');
const draftStore = require('./draftStore');
const R = require('./inventoryResponses');
const {
  isInventoryTrigger,
  identifySessionCommand,
  parseCancelConfirm,
  parseMidSessionMenu,
  parseReturnMenu,
  parsePostSuccessMenu,
  parseDuplicateWarning,
} = require('./inventoryCommands');
const { parseMessage } = require('../parser/messageParser');
const { normalize } = require('../normalizer/normalizer');
const { sendTextMessage, downloadMedia } = require('../services/whatsapp');
const { uploadAllMedia } = require('../services/cloudinary');
const { generatePIDAndAppend, getAllRows } = require('../services/sheets');
const { generateEFPID } = require('../utils/pidGenerator');
const { config } = require('../config/config');

// ── Reference data ────────────────────────────────────────────────────────────

const REF = require('../config/referenceData.json');

// ── Webhook dedup ─────────────────────────────────────────────────────────────

/** @type {Map<string, number>} — messageId → processedAt (ms) */
const _seenMessages = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _isDuplicate(messageId) {
  if (!messageId) return false;
  return _seenMessages.has(messageId);
}

function _markSeen(messageId) {
  if (!messageId) return;
  _seenMessages.set(messageId, Date.now());
}

function _evictOldMessageIds() {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [id, ts] of _seenMessages.entries()) {
    if (ts < cutoff) _seenMessages.delete(id);
  }
}

// ── Inactivity timer ──────────────────────────────────────────────────────────

const TIMEOUT_MS = config.session?.timeoutMs || 30 * 60 * 1000;
const NUDGE_MS = Math.floor(TIMEOUT_MS * 0.5); // nudge at 50% of timeout

let _timerInterval = null;

function _startInactivityTimer() {
  if (_timerInterval) return;
  _timerInterval = setInterval(_checkInactivity, 60 * 1000);
  if (_timerInterval.unref) _timerInterval.unref();
  logger.info('Inventory inactivity timer started', { timeoutMs: TIMEOUT_MS, nudgeMs: NUDGE_MS });
}

async function _checkInactivity() {
  _evictOldMessageIds();
  const now = Date.now();
  for (const draft of draftStore.listAll()) {
    if (draft.state !== 'COLLECTING') continue;
    const idle = now - new Date(draft.lastActivityAt).getTime();

    // Nudge
    if (idle >= NUDGE_MS && !draft.nudgeSent) {
      draft.nudgeSent = true;
      draft.lastActivityAt = new Date().toISOString();
      await draftStore.set(draft.senderPhone, draft);
      await sendTextMessage(draft.senderPhone, R.inactivityNudge()).catch(() => {});
      logger.info('Inventory inactivity nudge sent', { phone: draft.senderPhone });
    }

    // Timeout → INACTIVE
    if (idle >= TIMEOUT_MS) {
      draft.state = 'INACTIVE';
      await draftStore.set(draft.senderPhone, draft);
      logger.info('Inventory session timed out → INACTIVE', { phone: draft.senderPhone });
    }
  }
}

// ── Draft factory ─────────────────────────────────────────────────────────────

function _newDraft(phone) {
  return {
    senderPhone: phone,
    sessionId: `inv-${phone}-${Date.now()}`,
    state: 'COLLECTING',
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    texts: [],
    imageIds: [],
    videoIds: [],
    locationText: null,
    locationMapsUrl: null,
    correctionCount: 0,
    nudgeSent: false,
    seenMediaIds: [],
    processingLock: false,
  };
}

function _touch(draft) {
  draft.lastActivityAt = new Date().toISOString();
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Attempt to handle a WhatsApp message as an inventory flow event.
 * @returns {boolean} true if this module consumed the message (caller must not process further)
 */
async function tryHandleMessage(message, _metadata) {
  const phone = message.from;
  const messageId = message.id;
  const type = message.type;
  const textBody = type === 'text' ? (message.text?.body || '').trim() : '';

  // Dedup: skip messages already processed
  if (_isDuplicate(messageId)) {
    logger.debug('Inventory dedup: skipping already-processed message', { messageId });
    return true; // consumed — just acked silently
  }

  const draft = draftStore.get(phone);

  // ── No active inventory session ──────────────────────────────────────────────
  if (!draft) {
    if (type === 'text' && isInventoryTrigger(textBody)) {
      _markSeen(messageId);
      await _startSession(phone);
      return true;
    }
    return false; // not our message
  }

  // We have a draft — consume and mark seen
  _markSeen(messageId);

  // ── Route by state ────────────────────────────────────────────────────────
  const { state } = draft;

  if (state === 'INACTIVE') {
    return _handleInactiveMessage(phone, draft, message, textBody);
  }
  if (state === 'CONFIRM_CANCEL') {
    return _handleCancelConfirmReply(phone, draft, textBody);
  }
  if (state === 'MID_SESSION_MENU') {
    return _handleMidSessionMenuReply(phone, draft, textBody);
  }
  if (state === 'RETURN_MENU') {
    return _handleReturnMenuReply(phone, draft, textBody);
  }
  if (state === 'POST_SUCCESS') {
    return _handlePostSuccessReply(phone, draft, textBody, message);
  }
  if (state === 'CONFIRM_DUPLICATE') {
    return _handleDuplicateConfirmReply(phone, draft, textBody);
  }
  if (state === 'COLLECTING') {
    return _handleCollecting(phone, draft, message, textBody, messageId);
  }

  // Fallback — unknown state, treat as collecting
  logger.warn('Inventory: unknown draft state', { state, phone });
  return _handleCollecting(phone, draft, message, textBody, messageId);
}

// ── Start session ─────────────────────────────────────────────────────────────

async function _startSession(phone) {
  const existing = draftStore.get(phone);

  // INACTIVE draft → show return menu instead of starting fresh
  if (existing && existing.state === 'INACTIVE') {
    existing.state = 'RETURN_MENU';
    _touch(existing);
    await draftStore.set(phone, existing);
    await sendTextMessage(phone, R.returnMenu());
    return;
  }

  // Fresh session
  const draft = _newDraft(phone);
  await draftStore.set(phone, draft);
  await sendTextMessage(phone, R.welcome());
  logger.info('Inventory session started', { phone, sessionId: draft.sessionId });
}

// ── COLLECTING state handler ──────────────────────────────────────────────────

async function _handleCollecting(phone, draft, message, textBody, messageId) {
  const type = message.type;

  if (type === 'text') {
    // Commands take priority
    const cmd = identifySessionCommand(textBody);
    if (cmd === 'DONE')   return _handleDone(phone, draft);
    if (cmd === 'STATUS') return _handleStatus(phone, draft);
    if (cmd === 'HELP')   return _handleHelp(phone, draft);
    if (cmd === 'MENU')   return _handleMenuCommand(phone, draft);
    if (cmd === 'SAVE')   return _handleSave(phone, draft);
    if (cmd === 'CANCEL') return _handleCancel(phone, draft);

    // Not a command — also check if it's an inventory trigger (idempotent re-entry)
    if (isInventoryTrigger(textBody)) {
      // Silently continue — broker already in session
      return true;
    }

    // Plain text — add to collection
    const prevTextLen = draft.texts.length;
    draft.texts.push(textBody);

    // Count corrections: if any field can be re-parsed differently from prior messages,
    // it's a correction. Simple heuristic: if this isn't the first text and the new
    // text contains a parseable field that was already in a prior text, it's a correction.
    if (prevTextLen > 0) {
      const allPrev = draft.texts.slice(0, -1).join('\n');
      const parsedPrev = parseMessage(allPrev, allPrev);
      const parsedNew = parseMessage(textBody, textBody);
      const TRACKED = ['rent','deposit','bhk','bathrooms','furnishing','location','apartmentType','availability'];
      const hasCorrection = TRACKED.some(
        (f) => parsedNew[f] != null && parsedPrev[f] != null
      );
      if (hasCorrection) draft.correctionCount++;
    }

    _touch(draft);
    await draftStore.set(phone, draft);
    // SILENCE — no response per spec
    return true;
  }

  if (type === 'image') {
    const mediaId = message.image?.id;
    if (mediaId && !draft.seenMediaIds.includes(mediaId)) {
      draft.imageIds.push(mediaId);
      draft.seenMediaIds.push(mediaId);
      _touch(draft);
      await draftStore.set(phone, draft);
    }
    // SILENCE
    return true;
  }

  if (type === 'video') {
    const mediaId = message.video?.id;
    if (mediaId && !draft.seenMediaIds.includes(mediaId)) {
      draft.videoIds.push(mediaId);
      draft.seenMediaIds.push(mediaId);
      _touch(draft);
      await draftStore.set(phone, draft);
    }
    // SILENCE
    return true;
  }

  if (type === 'document') {
    const mediaId = message.document?.id;
    if (mediaId && !draft.seenMediaIds.includes(mediaId)) {
      // Store documents alongside texts as a reference note (broker may send PDFs)
      draft.texts.push(`[Document received: ${message.document?.filename || 'file'}]`);
      draft.seenMediaIds.push(mediaId);
      _touch(draft);
      await draftStore.set(phone, draft);
    }
    // SILENCE
    return true;
  }

  if (type === 'location') {
    const loc = message.location;
    if (loc) {
      const locName = loc.name || loc.address || null;
      const mapsUrl = loc.url || `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
      // Latest location pin wins (in line with "latest value wins" rule)
      draft.locationText = locName || `${loc.latitude},${loc.longitude}`;
      draft.locationMapsUrl = mapsUrl;
      // Also inject as a text so parser can find it
      draft.texts.push(`Maps Link: ${mapsUrl}${locName ? `\nLocation: ${locName}` : ''}`);
      _touch(draft);
      await draftStore.set(phone, draft);
    }
    // SILENCE
    return true;
  }

  // Unknown message type — ignore silently
  logger.debug('Inventory: unhandled message type in COLLECTING', { type, phone });
  return true;
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function _handleStatus(phone, draft) {
  const hasDetails = draft.texts.some((t) => !t.startsWith('[Document') && !t.startsWith('Maps Link'));
  const locationCount = draft.locationText ? 1 : 0;

  if (draft.imageIds.length === 0 && draft.videoIds.length === 0 && !hasDetails) {
    await sendTextMessage(phone, R.statusEmpty());
    return true;
  }

  await sendTextMessage(phone, R.status({
    photoCount: draft.imageIds.length,
    videoCount: draft.videoIds.length,
    locationCount,
    hasDetails,
    correctionCount: draft.correctionCount,
  }));
  return true;
}

async function _handleHelp(phone, _draft) {
  await sendTextMessage(phone, R.help());
  return true;
}

async function _handleMenuCommand(phone, draft) {
  draft.state = 'MID_SESSION_MENU';
  _touch(draft);
  await draftStore.set(phone, draft);
  await sendTextMessage(phone, R.midSessionMenu());
  return true;
}

async function _handleSave(phone, draft) {
  draft.state = 'INACTIVE';
  _touch(draft);
  await draftStore.set(phone, draft);
  await sendTextMessage(phone, R.draftSaved());
  await sendTextMessage(phone, R.mainMenu());
  logger.info('Inventory draft saved', { phone });
  return true;
}

async function _handleCancel(phone, draft) {
  draft.state = 'CONFIRM_CANCEL';
  _touch(draft);
  await draftStore.set(phone, draft);
  await sendTextMessage(phone, R.cancelConfirm());
  return true;
}

// ── CANCEL confirmation ───────────────────────────────────────────────────────

async function _handleCancelConfirmReply(phone, draft, textBody) {
  const choice = parseCancelConfirm(textBody);

  if (choice === 'DELETE') {
    await draftStore.del(phone);
    await sendTextMessage(phone, R.draftDeleted());
    await sendTextMessage(phone, R.mainMenu());
    logger.info('Inventory draft deleted by broker', { phone });
    return true;
  }

  if (choice === 'KEEP') {
    draft.state = 'COLLECTING';
    _touch(draft);
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.keepEditing());
    return true;
  }

  // Unrecognised reply — re-ask
  await sendTextMessage(phone, R.cancelConfirm());
  return true;
}

// ── MID_SESSION_MENU ──────────────────────────────────────────────────────────

async function _handleMidSessionMenuReply(phone, draft, textBody) {
  const choice = parseMidSessionMenu(textBody);

  if (choice === 1) {
    // Continue editing
    draft.state = 'COLLECTING';
    _touch(draft);
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.continueEditing());
    return true;
  }

  if (choice === 2) {
    // Save draft
    return _handleSave(phone, draft);
  }

  if (choice === 3) {
    // Delete draft → go through cancel confirmation
    return _handleCancel(phone, draft);
  }

  if (choice === 4) {
    // Return to main menu (keep draft as INACTIVE)
    draft.state = 'INACTIVE';
    _touch(draft);
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.mainMenu());
    return true;
  }

  // Unrecognised — re-show menu
  await sendTextMessage(phone, R.midSessionMenu());
  return true;
}

// ── RETURN_MENU (returning after INACTIVE) ────────────────────────────────────

async function _handleInactiveMessage(phone, draft, message, textBody) {
  // Any message from broker with an INACTIVE draft → show return menu
  // (unless it's a fresh inventory trigger, which means: resume intent)
  const isNewTrigger = message.type === 'text' && isInventoryTrigger(textBody);

  // Treat both fresh triggers and any other message as "I'm back, show my options"
  draft.state = 'RETURN_MENU';
  _touch(draft);
  await draftStore.set(phone, draft);
  await sendTextMessage(phone, R.returnMenu());
  return true;
}

async function _handleReturnMenuReply(phone, draft, textBody) {
  const choice = parseReturnMenu(textBody);

  if (choice === 1) {
    // Resume
    draft.state = 'COLLECTING';
    draft.nudgeSent = false; // reset nudge for the resumed session
    _touch(draft);
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.resumeSession());
    return true;
  }

  if (choice === 2) {
    // Start fresh — delete old draft, open new session
    await draftStore.del(phone);
    await _startSession(phone);
    return true;
  }

  if (choice === 3) {
    // Delete the draft
    draft.state = 'CONFIRM_CANCEL';
    _touch(draft);
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.cancelConfirm());
    return true;
  }

  if (choice === 4) {
    // Main menu — keep INACTIVE
    draft.state = 'INACTIVE';
    _touch(draft);
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.mainMenu());
    return true;
  }

  // Unrecognised — re-show
  await sendTextMessage(phone, R.returnMenu());
  return true;
}

// ── POST_SUCCESS ──────────────────────────────────────────────────────────────

async function _handlePostSuccessReply(phone, draft, textBody, message) {
  // If broker sends media while in POST_SUCCESS → prompt them to start a new session
  if (message.type === 'image' || message.type === 'video' || message.type === 'document') {
    await sendTextMessage(phone,
      `That ${message.type} just arrived — it's not attached to anything yet.\n\nType *2* or *Add Inventory* to start a new property, or type *2️⃣ Main Menu* to go back.`
    );
    return true;
  }

  const choice = parsePostSuccessMenu(textBody);

  if (choice === 1) {
    // Add another — start fresh immediately
    await draftStore.del(phone);
    const fresh = _newDraft(phone);
    await draftStore.set(phone, fresh);
    await sendTextMessage(phone, R.welcome());
    return true;
  }

  if (choice === 2) {
    // Main menu
    await draftStore.del(phone);
    await sendTextMessage(phone, R.mainMenu());
    return true;
  }

  if (choice === 3) {
    // Done for now
    await draftStore.del(phone);
    await sendTextMessage(phone, `👋 All done! Come back anytime.`);
    return true;
  }

  // Unrecognised — re-show
  await sendTextMessage(phone, R.whatNext());
  return true;
}

// ── DONE handler ──────────────────────────────────────────────────────────────

async function _handleDone(phone, draft) {
  if (draft.processingLock) {
    logger.debug('Inventory: DONE ignored — already processing', { phone });
    return true;
  }

  // Lock against concurrent DONE
  draft.processingLock = true;
  await draftStore.set(phone, draft);

  await sendTextMessage(phone, R.processing());

  try {
    // 1. Parse + normalize all collected text
    const mergedText = draft.texts.join('\n\n');
    const parsed = parseMessage(mergedText, mergedText);
    const normalized = normalize(parsed);

    // 2. Apply extra normalization for fields the base normalizer doesn't cover
    _applyReferenceNorm(normalized);

    // 3. Inject location from WhatsApp pin (overrides text-parsed location if pin is cleaner)
    if (draft.locationText && !normalized.location) {
      normalized.location = draft.locationText;
    }
    if (draft.locationMapsUrl && !normalized.mapsLink) {
      normalized.mapsLink = draft.locationMapsUrl;
    }

    // 4. Validate required fields
    const missing = _validateRequired(normalized);
    if (missing.length > 0) {
      draft.processingLock = false;
      await draftStore.set(phone, draft);
      await sendTextMessage(phone, R.missingFields(missing));
      return true;
    }

    // 5. Duplicate detection
    const dupPid = await _checkDuplicate(normalized, phone);
    if (dupPid) {
      draft.processingLock = false;
      draft.state = 'CONFIRM_DUPLICATE';
      draft._pendingNormalized = normalized; // stash for use on confirm
      await draftStore.set(phone, draft);
      await sendTextMessage(phone, R.duplicateWarning(dupPid));
      return true;
    }

    // 6. Download media
    const { mediaItems, expiredCount } = await _downloadMedia(draft);
    if (expiredCount > 0) {
      draft.processingLock = false;
      await draftStore.set(phone, draft);
      await sendTextMessage(phone, R.mediaExpired(expiredCount));
      return true;
    }

    // 7. Save to Sheets (generates PID, uploads to Cloudinary inside lock)
    const result = await _saveProperty(normalized, mediaItems, phone, draft.sessionId);

    if (!result.ok) {
      draft.processingLock = false;
      await draftStore.set(phone, draft);
      await sendTextMessage(phone, R.saveError());
      return true;
    }

    // 8. Success
    const { pid } = result;
    draft.state = 'POST_SUCCESS';
    draft.processingLock = false;
    draft.savedPid = pid;
    _touch(draft);
    await draftStore.set(phone, draft);

    await sendTextMessage(phone, R.success({
      pid,
      location: normalized.location,
      bhk: normalized.bhk,
      rent: normalized.rent,
      photoCount: draft.imageIds.length,
      videoCount: draft.videoIds.length,
    }));
    await sendTextMessage(phone, R.whatNext());

    logger.info('Inventory property saved', { pid, phone });

  } catch (err) {
    logger.error('Inventory handleDone error', { phone, error: err.message, stack: err.stack });
    draft.processingLock = false;
    await draftStore.set(phone, draft);
    await sendTextMessage(phone, R.saveError());
  }

  return true;
}

// ── Duplicate confirmation ─────────────────────────────────────────────────────

async function _handleDuplicateConfirmReply(phone, draft, textBody) {
  const choice = parseDuplicateWarning(textBody);

  if (choice === 1) {
    // Save anyway
    const normalized = draft._pendingNormalized;
    delete draft._pendingNormalized;
    draft.state = 'COLLECTING';
    draft.processingLock = true;
    await draftStore.set(phone, draft);

    try {
      const { mediaItems, expiredCount } = await _downloadMedia(draft);
      if (expiredCount > 0) {
        draft.processingLock = false;
        await draftStore.set(phone, draft);
        await sendTextMessage(phone, R.mediaExpired(expiredCount));
        return true;
      }

      const result = await _saveProperty(normalized, mediaItems, phone, draft.sessionId);
      if (!result.ok) {
        draft.processingLock = false;
        await draftStore.set(phone, draft);
        await sendTextMessage(phone, R.saveError());
        return true;
      }

      const { pid } = result;
      draft.state = 'POST_SUCCESS';
      draft.processingLock = false;
      draft.savedPid = pid;
      _touch(draft);
      await draftStore.set(phone, draft);
      await sendTextMessage(phone, R.success({
        pid,
        location: normalized.location,
        bhk: normalized.bhk,
        rent: normalized.rent,
        photoCount: draft.imageIds.length,
        videoCount: draft.videoIds.length,
      }));
      await sendTextMessage(phone, R.whatNext());
    } catch (err) {
      draft.processingLock = false;
      await draftStore.set(phone, draft);
      await sendTextMessage(phone, R.saveError());
    }
    return true;
  }

  if (choice === 2) {
    // Cancel — delete draft
    await draftStore.del(phone);
    await sendTextMessage(phone, R.draftDeleted());
    await sendTextMessage(phone, R.mainMenu());
    return true;
  }

  // Unrecognised — re-ask
  const dupPid = draft._pendingNormalized ? await _checkDuplicate(draft._pendingNormalized, phone) : '?';
  await sendTextMessage(phone, R.duplicateWarning(dupPid || '?'));
  return true;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Apply reference-data normalization for tenantType and availability,
 * which the base normalizer doesn't fully standardize.
 */
function _applyReferenceNorm(normalized) {
  // tenantType
  if (normalized.tenantType) {
    const matched = _matchRef(normalized.tenantType, REF.tenantType);
    normalized.tenantType = matched;
  }

  // availability
  if (normalized.availability) {
    const matched = _matchRef(normalized.availability, REF.availability);
    normalized.availability = matched || 'Available'; // default
  } else {
    normalized.availability = 'Available'; // default when not mentioned
  }

  // apartmentType — run through reference data as well (ref data is more complete than normalizer)
  if (normalized.apartmentType == null && normalized.rawMessage) {
    // Already null from normalizer — ref data won't help further
  }
}

function _matchRef(raw, entries) {
  if (!raw || !entries) return null;
  const lower = raw.trim().toLowerCase();
  for (const entry of entries) {
    if (lower === entry.value.toLowerCase()) return entry.value;
    if (entry.aliases.some((a) => lower === a || lower.includes(a) || a.includes(lower))) {
      return entry.value;
    }
  }
  return null;
}

/**
 * Validate required fields. Returns array of human-readable missing field names.
 * Required: Location, Apartment Type, BHK, Bathrooms, Size, Furnishing,
 *           Tenant Type, Rent, Deposit, Availability
 */
function _validateRequired(normalized) {
  const REQUIRED = [
    { key: 'location',      label: 'Property Location' },
    { key: 'apartmentType', label: 'Apartment Type' },
    { key: 'bhk',           label: 'BHK' },
    { key: 'bathrooms',     label: 'Bathrooms' },
    { key: 'size',          label: 'Size (sq ft)' },
    { key: 'furnishing',    label: 'Furnishing' },
    { key: 'tenantType',    label: 'Tenant Type' },
    { key: 'rent',          label: 'Rent' },
    { key: 'deposit',       label: 'Deposit' },
    { key: 'availability',  label: 'Availability' },
  ];
  return REQUIRED
    .filter((f) => normalized[f.key] == null || normalized[f.key] === '' || normalized[f.key] === 0)
    .map((f) => f.label);
}

/**
 * Download all media from WhatsApp. Returns mediaItems array + count of expired items.
 */
async function _downloadMedia(draft) {
  const mediaItems = [];
  let expiredCount = 0;

  for (const imgId of draft.imageIds) {
    const media = await downloadMedia(imgId);
    if (media) {
      mediaItems.push({ buffer: media.buffer, type: 'image' });
    } else {
      expiredCount++;
    }
  }

  for (const vidId of draft.videoIds) {
    const media = await downloadMedia(vidId);
    if (media) {
      mediaItems.push({ buffer: media.buffer, type: 'video' });
    } else {
      expiredCount++;
    }
  }

  return { mediaItems, expiredCount };
}

/**
 * Generate PID, upload media to Cloudinary, write row to Google Sheets.
 * All inside the existing serialized lock in sheets.js.
 */
async function _saveProperty(normalized, mediaItems, phone, sessionId) {
  return generatePIDAndAppend(
    normalized,
    async (pid) => {
      if (mediaItems.length === 0) return [];
      const { urls, failCount } = await uploadAllMedia(pid, mediaItems);
      if (failCount > 0) throw new Error(`${failCount} media upload(s) failed`);
      return urls;
    },
    phone,
    sessionId,
    { pidGenerator: generateEFPID }
  );
}

/**
 * Check if a very similar property was submitted by this broker recently.
 * Similarity = same uniqueKey (location|bhk|rent|apartmentType) within 7 days.
 * @returns {string|null} PID of existing match, or null
 */
async function _checkDuplicate(normalized, phone) {
  try {
    const rows = await getAllRows();
    if (!rows || rows.length < 2) return null;

    const COLUMN_ORDER = [
      'pid','onboardingType','location','apartmentType','societyName','bhk','bathrooms',
      'balcony','utility','size','floor','furnishing','tenantType','vegNonVeg','petsFriendly',
      'rent','maintenance','deposit','availableFrom','negotiation','visitTimings','availability',
      'dateAdded','lastUpdated','messageId','senderPhone','rawMessage','messageTimestamp',
      'uniqueKey','imageUrls','mapsLink',
    ];

    const pidIdx      = COLUMN_ORDER.indexOf('pid');
    const phoneIdx    = COLUMN_ORDER.indexOf('senderPhone');
    const dateIdx     = COLUMN_ORDER.indexOf('dateAdded');
    const keyIdx      = COLUMN_ORDER.indexOf('uniqueKey');

    const newKey = [
      (normalized.location || '').toLowerCase().replace(/\s+/g, ''),
      normalized.bhk || '',
      normalized.rent || '',
      (normalized.apartmentType || '').toLowerCase().replace(/\s+/g, ''),
    ].filter(Boolean).join('|');

    if (!newKey) return null;

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[pidIdx]) continue;
      if (row[phoneIdx] !== phone) continue;
      const dateAdded = new Date(row[dateIdx] || 0).getTime();
      if (dateAdded < cutoff) continue;
      if (row[keyIdx] === newKey) return row[pidIdx];
    }
  } catch (err) {
    logger.warn('Inventory: duplicate check failed (non-blocking)', { error: err.message });
  }
  return null;
}

// ── Initialization ────────────────────────────────────────────────────────────

async function initialize() {
  await draftStore.initialize();
  _startInactivityTimer();
  logger.info('Inventory engine initialized');
}

module.exports = { initialize, tryHandleMessage };
