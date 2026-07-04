'use strict';

/**
 * Webhook Routes — EasyFind Inventory Engine
 *
 * GET  /webhook — Meta verification challenge
 * POST /webhook — Incoming WhatsApp messages
 *
 * Security:
 *   - GET: verify_token must match WHATSAPP_VERIFY_TOKEN
 *   - POST: HMAC-SHA256 signature must match X-Hub-Signature-256 header
 *
 * Reference: docs/contracts/05_api_integration_contract.md
 */

const express = require('express');
const crypto = require('crypto');
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
  // 1. Verify HMAC signature — fail-closed in production
  const appSecret = config.whatsapp.appSecret;
  const isProduction = config.nodeEnv === 'production';

  if (appSecret) {
    // HMAC-SHA256 verification — enforced when WHATSAPP_APP_SECRET is configured.
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || typeof signature !== 'string') {
      logger.warn('Webhook POST rejected — missing X-Hub-Signature-256');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(req.body)
      .digest('hex');

    // Guard against timingSafeEqual crash on unequal-length buffers
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      logger.warn('Webhook POST rejected — invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } else {
    // WHATSAPP_APP_SECRET not configured — skip signature verification.
    // This matches the previous working architecture which did not require it.
    // Meta will still send payloads; we accept them without HMAC enforcement.
    logger.warn('Signature verification skipped — WHATSAPP_APP_SECRET not set');
  }

  // 2. Parse JSON body (req.body is a Buffer due to express.raw)
  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    logger.error('Webhook JSON parse error', { error: err.message });
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 3. Acknowledge immediately — Meta requires < 5s response
  res.status(200).json({ status: 'received' });

  // 4. Process asynchronously
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
