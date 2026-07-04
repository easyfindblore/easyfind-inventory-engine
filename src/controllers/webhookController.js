'use strict';

/**
 * Webhook Controller — EasyFind Inventory Engine
 *
 * Dispatch layer for all incoming WhatsApp messages.
 * Routes inventory-flow messages to inventoryController first;
 * falls through to the legacy Add Media / Delete Media flows.
 *
 * Scope:
 *   inventoryController — new Add Inventory workflow (this file owns routing only)
 *   Add Media / Delete Media — legacy flows, untouched here
 *
 * Reference:
 *   - docs/specs/06_whatsapp_session_flow.md
 *   - docs/architecture/10_system_architecture.md
 */

const logger = require('../utils/logger');
const sessionManager = require('../session/sessionManager');
const { parseMessage } = require('../parser/messageParser');
const { normalize } = require('../normalizer/normalizer');
const { sendTextMessage, downloadMedia, RESPONSES } = require('../services/whatsapp');
const { uploadAllMedia } = require('../services/cloudinary');
const { generatePIDAndAppend, findByPid, updateImageUrls } = require('../services/sheets');
const inventoryController = require('../inventory/inventoryController');
const searchController = require('../search/searchController');

// Required fields for a valid property submission (legacy flow — kept for Add Media)
const REQUIRED_FIELDS = ['location', 'rent', 'apartmentType'];

/**
 * Process a single incoming WhatsApp webhook entry.
 * @param {Object} entry — parsed from Meta webhook payload
 */
async function processEntry(entry) {
  try {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const messages = value.messages || [];

      for (const message of messages) {
        await processMessage(message, value.metadata);
      }
    }
  } catch (err) {
    logger.error('processEntry error', { error: err.message, stack: err.stack });
  }
}

/**
 * Process a single WhatsApp message.
 * @param {Object} message
 * @param {Object} metadata
 */
async function processMessage(message, metadata) {
  const senderPhone = message.from;
  const messageId = message.id;
  const messageType = message.type;

  logger.info('Message received', { senderPhone, messageId, messageType });

  // ── New Inventory Flow (priority routing) ─────────────────────────────────
  // inventoryController handles: active inventory sessions, INACTIVE drafts,
  // and all inventory trigger phrases ("2", "Add Inventory", "Inventory", "Add").
  // Returns true if it consumed the message.
  const handledByInventory = await inventoryController.tryHandleMessage(message, metadata);
  if (handledByInventory) return;

  // ── Search Flow ───────────────────────────────────────────────────────────
  // searchController handles: explicit search triggers ("1", "Search Property"),
  // active search sessions, and free-text property queries ("2bhk bellandur").
  // Returns true if it consumed the message.
  const handledBySearch = await searchController.tryHandleMessage(message, metadata);
  if (handledBySearch) return;

  // ── Legacy flows (Add Media / Delete Media) ────────────────────────────────

  const session = sessionManager.getSession(senderPhone);
  const STATE = sessionManager.getStates();

  if (messageType === 'text') {
    const text = message.text?.body || '';
    const command = sessionManager.identifyCommand(text);

    // ── Command: Add Media ────────────────────────────────────────────────────
    if (command === 'ADD_MEDIA') {
      sessionManager.startAddMediaSession(senderPhone);
      await sendTextMessage(senderPhone, RESPONSES.addMediaPrompt());
      return;
    }

    // ── Command: Cancel ───────────────────────────────────────────────────────
    if (command === 'CANCEL') {
      if (session) {
        sessionManager.destroySession(senderPhone);
      }
      await sendTextMessage(senderPhone, RESPONSES.cancelled());
      return;
    }

    // ── Command: Done ─────────────────────────────────────────────────────────
    if (command === 'DONE') {
      if (!session) {
        await sendTextMessage(senderPhone, RESPONSES.unknownCommand());
        return;
      }
      await handleDone(senderPhone, messageId);
      return;
    }

    // ── Session active — add text ─────────────────────────────────────────────
    if (session) {
      if (session.state === STATE.ADD_MEDIA && !session.targetPid) {
        const pidCandidate = text.trim().toUpperCase();
        if (/^PID\d+$/i.test(pidCandidate)) {
          const existing = await findByPid(pidCandidate);
          if (existing) {
            sessionManager.setTargetPid(senderPhone, pidCandidate);
            await sendTextMessage(senderPhone, RESPONSES.addMediaReady(pidCandidate));
          } else {
            await sendTextMessage(senderPhone, `❌ Property *${pidCandidate}* not found.\n\nPlease check the PID and try again.`);
          }
        } else {
          await sendTextMessage(senderPhone, `Please send a valid PID.\n\nExample: *PID240703001*`);
        }
        return;
      }

      sessionManager.addText(senderPhone, text, text);
      const summary = sessionManager.getSummary(senderPhone);
      await sendTextMessage(senderPhone, RESPONSES.textReceived(summary.imageCount, summary.videoCount));
    } else {
      await sendTextMessage(senderPhone, RESPONSES.unknownCommand());
    }
    return;
  }

  // ── Media messages ────────────────────────────────────────────────────────
  if (messageType === 'image' || messageType === 'video') {
    if (!session) {
      await sendTextMessage(senderPhone, `📎 Media received, but no active session.\n\nType *Add Inventory* to start.`);
      return;
    }
    const mediaId = message[messageType]?.id;
    if (mediaId) {
      sessionManager.addMedia(senderPhone, messageType, mediaId);
    }
    const summary = sessionManager.getSummary(senderPhone);
    await sendTextMessage(senderPhone, RESPONSES.mediaReceived(summary.imageCount, summary.videoCount));
    return;
  }

  // ── Location ──────────────────────────────────────────────────────────────
  if (messageType === 'location') {
    if (session) {
      const loc = message.location;
      const mapsLink = loc?.url || `https://www.google.com/maps?q=${loc?.latitude},${loc?.longitude}`;
      sessionManager.addText(senderPhone, `Maps Link: ${mapsLink}`, `Maps Link: ${mapsLink}`);
      await sendTextMessage(senderPhone, `📍 Location received.`);
    }
    return;
  }

  logger.debug('Unhandled message type', { messageType, senderPhone });
}

