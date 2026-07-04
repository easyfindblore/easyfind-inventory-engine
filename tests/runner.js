'use strict';

/**
 * EasyFind Inventory Engine — Test Runner
 *
 * Exercises the parser and normalizer against the full Manus fixture library.
 * No live credentials required — pure unit execution.
 *
 * Suites:
 *   1. Property Messages  (tests/fixtures/property_messages/)  — 100 fixtures
 *   2. Negative Messages  (tests/fixtures/negative_messages/)  —  50 fixtures
 *   3. Webhook Payloads   (tests/fixtures/webhook/)            —   2 fixtures
 *
 * Exit code 0 = all suites passed.
 * Exit code 1 = one or more failures.
 *
 * Run:  node tests/runner.js
 *       npm test
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Colour helpers ────────────────────────────────────────────────────────────
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM    = (s) => `\x1b[2m${s}\x1b[0m`;

// ── Load engine modules (parser + normalizer) ─────────────────────────────────
// Suppress Winston log output during tests
process.env.LOG_LEVEL = 'silent';

const { parseMessage }  = require('../src/parser/messageParser');
const { normalize }     = require('../src/normalizer/normalizer');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFixtures(dir) {
  const fullDir = path.join(__dirname, 'fixtures', dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs.readdirSync(fullDir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.json'))
    .sort()
    .map((f) => ({
      name: f,
      content: fs.readFileSync(path.join(fullDir, f), 'utf8'),
    }));
}

/**
 * Strip a leading "Negative Test Case N:" label if present.
 * The label is not part of the WhatsApp message; the remainder is.
 */
function extractMessageText(raw, isNegative) {
  if (isNegative) {
    const colonIdx = raw.indexOf(':');
    if (colonIdx !== -1 && colonIdx < 40) {
      return raw.slice(colonIdx + 1).trim();
    }
  }
  return raw.trim();
}

// ── Suite 1: Property Messages ────────────────────────────────────────────────

function runPropertySuite() {
  const fixtures = readFixtures('property_messages');
  let pass = 0, fail = 0;
  const failures = [];

  for (const { name, content } of fixtures) {
    const msgText = extractMessageText(content, false);
    try {
      const parsed     = parseMessage(msgText, name);
      const normalized = normalize(parsed);

      // A valid property message should yield at least one of the key fields.
      const hasField = normalized.location || normalized.rent || normalized.bhk || normalized.apartmentType;
      if (!hasField) {
        failures.push({ name, reason: 'no key fields extracted (location/rent/bhk/apartmentType all null)' });
        fail++;
      } else {
        pass++;
      }
    } catch (err) {
      failures.push({ name, reason: `threw: ${err.message}` });
      fail++;
    }
  }

  return { suite: 'Property Messages', total: fixtures.length, pass, fail, failures };
}

// ── Suite 2: Negative Messages ────────────────────────────────────────────────
// Negative messages must NOT crash the parser — output may be empty/partial.

function runNegativeSuite() {
  const fixtures = readFixtures('negative_messages');
  let pass = 0, fail = 0;
  const failures = [];

  for (const { name, content } of fixtures) {
    const msgText = extractMessageText(content, true);
    try {
      const parsed = parseMessage(msgText, name);
      normalize(parsed);
      pass++;
    } catch (err) {
      failures.push({ name, reason: `threw: ${err.message}` });
      fail++;
    }
  }

  return { suite: 'Negative Messages (no-crash)', total: fixtures.length, pass, fail, failures };
}

// ── Suite 3: Normalizer — apartment type edge patterns ────────────────────────
// Hard-coded edge cases that must NOT cross-match.

