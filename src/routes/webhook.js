'use strict';

/**
 * Webhook Routes — EasyFind Inventory Engine
 *
 * GET  /webhook — Meta verification challenge
 * POST /webhook — Incoming WhatsApp messages
 *
 * Security:
 *   - GET: verify_token must match VERIFY_TOKEN (env secret)
 *
 * Reference: docs/contracts/05_api_integration_contract.md
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const { config } = require('../config/config');
const { processEntry } = require('../controllers/webhookController');

// ── GET /webhook — Meta verification ─────────────────────────────────────────

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('Webhook verification attempt', { mode });

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', {
    mode,
    tokenMatch: token === config.whatsapp.verifyToken,
  });
  return res.status(403).json({ error: 'Verification failed' });
});

// ── POST /webhook — Incoming messages ─────────────────────────────────────────

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  // 1. Parse JSON body (req.body is a Buffer due to express.raw)
  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    logger.error('Webhook JSON parse error', { error: err.message });
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 2. Acknowledge immediately — Meta requires < 5s response
  res.status(200).json({ status: 'received' });

  // 3. Process asynchronously
  if (payload.object === 'whatsapp_business_account') {
    const entries = payload.entry || [];
    for (const entry of entries) {
      processEntry(entry).catch((err) => {
        logger.error('Async processEntry error', { error: err.message });
      });
    }
  } else {
    logger.debug('Non-WhatsApp webhook event ignored', { object: payload.object });
  }
});

module.exports = router;