/**
 * Handle the "Done" command for the legacy Add Media flow.
 */
async function handleDone(senderPhone, messageId) {
  const STATE = sessionManager.getStates();
  const currentSession = sessionManager.getSession(senderPhone);

  if (currentSession?.state === STATE.ADD_MEDIA) {
    await handleAddMediaDone(senderPhone, currentSession);
    return;
  }

  // Legacy Add Property flow (no longer triggered — kept as safety fallback)
  const snapshot = sessionManager.lockForProcessing(senderPhone);
  if (!snapshot) {
    await sendTextMessage(senderPhone, RESPONSES.unknownCommand());
    return;
  }

  await sendTextMessage(senderPhone, RESPONSES.processing());

  try {
    const parsed = parseMessage(snapshot.mergedText, snapshot.rawMessage);
    const normalized = normalize(parsed);

    const missing = REQUIRED_FIELDS.filter((f) => !normalized[f]);
    if (missing.length > 0) {
      const labels = {
        location: 'Location',
        rent: 'Rent',
        apartmentType: 'Apartment Type (Community)',
      };
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone, RESPONSES.missingFields(missing.map((f) => labels[f] || f)));
      return;
    }

    const mediaItems = [];
    let downloadFailCount = 0;
    for (const imgId of snapshot.images) {
      const media = await downloadMedia(imgId);
      if (media) { mediaItems.push({ buffer: media.buffer, type: 'image' }); }
      else { downloadFailCount++; logger.warn('Media download failed', { imgId }); }
    }
    for (const vidId of snapshot.videos) {
      const media = await downloadMedia(vidId);
      if (media) { mediaItems.push({ buffer: media.buffer, type: 'video' }); }
      else { downloadFailCount++; logger.warn('Media download failed', { vidId }); }
    }
    if (downloadFailCount > 0) {
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone,
        `━━━━━━━━━━━━━━━━━━\n❌ *Property not added.*\n\n*Reason*\n${downloadFailCount} media file${downloadFailCount > 1 ? 's' : ''} could not be downloaded from WhatsApp.\n\nPlease try again.\n━━━━━━━━━━━━━━━━━━`
      );
      return;
    }

    const { ok: saved, pid } = await generatePIDAndAppend(
      normalized,
      async (confirmedPid) => {
        if (mediaItems.length === 0) return [];
        const { urls, failCount } = await uploadAllMedia(confirmedPid, mediaItems);
        if (failCount > 0) throw new Error(`${failCount} media file${failCount > 1 ? 's' : ''} could not be uploaded to Cloudinary`);
        return urls;
      },
      senderPhone,
      messageId
    );

    if (!saved) {
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone,
        `━━━━━━━━━━━━━━━━━━\n❌ *Property not added.*\n\nMedia upload or database write failed. Please try again.\n━━━━━━━━━━━━━━━━━━`
      );
      return;
    }

    sessionManager.destroySession(senderPhone);
    const totalMedia = snapshot.imageCount + snapshot.videoCount;
    await sendTextMessage(senderPhone, RESPONSES.successAdded(pid, normalized, totalMedia));
    logger.info('Property added successfully (legacy flow)', { pid, senderPhone, mediaCount: totalMedia });

  } catch (err) {
    logger.error('handleDone error', { senderPhone, error: err.message, stack: err.stack });
    sessionManager.destroySession(senderPhone);
    await sendTextMessage(senderPhone, RESPONSES.sheetsError());
  }
}

