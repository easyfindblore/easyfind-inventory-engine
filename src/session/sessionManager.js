'use strict';

/**
 * Session Manager — EasyFind Inventory Engine
 *
 * In-memory session store. One session per WhatsApp sender.
 * Sessions expire after 30 minutes of inactivity.
 *
 * Reference: docs/specs/06_whatsapp_session_flow.md
 */

const logger = require('../utils/logger');
const { config } = require('../config/config');

// Session states
const STATE = {
  IDLE: 'IDLE',
  ADD_PROPERTY: 'ADD_PROPERTY',
  ADD_MEDIA: 'ADD_MEDIA',
  DELETE_MEDIA: 'DELETE_MEDIA',
  PROCESSING: 'PROCESSING',
};

// Commands
const COMMANDS = {
  ADD_PROPERTY: /^(add|add\s+property|new\s+property|inventory\s+add|start\s+property|create\s+listing)$/i,
  ADD_MEDIA: /^(add\s+(?:photos?|media|images?|videos?)|upload\s+(?:photos?|media))$/i,
  DELETE_MEDIA: /^(delete\s+(?:photos?|media|images?|videos?)|remove\s+(?:photos?|media))$/i,
  DONE: /^(done|finish|complete|submit|end)$/i,
  CANCEL: /^(cancel|stop|exit|abort)$/i,
};

/**
 * Session object shape:
 * {
 *   id: string,
 *   state: STATE.*,
 *   senderPhone: string,
 *   startedAt: Date,
 *   lastActivityAt: Date,
 *   texts: string[],        -- collected text messages
 *   images: string[],       -- collected image media IDs
 *   videos: string[],       -- collected video media IDs
 *   mapsLinks: string[],    -- collected Google Maps links
 *   rawMessages: string[],  -- every raw message (preserved verbatim)
 *   targetPid: string|null, -- for Add Media / Delete Media flows
 * }
 */

class SessionManager {
  constructor() {
    /** @type {Map<string, Object>} — keyed by senderPhone */
    this._sessions = new Map();
    this._timeoutMs = config.session.timeoutMs;

    // Periodic cleanup every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    // Allow process to exit even if interval is pending
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }

    logger.info('SessionManager initialized', { timeoutMs: this._timeoutMs });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get current session for a sender, or null if none.
   * @param {string} senderPhone
   * @returns {Object|null}
   */
  getSession(senderPhone) {
    const session = this._sessions.get(senderPhone);
    if (!session) return null;
    if (this._isExpired(session)) {
      this._expireSession(senderPhone);
      return null;
    }
    return session;
  }

  /**
   * Identify the command in a message text.
   * @param {string} text
   * @returns {'ADD_PROPERTY'|'ADD_MEDIA'|'DELETE_MEDIA'|'DONE'|'CANCEL'|null}
   */
  identifyCommand(text) {
    const t = (text || '').trim();
    for (const [cmd, regex] of Object.entries(COMMANDS)) {
      if (regex.test(t)) return cmd;
    }
    return null;
  }

  /**
   * Start a new Add Property session.
   * Replaces any existing session for this sender.
   * @param {string} senderPhone
   * @returns {Object} new session
   */
  startAddPropertySession(senderPhone) {
    const session = {
      id: `${senderPhone}-${Date.now()}`,
      state: STATE.ADD_PROPERTY,
      senderPhone,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      texts: [],
      images: [],
      videos: [],
      mapsLinks: [],
      rawMessages: [],
      targetPid: null,
    };
    this._sessions.set(senderPhone, session);
    logger.info('Session started', { senderPhone, sessionId: session.id });
    return session;
  }

  /**
   * Start an Add Media session for an existing PID.
   * @param {string} senderPhone
   * @returns {Object} new session
   */
  startAddMediaSession(senderPhone) {
    const session = {
      id: `${senderPhone}-${Date.now()}`,
      state: STATE.ADD_MEDIA,
      senderPhone,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      texts: [],
      images: [],
      videos: [],
      mapsLinks: [],
      rawMessages: [],
      targetPid: null, // set when user sends PID
    };
    this._sessions.set(senderPhone, session);
    logger.info('Add-media session started', { senderPhone });
    return session;
  }

