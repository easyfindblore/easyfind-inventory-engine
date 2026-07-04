'use strict';

/**
 * EasyFind Inventory Engine — Main Entry Point
 *
 * Technology Stack:
 *   - Node.js
 *   - Express (webhook API server)
 *   - Meta WhatsApp Cloud API
 *   - Google Sheets (inventory database)
 *   - Cloudinary (media storage)
 *
 * Reference: docs/architecture/10_system_architecture.md
 */

const express = require('express');
const { config, validateConfig } = require('./config/config');
const logger = require('./utils/logger');
const webhookRouter = require('./routes/webhook');
const galleryRouter = require('./routes/gallery');
const locationMapping = require('./services/locationMapping');
const propertyCache = require('./services/propertyCache');

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();

// JSON body parser for all routes except webhook POST routes.
// Webhook POST handlers use express.raw() so they receive the raw Buffer
// (needed for correct JSON parsing with express.raw).
// Must exclude every path that the webhook router is mounted on.
// Trailing-slash normalisation prevents /api/webhook/ bypassing the check.
const WEBHOOK_PATHS = ['/webhook', '/api/webhook'];
app.use((req, res, next) => {
  const normalizedPath = req.path.replace(/\/+$/, '') || '/';
  if (req.method === 'POST' && WEBHOOK_PATHS.includes(normalizedPath)) {
    return next(); // let webhook router handle raw body
  }
  express.json()(req, res, next);
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check — used by Render and load balancers
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'EasyFind Inventory Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: config.nodeEnv,
  });
});

// WhatsApp webhook — mounted at both /webhook and /api/webhook
// Meta Developer Console is configured with /api/webhook path
app.use('/webhook', webhookRouter);
app.use('/api/webhook', webhookRouter);

// Property gallery page — GET /api/gallery/:pid
app.use('/api/gallery', galleryRouter);

// Root
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'EasyFind Inventory Engine',
    status: 'running',
    endpoints: {
      health:          'GET  /health',
      webhookVerify:   'GET  /webhook  or  /api/webhook',
      webhookReceive:  'POST /webhook  or  /api/webhook',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error('Unhandled express error', { error: err.message, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Startup ───────────────────────────────────────────────────────────────────

const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('═══════════════════════════════════════════');
  logger.info('  EasyFind Inventory Engine');
  logger.info(`  Environment : ${config.nodeEnv}`);
  logger.info(`  Port        : ${PORT}`);
  logger.info('═══════════════════════════════════════════');

  // Log configuration warnings
  const warnings = validateConfig();
  if (warnings.length > 0) {
    logger.warn('Configuration warnings:');
    warnings.forEach((w) => logger.warn(`  ⚠ ${w}`));
  } else {
    logger.info('All credentials configured ✓');
  }

  logger.info('Ready to receive WhatsApp webhooks');

  // ── Search background services ─────────────────────────────────────────────
  // Load Location Mapping and Available property list into memory.
  // Both refresh every 5 minutes automatically.
  locationMapping.startRefresh();
  propertyCache.startRefresh();
  logger.info('Search cache services started (Location Mapping + Property Cache)');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

module.exports = app; // for testing