function runNormalizerEdgeSuite() {
  const { normalize: norm } = require('../src/normalizer/normalizer');

  const cases = [
    // [input, expectedApartmentType, label]
    ['semi furnished 2 bhk rent 30k location bellandur', null,             'semi furnished → null (not Semi Gated)'],
    ['semi-furnished flat', null,                                           'semi-furnished → null'],
    ['gated community property', 'Gated Community',                        'gated community → Gated Community'],
    ['gated', 'Gated Community',                                           'bare gated → Gated Community'],
    ['semi gated', 'Semi Gated',                                           'semi gated → Semi Gated'],
    ['semi-gated community', 'Semi Gated',                                 'semi-gated community → Semi Gated'],
    ['apartment in gated community', 'Gated Community',                    'apartment in gated community → Gated Community'],
    ['flat in gated society', 'Gated Community',                           'flat in gated society → Gated Community'],
    ['community', 'Gated Community',                                       'bare community → Gated Community'],
    ['standalone', 'Stand Alone',                                          'standalone → Stand Alone'],
    ['independent apartment', 'Stand Alone',                               'independent apartment → Stand Alone'],
    ['independent building', 'Stand Alone',                                'independent building → Stand Alone'],
    ['villa', 'Stand Alone',                                               'villa → Stand Alone'],
    ['row house', 'Stand Alone',                                           'row house → Stand Alone'],
    ['bungalow', 'Stand Alone',                                            'bungalow → Stand Alone'],
    // Ambiguous — should return null (re-prompt)
    ['apartment', null,                                                    'bare apartment → null (ambiguous)'],
    ['flat', null,                                                         'bare flat → null (ambiguous)'],
    ['society', null,                                                      'bare society → null (ambiguous)'],
  ];

  let pass = 0, fail = 0;
  const failures = [];

  for (const [aptTypeInput, expected, label] of cases) {
    try {
      // Inject apartmentType directly into a minimal parsed object
      const fakeMsg = `location Bellandur rent 30000 bhk 2bhk apartment type ${aptTypeInput}`;
      const parsed = parseMessage(fakeMsg, 'edge-case');
      // Override apartmentType with the raw value we want to test
      parsed.apartmentType = aptTypeInput;
      const normalized = normalize(parsed);
      const actual = normalized.apartmentType;

      if (actual === expected) {
        pass++;
      } else {
        failures.push({ name: label, reason: `expected "${expected}", got "${actual}"` });
        fail++;
      }
    } catch (err) {
      failures.push({ name: label, reason: `threw: ${err.message}` });
      fail++;
    }
  }

  return { suite: 'Normalizer Edge Cases', total: cases.length, pass, fail, failures };
}

// ── Suite 4: Webhook Payload Structure ───────────────────────────────────────
// Validates the JSON fixtures can be parsed and contain required fields.

function runWebhookFixtureSuite() {
  const fixtures = readFixtures('webhook');
  let pass = 0, fail = 0;
  const failures = [];

  for (const { name, content } of fixtures) {
    try {
      const fixture = JSON.parse(content);
      // Manus fixtures wrap the actual Meta payload under a "payload" key:
      //   { id, description, payload: { object, entry } }
      // Fall back to the root for raw payload format.
      const wa = fixture.payload || fixture;
      const hasObject  = wa.object === 'whatsapp_business_account';
      const hasEntries = Array.isArray(wa.entry) && wa.entry.length > 0;
      if (!hasObject || !hasEntries) {
        failures.push({ name, reason: `missing object or entry fields (object="${wa.object}", entries=${Array.isArray(wa.entry) ? wa.entry.length : 'none'})` });
        fail++;
      } else {
        pass++;
      }
    } catch (err) {
      failures.push({ name, reason: `JSON parse error: ${err.message}` });
      fail++;
    }
  }

  return { suite: 'Webhook Fixture Structure', total: fixtures.length, pass, fail, failures };
}

// ── Reporter ──────────────────────────────────────────────────────────────────

function printResult(result) {
  const icon = result.fail === 0 ? GREEN('✓') : RED('✗');
  const status = result.fail === 0
    ? GREEN(`${result.pass}/${result.total} passed`)
    : RED(`${result.fail} failed`) + DIM(` (${result.pass}/${result.total} passed)`);

  console.log(`  ${icon}  ${BOLD(result.suite)} — ${status}`);

  for (const f of result.failures) {
    console.log(`       ${RED('FAIL')} ${DIM(f.name)}: ${f.reason}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + BOLD('EasyFind Inventory Engine — Test Runner'));
  console.log(DIM('─'.repeat(55)));

  const results = [
    runPropertySuite(),
    runNegativeSuite(),
    runNormalizerEdgeSuite(),
    runWebhookFixtureSuite(),
  ];

  console.log('');
  for (const r of results) printResult(r);
  console.log('');

  const totalPass = results.reduce((s, r) => s + r.pass, 0);
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const totalAll  = results.reduce((s, r) => s + r.total, 0);

  const summary = totalFail === 0
    ? GREEN(`All ${totalAll} tests passed.`)
    : RED(`${totalFail} test(s) failed`) + ` out of ${totalAll}.`;

  console.log(DIM('─'.repeat(55)));
  console.log('  ' + BOLD(summary));
  console.log('');

  if (totalFail > 0) {
    console.log(YELLOW('  Review failures above and fix before deployment.\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(RED('Test runner crashed: ' + err.message));
  process.exit(1);
});