  /**
   * Add a text message to the current session.
   * @param {string} senderPhone
   * @param {string} text
   * @param {string} rawText — unmodified original
   */
  addText(senderPhone, text, rawText) {
    const session = this._getActiveSession(senderPhone);
    if (!session) return;
    session.texts.push(text);
    session.rawMessages.push(rawText || text);
    session.lastActivityAt = new Date();
  }

  /**
   * Add a media item to the current session.
   * @param {string} senderPhone
   * @param {'image'|'video'} type
   * @param {string} mediaId — WhatsApp media ID
   */
  addMedia(senderPhone, type, mediaId) {
    const session = this._getActiveSession(senderPhone);
    if (!session) return;
    if (type === 'image') {
      session.images.push(mediaId);
    } else if (type === 'video') {
      session.videos.push(mediaId);
    }
    session.lastActivityAt = new Date();
    logger.debug('Media added to session', { senderPhone, type, mediaId });
  }

  /**
   * Set the target PID for Add/Delete Media sessions.
   * @param {string} senderPhone
   * @param {string} pid
   */
  setTargetPid(senderPhone, pid) {
    const session = this._getActiveSession(senderPhone);
    if (!session) return;
    session.targetPid = pid;
    session.lastActivityAt = new Date();
  }

  /**
   * Lock the session for processing (called when "Done" is received).
   * @param {string} senderPhone
   * @returns {Object|null} snapshot of session data, or null if no session
   */
  lockForProcessing(senderPhone) {
    const session = this._getActiveSession(senderPhone);
    if (!session) return null;
    session.state = STATE.PROCESSING;
    session.lastActivityAt = new Date();
    logger.info('Session locked for processing', { senderPhone, sessionId: session.id });
    return this._snapshot(session);
  }

  /**
   * Destroy session after processing completes or on cancel.
   * @param {string} senderPhone
   */
  destroySession(senderPhone) {
    this._sessions.delete(senderPhone);
    logger.info('Session destroyed', { senderPhone });
  }

  /**
   * Get session summary for interactive replies.
   * @param {string} senderPhone
   * @returns {Object|null}
   */
  getSummary(senderPhone) {
    const session = this.getSession(senderPhone);
    if (!session) return null;
    return {
      textCount: session.texts.length,
      imageCount: session.images.length,
      videoCount: session.videos.length,
      state: session.state,
    };
  }

  /**
   * Return session state constant.
   * @returns {Object}
   */
  getStates() {
    return STATE;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  _getActiveSession(senderPhone) {
    const session = this._sessions.get(senderPhone);
    if (!session) return null;
    if (this._isExpired(session)) {
      this._expireSession(senderPhone);
      return null;
    }
    return session;
  }

  _isExpired(session) {
    return Date.now() - session.lastActivityAt.getTime() > this._timeoutMs;
  }

  _expireSession(senderPhone) {
    this._sessions.delete(senderPhone);
    logger.info('Session expired', { senderPhone });
  }

  _snapshot(session) {
    return {
      id: session.id,
      state: session.state,
      senderPhone: session.senderPhone,
      startedAt: session.startedAt,
      mergedText: session.texts.join('\n\n'),
      rawMessage: session.rawMessages.join('\n\n---\n\n'),
      images: [...session.images],
      videos: [...session.videos],
      mapsLinks: [...session.mapsLinks],
      imageCount: session.images.length,
      videoCount: session.videos.length,
      textCount: session.texts.length,
      targetPid: session.targetPid,
    };
  }

  _cleanup() {
    let removed = 0;
    for (const [phone, session] of this._sessions.entries()) {
      if (this._isExpired(session)) {
        this._sessions.delete(phone);
        removed++;
      }
    }
    if (removed > 0) {
      logger.info('Session cleanup', { removedCount: removed });
    }
  }
}

// Export a singleton
const sessionManager = new SessionManager();
module.exports = sessionManager;