/**
 * Handle "Done" in the Add Media flow.
 */
async function handleAddMediaDone(senderPhone, session) {
  const pid = session.targetPid;
  if (!pid) {
    await sendTextMessage(senderPhone, `❌ No PID set.\n\nPlease send the property PID first.`);
    return;
  }

  const snapshot = sessionManager.lockForProcessing(senderPhone);
  await sendTextMessage(senderPhone, `⏳ Uploading media to *${pid}*...`);

  try {
    const existing = await findByPid(pid);
    if (!existing) {
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone, `❌ Property *${pid}* not found.`);
      return;
    }

    const existingUrls = (existing.data.imageUrls || '').split(',').map((u) => u.trim()).filter(Boolean);

    const mediaItems = [];
    let dlFail = 0;
    for (const imgId of snapshot.images) {
      const media = await downloadMedia(imgId);
      if (media) { mediaItems.push({ buffer: media.buffer, type: 'image' }); } else { dlFail++; }
    }
    for (const vidId of snapshot.videos) {
      const media = await downloadMedia(vidId);
      if (media) { mediaItems.push({ buffer: media.buffer, type: 'video' }); } else { dlFail++; }
    }
    if (dlFail > 0) {
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone,
        `━━━━━━━━━━━━━━━━━━\n❌ *Media not added.*\n\n*Reason*\n${dlFail} file${dlFail > 1 ? 's' : ''} could not be downloaded from WhatsApp.\n\nPlease try again.\n━━━━━━━━━━━━━━━━━━`
      );
      return;
    }

    const { urls, failCount } = await uploadAllMedia(pid, mediaItems, existingUrls.length);
    if (failCount > 0) {
      logger.error('Add-media Cloudinary upload failed — Sheets not updated', { pid, failCount });
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone,
        `━━━━━━━━━━━━━━━━━━\n❌ *Media not added.*\n\n*Reason*\n${failCount} file${failCount > 1 ? 's' : ''} could not be uploaded.\n\nPlease try again.\n━━━━━━━━━━━━━━━━━━`
      );
      return;
    }
    const allUrls = [...existingUrls, ...urls];

    const sheetsUpdated = await updateImageUrls(existing.rowIndex, allUrls);
    sessionManager.destroySession(senderPhone);

    if (!sheetsUpdated) {
      await sendTextMessage(senderPhone, RESPONSES.sheetsError());
      return;
    }

    await sendTextMessage(senderPhone, RESPONSES.mediaAddedSuccess(pid, urls.length, allUrls.length));
  } catch (err) {
    logger.error('handleAddMediaDone error', { senderPhone, pid, error: err.message });
    sessionManager.destroySession(senderPhone);
    await sendTextMessage(senderPhone, RESPONSES.sheetsError());
  }
}

module.exports = { processEntry };
