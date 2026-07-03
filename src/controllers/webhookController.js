'use strict';

/**
 * Webhook Controller — EasyFind Inventory Engine
 *
 * Orchestrates the complete property addition flow:
 *   Incoming message → Session → Parser → Normalizer → Cloudinary → Sheets → WhatsApp reply
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

// Required fields for a valid property submission
const REQUIRED_FIELDS = ['location', 'rent', 'apartmentType'];

/**
 * Process a single incoming WhatsApp webhook event.
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
  const messageType = message.type; // text, image, video, etc.

  logger.info('Message received', { senderPhone, messageId, messageType });

  const session = sessionManager.getSession(senderPhone);
  const STATE = sessionManager.getStates();

  // ── Text messages ────────────────────────────────────────────────────────────
  if (messageType === 'text') {
    const text = message.text?.body || '';
    const command = sessionManager.identifyCommand(text);

    // ── Command: Add Property ─────────────────────────────────────────────────
    if (command === 'ADD_PROPERTY') {
      sessionManager.startAddPropertySession(senderPhone);
      await sendTextMessage(senderPhone, RESPONSES.sessionStarted());
      return;
    }

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

    // ── No command — add to session if active ─────────────────────────────────
    if (session) {
      if (session.state === STATE.ADD_MEDIA && !session.targetPid) {
        // User is sending the PID for the media session
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

  // ── Media messages (image / video) ───────────────────────────────────────────
  if (messageType === 'image' || messageType === 'video') {
    if (!session) {
      await sendTextMessage(senderPhone, `📎 Media received, but no active session.\n\nType *Add Property* to start.`);
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

  // ── Location ──────────────────────────────────────────────────────────────────
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
 * Handle the "Done" command — lock session, process, save, reply.
 * @param {string} senderPhone
 * @param {string} messageId
 */
async function handleDone(senderPhone, messageId) {
  const STATE = sessionManager.getStates();
  const currentSession = sessionManager.getSession(senderPhone);

  // ── Add Media flow ────────────────────────────────────────────────────────
  if (currentSession?.state === STATE.ADD_MEDIA) {
    await handleAddMediaDone(senderPhone, currentSession);
    return;
  }

  // ── Add Property flow ─────────────────────────────────────────────────────
  const snapshot = sessionManager.lockForProcessing(senderPhone);
  if (!snapshot) {
    await sendTextMessage(senderPhone, RESPONSES.unknownCommand());
    return;
  }

  await sendTextMessage(senderPhone, RESPONSES.processing());

  try {
    // 1. Parse merged text
    const parsed = parseMessage(snapshot.mergedText, snapshot.rawMessage);

    // 2. Normalize
    const normalized = normalize(parsed);

    // 3. Validate mandatory fields
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

    // 4. Generate PID
    const pid = await generateNextPID();

    // 5. Download media from WhatsApp — treat any download failure as blocking
    const mediaItems = [];
    let downloadFailCount = 0;
    for (const imgId of snapshot.images) {
      const media = await downloadMedia(imgId);
      if (media) {
        mediaItems.push({ buffer: media.buffer, type: 'image' });
      } else {
        downloadFailCount++;
        logger.warn('Media download failed', { imgId });
      }
    }
    for (const vidId of snapshot.videos) {
      const media = await downloadMedia(vidId);
      if (media) {
        mediaItems.push({ buffer: media.buffer, type: 'video' });
      } else {
        downloadFailCount++;
        logger.warn('Media download failed', { vidId });
      }
    }
    if (downloadFailCount > 0) {
      sessionManager.destroySession(senderPhone);
      await sendTextMessage(senderPhone,
        `━━━━━━━━━━━━━━━━━━\n❌ *Property not added.*\n\n*Reason*\n${downloadFailCount} media file${downloadFailCount > 1 ? 's' : ''} could not be downloaded from WhatsApp.\n\nPlease try again.\n━━━━━━━━━━━━━━━━━━`
      );
      return;
    }

    // 6 + 7. Atomically: generate PID → upload Cloudinary (with real PID) → append Sheets.
    //   All three steps run inside a single in-process lock so no concurrent session
    //   can read the same row count before either write commits.
    //   Any Cloudinary failure throws inside the callback, which aborts the append.
    let pid;
    const { ok: saved, pid: resolvedPid } = await generatePIDAndAppend(
      normalized,
      async (confirmedPid) => {
        if (mediaItems.length === 0) return [];
        const { urls, failCount } = await uploadAllMedia(confirmedPid, mediaItems);
        if (failCount > 0) {
          throw new Error(`${failCount} media file${failCount > 1 ? 's' : ''} could not be uploaded to Cloudinary`);
        }
        return urls;
      },
      senderPhone,
      messageId
    );
    pid = resolvedPid;

    if (!saved) {
      sessionManager.destroySession(senderPhone);
      // Distinguish Cloudinary failure from Sheets failure in the reply
      await sendTextMessage(senderPhone,
        `━━━━━━━━━━━━━━━━━━\n❌ *Property not added.*\n\nMedia upload or database write failed. Please try again.\n━━━━━━━━━━━━━━━━━━`
      );
      return;
    }

    // 8. Reply with success
    sessionManager.destroySession(senderPhone);
    const totalMedia = snapshot.imageCount + snapshot.videoCount;
    await sendTextMessage(senderPhone, RESPONSES.successAdded(pid, normalized, totalMedia));

    logger.info('Property added successfully', { pid, senderPhone, mediaCount: totalMedia });

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

    // Download new media — treat any download failure as blocking
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

    // Upload to Cloudinary — any failure blocks Sheets update (fail-closed)
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

    // Update Google Sheets — check return value
    const sheetsUpdated = await updateImageUrls(existing.rowIndex, allUrls);
    sessionManager.destroySession(senderPhone);

    if (!sheetsUpdated) {
      await sendTextMessage(senderPhone, RESPONSES.sheetsError());
      return;
    }

    await sendTextMessage(
      senderPhone,
      RESPONSES.mediaAddedSuccess(pid, urls.length, allUrls.length)
    );
  } catch (err) {
    logger.error('handleAddMediaDone error', { senderPhone, pid, error: err.message });
    sessionManager.destroySession(senderPhone);
    await sendTextMessage(senderPhone, RESPONSES.sheetsError());
  }
}

module.exports = { processEntry };
