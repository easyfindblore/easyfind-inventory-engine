'use strict';

/**
 * Search Responses — EasyFind Search
 *
 * All customer-facing copy for the search flow.
 * Mirrors the style of src/inventory/inventoryResponses.js.
 */

const { config } = require('../config/config');

const R = {

  // ── Acknowledgements ──────────────────────────────────────────────────────

  searching: ({ bhk, location, budgetMax }) => {
    const parts = [];
    if (bhk) parts.push(bhk);
    if (location) parts.push(`near ${location}`);
    if (budgetMax) parts.push(`under ₹${Number(budgetMax).toLocaleString('en-IN')}`);
    const desc = parts.length ? ` for ${parts.join(', ')}` : '';
    return `On it — let's see what's available${desc} 👀`;
  },

  foundHeader: ({ total, shown, bhk, location, budgetMax, relaxed }) => {
    const parts = [];
    if (bhk) parts.push(bhk);
    if (location) parts.push(`near ${location}`);
    if (budgetMax) parts.push(`under ₹${Number(budgetMax).toLocaleString('en-IN')}`);
    const desc = parts.length ? ` matching ${parts.join(', ')}` : '';
    const prefix = relaxed ? `Closest match (not exact)${desc}` : `Found ${total} place${total !== 1 ? 's' : ''}${desc}`;
    return `${prefix}. Here are ${shown} I'd start with:`;
  },

  moreResults: ({ remaining }) =>
    `Want to see more? Reply *more* to see the next ${remaining} option${remaining !== 1 ? 's' : ''}, ` +
    `or tell me what to narrow down (budget, area, furnishing).`,

  noMoreResults: () =>
    `That's everything matching your search — no more options in this list.\n\n` +
    `Reply with different requirements to start a new search.`,

  paginationSuffix: ({ page, total, pageSize }) => {
    const shown = Math.min((page + 1) * pageSize, total);
    return `Showing ${shown} of ${total} — reply *more* for the next set.`;
  },

  // ── Property card text (body for interactive buttons message) ─────────────

  propertyCardBody: ({ bhk, location, rent, highlight }) => {
    const rentFmt = rent ? `₹${Number(rent).toLocaleString('en-IN')}/mo` : '';
    return `${bhk || '—'} · ${location || '—'}\n${rentFmt}\n${highlight || ''}`;
  },

  // ── Zero results ──────────────────────────────────────────────────────────

  noResults: ({ bhk, location, budgetMax }) => {
    const parts = [];
    if (bhk) parts.push(`${bhk}`);
    if (location) parts.push(`in ${location}`);
    if (budgetMax) parts.push(`under ₹${Number(budgetMax).toLocaleString('en-IN')}`);
    const desc = parts.length ? ` ${parts.join(', ')}` : '';
    return (
      `Nothing matching${desc} right now.\n\n` +
      `I've noted your requirement and will flag it when something comes up. ` +
      `Want to try a different area, a slightly higher budget, or fewer filters?`
    );
  },

  watchListConfirm: () =>
    `Your search has been saved — you'll be the first to know when a match comes in.`,

  // ── Button tap responses ──────────────────────────────────────────────────

  contactNow: ({ society, location }) =>
    `Great choice! I've noted your interest in *${society || 'this property'}*` +
    `${location ? `, ${location}` : ''} — someone from EasyFind will reach out on this number shortly. 🏠`,

  moreDetails: ({ pid, rowIndex }) => {
    const rowParam = rowIndex ? `?row=${rowIndex}` : '';
    const url = `${config.publicBaseUrl}/api/gallery/${encodeURIComponent(pid)}${rowParam}`;
    return `Here's the full gallery for this property:\n${url}`;
  },

  // ── Clarifying questions ──────────────────────────────────────────────────

  askLocation: () =>
    `Which area are you looking in? (e.g. Bellandur, HSR Layout, Whitefield)`,

  askBhk: () =>
    `How many bedrooms are you looking for? (1 BHK, 2 BHK, 3 BHK…)`,

  // ── Session expired mid-refinement ────────────────────────────────────────

  sessionExpiredRefinement: () =>
    `Your previous search has expired (30 min idle).\n\n` +
    `No problem — tell me what you're looking for and I'll search again.`,

  // ── Refinement acknowledged ───────────────────────────────────────────────

  refining: () => `Got it — refining your search…`,

};

module.exports = R;
