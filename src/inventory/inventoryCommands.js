'use strict';

/**
 * Inventory Commands — EasyFind Inventory Engine
 *
 * Command recognition and menu reply normalization for the Add Inventory flow.
 * All matching is case-insensitive with generous alias coverage.
 * Relies on text-only matching — never on message type or session state.
 */

// ── Inventory Mode Triggers ───────────────────────────────────────────────────

/**
 * Returns true if the raw text should open an Inventory Mode session.
 * Triggers: "2", "inventory", "add inventory", "add" (whole message only).
 *
 * "Add" is the weakest signal — must be the broker's entire trimmed message.
 * The other three tolerate minor surrounding punctuation/emoji.
 */
function isInventoryTrigger(text) {
  if (!text) return false;
  const t = text.trim();

  // Bare digit "2"
  if (t === '2' || t === '2️⃣') return true;

  const lower = t.toLowerCase().replace(/[!?.]+$/, '').trim(); // strip trailing punc

  // Exact "add" (whole message, trimmed — weakest signal, strictest match)
  if (lower === 'add') return true;

  // "inventory" (generously — standalone word)
  if (/^inventor(?:y|ies)$/.test(lower)) return true;

  // "add inventory" / "add inventories" / minor variants
  if (/^add\s+inventor(?:y|ies)$/.test(lower)) return true;

  // "inventory add", "start inventory", "new inventory"
  if (/^(?:start|new|begin)\s+inventor(?:y|ies)$/.test(lower)) return true;

  // Legacy aliases: "add property", "new property", "start property", etc.
  // Kept for backward compat — brokers who used the old trigger phrase still enter the new flow.
  if (/^(?:add|new|start)\s+property$/.test(lower)) return true;
  if (/^(?:create|add)\s+listing$/.test(lower)) return true;

  return false;
}

// ── Mid-session Command Recognition ──────────────────────────────────────────

/**
 * Identifies a command keyword inside an active inventory session.
 * Returns: 'DONE' | 'STATUS' | 'HELP' | 'MENU' | 'SAVE' | 'CANCEL' | null
 */
