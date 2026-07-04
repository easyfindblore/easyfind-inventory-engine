'use strict';

/**
 * Inventory Responses — EasyFind Inventory Engine
 *
 * All broker-facing message templates for the Add Inventory workflow.
 * Exact copy from product spec — do not alter wording without a spec update.
 * Never expose internal IDs, URLs, paths, or stack traces in any message here.
 */

const { config } = require('../config/config');

const R = {

  // ── Session start ──────────────────────────────────────────────────────────

  welcome: () =>
    `📋 Inventory Mode Activated\n\n` +
    `Send me everything for this one property, in any order:\n` +
    `🏠 Property details   📷 Photos   🎥 Videos\n` +
    `📍 Location or map link   👤 Owner info\n` +
    `📄 Documents   ✏️ Corrections & extras\n\n` +
    `I'll stay quiet while you send things — no interruptions, no "got it" pings.\n` +
    `When you're done, just type ✅ DONE.\n\n` +
    `Quick commands anytime:\n` +
    `📊 STATUS · ❓ HELP · 💾 SAVE · ❌ CANCEL · 🏠 MENU\n\n` +
    `Take your time — I'm keeping track of everything.`,

  // ── STATUS command ────────────────────────────────────────────────────────

  statusEmpty: () =>
    `📊 Nothing yet — I'm listening.\n\n` +
    `Send anything about the property whenever you're ready.\n` +
    `Type ❓ HELP for a reminder of what I can take.`,

  status: ({ photoCount, videoCount, locationCount, hasDetails, correctionCount }) => {
    const locLine = `📍 Location: ${locationCount > 0 ? locationCount : 0}`;
    const detailLine = `🏠 Property details: ${hasDetails ? '✅ Received' : '⏳ Not yet'}`;
    const corrLine = correctionCount > 0 ? `\n✏️ Corrections applied: ${correctionCount}` : '';
    return (
      `📊 Here's what I have so far\n\n` +
      `📷 Photos: ${photoCount} · 🎥 Videos: ${videoCount} · ${locLine}\n` +
      `${detailLine}${corrLine}\n\n` +
      `Draft is safe — send more anytime, or type ✅ DONE when you're ready.`
    );
  },

  // ── HELP command ──────────────────────────────────────────────────────────

  help: () =>
    `❓ Quick help\n\n` +
    `You're adding one property. Send anything, any order:\n` +
    `🏠 Details   📷 Photos   🎥 Videos   📍 Location\n` +
    `👤 Owner info   📄 Documents   ✏️ Corrections\n\n` +
    `I stay quiet until you need me. Type ✅ DONE when you're finished.\n\n` +
    `Anytime: 📊 STATUS · 💾 SAVE · ❌ CANCEL · 🏠 MENU`,

  // ── MENU command (mid-session) ────────────────────────────────────────────

  midSessionMenu: () =>
    `📌 You have an unfinished property.\n\n` +
    `1️⃣ Continue Editing\n` +
    `2️⃣ Save Draft\n` +
    `3️⃣ Delete Draft\n` +
    `4️⃣ Return to Main Menu`,

  continueEditing: () =>
    `📋 Back to it — keep sending anything about this property.\nType ✅ DONE when you're finished.`,

  // ── SAVE command ──────────────────────────────────────────────────────────

  draftSaved: () =>
    `💾 Draft saved\n\n` +
    `Your property is stored safely — come back anytime and I'll pick up\n` +
    `right where we left off.\n\n` +
    `Returning to Main Menu. 🏠`,

  // ── CANCEL command ────────────────────────────────────────────────────────

  cancelConfirm: () =>
    `⚠️ Delete this draft? Everything you've sent so far will be gone.\n` +
    `1️⃣ Yes, delete it\n` +
    `2️⃣ No, keep editing`,

  draftDeleted: () =>
    `🗑️ Draft deleted. Fresh start whenever you're ready.\n` +
    `Returning to Main Menu. 🏠`,

  keepEditing: () =>
    `📋 Keeping your draft — carry on whenever you're ready.`,

  // ── Inactivity nudge ──────────────────────────────────────────────────────

  inactivityNudge: () =>
    `👋 Still there? Send anything else about this property, or type ✅ DONE\n` +
    `whenever you're ready. I'll keep waiting.`,

  // ── Return after inactivity ───────────────────────────────────────────────

  returnMenu: () =>
    `👋 Welcome back!\n\n` +
    `Your draft is right where you left it.\n\n` +
    `1️⃣ Resume where I left off\n` +
    `2️⃣ Start a new property\n` +
    `3️⃣ Delete the draft\n` +
    `4️⃣ Main Menu`,

  resumeSession: () =>
    `📋 Picked up where we left off.\n\n` +
    `Keep sending anything about this property. Type ✅ DONE when you're finished.`,

  // ── Processing ────────────────────────────────────────────────────────────

  processing: () =>
    `⏳ Just a moment while I pull this together...\n` +
    `🧠 Reading everything you sent\n` +
    `📷 Organizing your media\n` +
    `✏️ Applying your corrections\n` +
    `💾 Saving it all\n\n` +
    `Almost done.`,

  // ── Missing fields (DONE but incomplete) ─────────────────────────────────

  missingFields: (fields) =>
    `✨ Almost there! Just missing a couple of things:\n\n` +
    fields.map((f) => `📍 ${f}`).join('\n') +
    `\n\nSend those over and type ✅ DONE again — no rush.`,

  // ── Success ───────────────────────────────────────────────────────────────

  success: ({ pid, location, bhk, rent, photoCount, videoCount }) => {
    const rentFmt = rent ? `₹${Number(rent).toLocaleString('en-IN')}` : '';
    const mediaLine = buildMediaLine(photoCount, videoCount);
    const galleryLink = `${config.publicBaseUrl}/api/gallery/${pid}`;
    return (
      `🎉 Property added!\n\n` +
      `🆔 ${pid}\n` +
      `📍 ${location || '—'} · 🏠 ${bhk || '—'} · 💰 ${rentFmt || '—'}\n` +
      `${mediaLine}\n` +
      `📸 Gallery: ${galleryLink}\n\n` +
      `Nice work — it's live in your inventory. ✨`
    );
  },

  whatNext: () =>
    `What's next?\n\n` +
    `1️⃣ Add another property\n` +
    `2️⃣ Main Menu\n` +
    `3️⃣ I'm done for now`,

  // ── Errors (broker-facing, never technical) ───────────────────────────────

  mediaExpired: (count) =>
    `📷 Some media couldn't be retrieved (${count} file${count !== 1 ? 's' : ''} — WhatsApp links expire after 24 hours).\n\n` +
    `Please resend those photos or videos and type ✅ DONE again.`,

  saveError: () =>
    `Something went wrong saving the property. Your draft is intact — please type ✅ DONE to try again in a moment.`,

  uploadError: () =>
    `Couldn't upload your media. Your text details are safe — please resend the photos/videos and type ✅ DONE again.`,

  // ── Main menu (returned to after SAVE / CANCEL / success ──────────────────

  mainMenu: () =>
    `🏠 *Welcome to EasyFind!*\n\nWhat would you like to do?\n\n` +
    `1️⃣ Search Property\n` +
    `2️⃣ Add Inventory\n\n` +
    `Just type *1* or *2*, or say what you're looking for.`,

  // ── Duplicate property warning ─────────────────────────────────────────────

  duplicateWarning: (pid) =>
    `⚠️ A very similar property already exists in your inventory (${pid}).\n\n` +
    `1️⃣ Save anyway (it's a different property)\n` +
    `2️⃣ Cancel — don't save`,

  // ── Unknown command (no active session) ───────────────────────────────────

  unknownWithDraft: () =>
    `👋 You have an unfinished property draft.\n\nType *Add Inventory* to continue, or *2* to pick up where you left off.`,

};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMediaLine(photos, videos) {
  const parts = [];
  if (photos > 0) parts.push(`📷 ${photos} ${photos === 1 ? 'photo' : 'photos'}`);
  if (videos > 0) parts.push(`🎥 ${videos} ${videos === 1 ? 'video' : 'videos'}`);
  return parts.length > 0 ? parts.join(' · ') : '📷 No media';
}

module.exports = R;
