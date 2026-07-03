'use strict';

/**
 * WhatsApp Service — EasyFind Inventory Engine
 *
 * Sends messages via Meta WhatsApp Cloud API.
 * Reference: docs/contracts/05_api_integration_contract.md
 *
 * Never logs access tokens.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { config } = require('../config/config');

/**
 * Send a plain text message to a WhatsApp number.
 * @param {string} to — recipient phone number (with country code, no +)
 * @param {string} text — message body
 * @returns {Promise<Object|null>}
 */
async function sendTextMessage(to, text) {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    logger.warn('WhatsApp credentials not configured — message not sent', { to });
    return null;
  }

  try {
    const url = `${config.whatsapp.apiBaseUrl}/${config.whatsapp.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info('WhatsApp message sent', { to, messageId: response.data?.messages?.[0]?.id });
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    logger.error('WhatsApp send failed', { to, status, detail });
    return null;
  }
}

/**
 * Download media from WhatsApp by media ID.
 * Returns a Buffer of the raw binary content.
 * @param {string} mediaId
 * @returns {Promise<{buffer: Buffer, mimeType: string}|null>}
 */
async function downloadMedia(mediaId) {
  if (!config.whatsapp.accessToken) {
    logger.warn('WhatsApp credentials not configured — media download skipped');
    return null;
  }

  try {
    // Step 1: Get the media URL
    const metaUrl = `${config.whatsapp.apiBaseUrl}/${mediaId}`;
    const metaRes = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
    });
    const mediaUrl = metaRes.data?.url;
    const mimeType = metaRes.data?.mime_type || 'application/octet-stream';

    if (!mediaUrl) {
      logger.error('No URL returned for media', { mediaId });
      return null;
    }

    // Step 2: Download the actual file
    const fileRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
    });

    return {
      buffer: Buffer.from(fileRes.data),
      mimeType,
    };
  } catch (err) {
    logger.error('Media download failed', { mediaId, error: err.message });
    return null;
  }
}

// ─── Pre-built response messages ─────────────────────────────────────────────

const RESPONSES = {
  sessionStarted: () =>
    `━━━━━━━━━━━━━━━━━━━━━━\n🏡 *Property Addition Started*\n\nYou can now send:\n\n• Property details\n• Photos\n• Videos\n• Maps Link\n• Corrections\n• Additional information\n\n📌 Send them in ANY order.\n\nWhen finished simply type\n*Done*\nor\n*Finish*\nor\n*Complete*\n\nTo cancel anytime type\n*Cancel*\n━━━━━━━━━━━━━━━━━━━━━━`,

  mediaReceived: (imageCount, videoCount) => {
    const parts = [];
    if (imageCount > 0) parts.push(`${imageCount} Image${imageCount > 1 ? 's' : ''}`);
    if (videoCount > 0) parts.push(`${videoCount} Video${videoCount > 1 ? 's' : ''}`);
    return `📸 Received!\n\nCurrent Media:\n${parts.join('\n')}\n\n━━━━━━━━━━━━\nReady whenever you type *Done*.`;
  },

  textReceived: (imageCount, videoCount) =>
    `📝 Property details received.\n\n📦 Total collected so far:\n${imageCount + videoCount} Media file${imageCount + videoCount !== 1 ? 's' : ''}\n\nReady whenever you type *Done*.`,

  processing: () =>
    `━━━━━━━━━━━━━━━━━━\n⏳ *Processing Property...*\n\nChecking duplicate...\nUploading media...\nParsing details...\nUpdating inventory...\n\nPlease wait...\n━━━━━━━━━━━━━━━━━━`,

  successAdded: (pid, property, mediaCount) =>
    `━━━━━━━━━━━━━━━━━━\n✅ *Property Added Successfully*\n\n*PID*\n${pid}\n\n*Status*\nNew Property\n\n*Fields Updated*\n${buildFieldList(property)}\n\n*Media Processed*\n${mediaCount} File${mediaCount !== 1 ? 's' : ''}\n\n━━━━━━━━━━━━━━━━━━\n\nAnything else?\n\n1️⃣ Add another property\n2️⃣ Update existing property\n3️⃣ Exit`,

  cancelled: () =>
    `━━━━━━━━━━━━━━━━━━\n❌ *Property addition cancelled.*\n\nEverything collected during this session has been discarded.\n\nNothing was saved.\n━━━━━━━━━━━━━━━━━━`,

  expired: () =>
    `━━━━━━━━━━━━━━━━━━\n⌛ *Session expired.*\n\nNo activity detected for 30 minutes.\n\nCollected information has been discarded.\n\nStart again by typing\n*Add Property*\n━━━━━━━━━━━━━━━━━━`,

  missingFields: (fields) =>
    `━━━━━━━━━━━━━━━━━━\n❌ *Property could not be added.*\n\n*Reason*\nMandatory information missing.\n\n*Missing*\n${fields.join('\n')}\n\nNothing has been saved.\n\nPlease send the missing details and type *Done* again.\n━━━━━━━━━━━━━━━━━━`,

  addMediaPrompt: () =>
    `━━━━━━━━━━━━━━━━━━\n📷 *Add Media to Property*\n\nPlease send the *PID* of the property you want to add media to.\n\nExample: PID240703001\n━━━━━━━━━━━━━━━━━━`,

  addMediaReady: (pid) =>
    `📌 Property *${pid}* found.\n\nNow send your photos and videos.\n\nType *Done* when finished.`,

  mediaAddedSuccess: (pid, added, total) =>
    `━━━━━━━━━━━━━━━━━━\n✅ *Existing Property Updated*\n\n*PID*\n${pid}\n\n*Added*\n${added} File${added !== 1 ? 's' : ''}\n\n*Total Media*\n${total}\n\nInventory Updated Successfully.\n━━━━━━━━━━━━━━━━━━`,

  unknownCommand: () =>
    `I didn't understand that.\n\nType *Add Property* to start adding a property.\nType *Done* to complete a session.\nType *Cancel* to discard a session.`,

  sheetsError: () =>
    `━━━━━━━━━━━━━━━━━━\n❌ *Property not added.*\n\n*Reason*\nInventory database unavailable.\n\nPlease try again shortly.\n━━━━━━━━━━━━━━━━━━`,
};

function buildFieldList(property) {
  const fields = [];
  if (property.apartmentType) fields.push('✓ Apartment Type');
  if (property.societyName) fields.push('✓ Society');
  if (property.location) fields.push('✓ Location');
  if (property.bhk) fields.push('✓ BHK');
  if (property.bathrooms) fields.push('✓ Bathrooms');
  if (property.balcony != null) fields.push('✓ Balcony');
  if (property.utility) fields.push('✓ Utility');
  if (property.furnishing) fields.push('✓ Furnishing');
  if (property.rent) fields.push('✓ Rent');
  if (property.deposit) fields.push('✓ Deposit');
  if (property.maintenance) fields.push('✓ Maintenance');
  if (property.floor) fields.push('✓ Floor');
  if (property.size) fields.push('✓ Sq.ft');
  if (property.availableFrom) fields.push('✓ Available From');
  if (property.tenantType) fields.push('✓ Tenant');
  if (property.petsFriendly) fields.push('✓ Pets');
  if (property.mapsLink) fields.push('✓ Map Link');
  fields.push('✓ Raw Message');
  return fields.join('\n');
}

module.exports = { sendTextMessage, downloadMedia, RESPONSES };