function identifySessionCommand(text) {
  if (!text) return null;

  // Normalize: strip leading/trailing emoji indicators, lowercase, trim
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // ── DONE ──────────────────────────────────────────────────────────────────
  // Allow "✅ DONE", "DONE ✅", "✅", bare "done", aliases
  if (/^✅\s*done?$/i.test(raw) || /^done?\s*✅$/i.test(raw) || raw === '✅') return 'DONE';
  if (/^(done|finish|finished|complete|completed|process|submit|submitted)$/i.test(lower)) return 'DONE';
  if (/^(all\s+shared|that'?s?\s+all|everything\s+sent|thats\s+all|that\s+is\s+all)$/i.test(lower)) return 'DONE';

  // ── STATUS ─────────────────────────────────────────────────────────────────
  if (/^📊/.test(raw)) return 'STATUS';
  if (/^(status|progress|summary|show\s+status|how\s+much\s+received\??|show\s+progress|whats?\s+received)$/i.test(lower)) return 'STATUS';

  // ── HELP ──────────────────────────────────────────────────────────────────
  if (/^❓/.test(raw)) return 'HELP';
  if (/^(\?|help|what\s+can\s+i\s+do\??|instructions?)$/i.test(lower)) return 'HELP';

  // ── MENU ──────────────────────────────────────────────────────────────────
  if (/^🏠/.test(raw)) return 'MENU';
  if (/^(menu|home|main\s+menu|back)$/i.test(lower)) return 'MENU';

  // ── SAVE ──────────────────────────────────────────────────────────────────
  if (/^💾/.test(raw)) return 'SAVE';
  if (/^(save|save\s+draft|continue\s+later|pause)$/i.test(lower)) return 'SAVE';

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (/^❌/.test(raw)) return 'CANCEL';
  if (/^(cancel|discard|delete\s+draft|start\s+over)$/i.test(lower)) return 'CANCEL';

  return null;
}

// ── Menu Reply Normalization ──────────────────────────────────────────────────

/**
 * Normalize a broker's reply to a numbered menu into a 1-based option index.
 *
 * @param {string} text — broker's raw reply
 * @param {string[]} optionLabels — option labels (lowercase) e.g. ['continue editing','save draft',...]
 * @returns {number|null} 1-based option number, or null if unrecognised
 */
function normalizeMenuChoice(text, optionLabels) {
  if (!text) return null;
  const t = text.trim();
  const lower = t.toLowerCase();

  // Emoji number map
  const emojiNums = { '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5 };
  for (const [emoji, num] of Object.entries(emojiNums)) {
    if (t.startsWith(emoji) || lower === emoji) return num;
  }

  // Bare digit
  const digitMatch = t.match(/^([1-9])$/);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  // Match against option labels (both directions: text ⊆ label or label ⊆ text)
  for (let i = 0; i < optionLabels.length; i++) {
    const label = optionLabels[i].toLowerCase().trim();
    if (lower === label || lower.includes(label) || label.includes(lower)) {
      return i + 1;
    }
  }

  return null;
}

// ── Specific Menu Helpers ─────────────────────────────────────────────────────

/** Normalise reply to the CANCEL confirmation. */
function parseCancelConfirm(text) {
  const n = normalizeMenuChoice(text, ['yes, delete it', 'no, keep editing']);
  if (n === 1) return 'DELETE';
  if (n === 2) return 'KEEP';
  const lower = (text || '').trim().toLowerCase();
  if (/^(yes|y|delete|confirm|sure|ok)$/.test(lower)) return 'DELETE';
  if (/^(no|n|keep|back|cancel|stop)$/.test(lower)) return 'KEEP';
  return null;
}

/** Normalise reply to the mid-session MENU. */
function parseMidSessionMenu(text) {
  const n = normalizeMenuChoice(text, ['continue editing', 'save draft', 'delete draft', 'return to main menu']);
  if (n) return n;
  const lower = (text || '').trim().toLowerCase();
  if (/continue|resume|edit|back to property/.test(lower)) return 1;
  if (/save|draft/.test(lower)) return 2;
  if (/delete|discard|remove/.test(lower)) return 3;
  if (/menu|home|main/.test(lower)) return 4;
  return null;
}

/** Normalise reply to the RETURN_MENU (back after inactivity). */
function parseReturnMenu(text) {
  const n = normalizeMenuChoice(text, ['resume where i left off', 'start a new property', 'delete the draft', 'main menu']);
  if (n) return n;
  const lower = (text || '').trim().toLowerCase();
  if (/resume|continue|pick up|left off/.test(lower)) return 1;
  if (/new|start fresh|start new|another/.test(lower)) return 2;
  if (/delete|discard|remove/.test(lower)) return 3;
  if (/menu|home|main/.test(lower)) return 4;
  return null;
}

/** Normalise reply to the POST_SUCCESS "What's next?" menu. */
function parsePostSuccessMenu(text) {
  const n = normalizeMenuChoice(text, ['add another property', 'main menu', "i'm done for now"]);
  if (n) return n;
  const lower = (text || '').trim().toLowerCase();
  if (/add|another|new property/.test(lower)) return 1;
  if (/menu|home|main/.test(lower)) return 2;
  if (/done|exit|bye|finished|no more|stop/.test(lower)) return 3;
  return null;
}

/** Normalise reply to the DUPLICATE WARNING menu. */
function parseDuplicateWarning(text) {
  const n = normalizeMenuChoice(text, ['save anyway', 'cancel']);
  if (n) return n;
  const lower = (text || '').trim().toLowerCase();
  if (/save|different|yes|proceed|anyway/.test(lower)) return 1;
  if (/cancel|no|don't|dont/.test(lower)) return 2;
  return null;
}

module.exports = {
  isInventoryTrigger,
  identifySessionCommand,
  normalizeMenuChoice,
  parseCancelConfirm,
  parseMidSessionMenu,
  parseReturnMenu,
  parsePostSuccessMenu,
  parseDuplicateWarning,
};
