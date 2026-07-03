'use strict';

/**
 * Cloudinary Service — EasyFind Inventory Engine
 *
 * Uploads media to Cloudinary using deterministic public_ids.
 * Never stores files locally.
 * Google Sheets (imageUrls column) is the source of truth for media links.
 *
 * Reference: docs/specs/08_media_processing_specification.md
 */

const cloudinaryLib = require('cloudinary').v2;
const logger = require('../utils/logger');
const { config } = require('../config/config');
const { generateMediaPublicId } = require('../utils/pidGenerator');

let _configured = false;

/**
 * Initialize Cloudinary configuration.
 * Called lazily on first use.
 */
function ensureConfigured() {
  if (_configured) return;
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    logger.warn('Cloudinary credentials not configured — media upload will fail');
    return;
  }
  cloudinaryLib.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
  _configured = true;
}

/**
 * Upload a single media buffer to Cloudinary.
 *
 * @param {Buffer} buffer — raw file binary
 * @param {string} pid — Property ID for deterministic naming
 * @param {'image'|'video'} type
 * @param {number} index — 1-based index within this property's media
 * @returns {Promise<string|null>} secure URL or null on failure
 */
async function uploadMedia(buffer, pid, type, index) {
  ensureConfigured();

  if (!config.cloudinary.cloudName) {
    logger.warn('Cloudinary not configured — skipping upload');
    return null;
  }

  const publicId = generateMediaPublicId(pid, type === 'video' ? 'vid' : 'img', index);
  const resourceType = type === 'video' ? 'video' : 'image';

  return new Promise((resolve) => {
    const uploadStream = cloudinaryLib.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true, // deterministic: re-upload is idempotent
        folder: config.cloudinary.folder,
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload failed', { publicId, error: error.message });
          resolve(null);
        } else {
          logger.info('Media uploaded to Cloudinary', { publicId, url: result.secure_url });
          resolve(result.secure_url);
        }
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Upload all media items for a property session.
 *
 * @param {string} pid
 * @param {Array<{buffer: Buffer, type: 'image'|'video'}>} mediaItems
 * @param {number} existingImageCount — for correct index offset on Add Media
 * @returns {Promise<{urls: string[], failCount: number}>}
 */
async function uploadAllMedia(pid, mediaItems, existingImageCount = 0) {
  const urls = [];
  let failCount = 0;
  let imageIndex = existingImageCount;
  let videoIndex = 0;

  for (const item of mediaItems) {
    const index = item.type === 'video' ? ++videoIndex : ++imageIndex;
    const url = await uploadMedia(item.buffer, pid, item.type, index);
    if (url) {
      urls.push(url);
    } else {
      failCount++;
    }
  }

  return { urls, failCount };
}

/**
 * Delete a media asset from Cloudinary by public_id.
 * @param {string} publicId
 * @param {'image'|'video'} resourceType
 * @returns {Promise<boolean>}
 */
async function deleteMedia(publicId, resourceType = 'image') {
  ensureConfigured();
  try {
    const result = await cloudinaryLib.uploader.destroy(publicId, { resource_type: resourceType });
    const success = result.result === 'ok';
    if (success) {
      logger.info('Cloudinary asset deleted', { publicId });
    } else {
      logger.warn('Cloudinary delete returned non-ok', { publicId, result: result.result });
    }
    return success;
  } catch (err) {
    logger.error('Cloudinary delete failed', { publicId, error: err.message });
    return false;
  }
}

module.exports = { uploadMedia, uploadAllMedia, deleteMedia };
