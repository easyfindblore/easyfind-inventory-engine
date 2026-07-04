'use strict';

/**
 * Gallery Route — EasyFind Search
 *
 * GET /api/gallery/:pid
 *
 * Renders a server-side HTML property gallery page.
 * Reads live from Google Sheets on each request (not from cache)
 * so the page is always up-to-date and works for all existing PIDs
 * with zero backfill.
 *
 * PID collision handling: uses the most recently added row (last match).
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { findByPidLatest, getAllRows, COLUMN_ORDER } = require('../services/sheets');
const { getProperties } = require('../services/propertyCache');
const { renderGallery } = require('../views/galleryTemplate');
const { normalizeAvailability } = require('../search/availabilityNormalizer');

router.get('/:pid', async (req, res) => {
  const { pid } = req.params;
  const rowHint = req.query.row ? parseInt(req.query.row, 10) : null;

  if (!pid || !pid.trim()) {
    return res.status(400).send('<h1>Bad Request</h1><p>PID is required.</p>');
  }

  try {
    let prop = null;

    // If a specific row index was supplied (collision-safe link from search),
    // try to resolve that exact row first. Fall back to latest-PID match.
    if (rowHint && !isNaN(rowHint)) {
      const rows = await getAllRows();
      if (rows && rows[rowHint - 1]) {
        const row = rows[rowHint - 1];
        const rowPid = (row[0] || '').trim().toUpperCase();
        if (rowPid === pid.trim().toUpperCase()) {
          const data = {};
          COLUMN_ORDER.forEach((col, idx) => { data[col] = row[idx] || null; });
          prop = { rowIndex: rowHint, data };
          logger.debug('Gallery: resolved via row hint', { pid, rowHint });
        }
      }
    }

    if (!prop) {
      prop = await findByPidLatest(pid.trim().toUpperCase());
    }

    if (!prop) {
      logger.warn('Gallery: PID not found', { pid });
      return res.status(404).send(
        `<!DOCTYPE html><html><head><title>Not found — EasyFind</title></head>` +
        `<body style="font-family:sans-serif;padding:40px;background:#F5F2EA;">` +
        `<h2 style="color:#232620;">Property not found</h2>` +
        `<p style="color:#5B5A50;">No property with ID <strong>${escAttr(pid)}</strong> was found in the inventory.</p>` +
        `</body></html>`
      );
    }

    // Hydrate computed fields that the template expects (same logic as propertyCache)
    const urlList = (prop.data.imageUrls || '').split(',').map((u) => u.trim()).filter(Boolean);
    prop.data._imageList = urlList.filter((u) => u.includes('/image/upload/'));
    prop.data._videoList = urlList.filter((u) => u.includes('/video/upload/'));
    prop.data._allUrls   = urlList;
    prop.data._availabilityDisplay = normalizeAvailability(prop.data.availableFrom);

    // Similar properties from the in-memory cache (slight staleness is fine for display)
    const allCached = getProperties();
    const propLocation = (prop.data.location || '').toLowerCase().trim();
    const similar = allCached
      .filter((p) =>
        p.rowIndex !== prop.rowIndex &&
        (p.data.location || '').toLowerCase().trim() === propLocation
      )
      .slice(0, 3);

    const html = renderGallery(prop, similar);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(html);

  } catch (err) {
    logger.error('Gallery: render error', { pid, error: err.message, stack: err.stack });
    return res.status(500).send(
      `<!DOCTYPE html><html><head><title>Error — EasyFind</title></head>` +
      `<body style="font-family:sans-serif;padding:40px;background:#F5F2EA;">` +
      `<h2 style="color:#A85C3E;">Something went wrong</h2>` +
      `<p style="color:#5B5A50;">Please try again in a moment.</p>` +
      `</body></html>`
    );
  }
});

function escAttr(val) {
  return String(val || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = router;
