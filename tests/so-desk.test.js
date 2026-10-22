/**
 * The SO team's desk [components/SoDesk.jsx]: three views, readiness, size, EDD, buyer,
 * duplicate, clarification inline, the week's bookings, held orders, the prep sheet.
 *
 *   node --test tests/so-desk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sizeWords } from '../src/utils/soDesk.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the SO dashboard swaps in the SO desk, fed by its own endpoint', () => {
  assert.match(read('pages/DepartmentDashboard.jsx'), /const isSoTeam = data\?\.figures\?\.department === 'order_confirmation';/);
  assert.match(read('pages/DepartmentDashboard.jsx'), /\{tab === 'enquiries' && isSoTeam && <SoDesk me=\{me\} onChanged=\{reload\} \/>\}/);
  assert.match(read('api/endpoints.js'), /soDesk: \(\) => api\.get\('\/departments\/order_confirmation\/so-desk'\)/);
});

test('the desk reads each request for what to do with it: readiness, size, EDD, buyer, duplicate, question', () => {
  const desk = read('components/SoDesk.jsx');
  assert.match(desk, /✓ Ready to prepare/);
  assert.match(desk, /⚠ Missing: /);
  assert.match(desk, />Ask marketing<\/button>/);
  assert.match(desk, /status: 'clarification', note/, 'asking pre-fills Needs Clarification');
  assert.match(desk, /A week or less away and no SO yet/);
  assert.match(desk, /Last order <span/);
  assert.match(desk, /Credit on hold/);
  assert.match(desk, /is already open on this enquiry — second order, or a repeat\?/);
  assert.match(desk, /Waiting on \{question\.waitingOn\?\.name/);
  assert.match(desk, />Got it<\/button>/);
});

test('three views — lanes, table, cards — the week’s bookings, held orders, and a printable prep sheet', () => {
  const desk = read('components/SoDesk.jsx');
  assert.match(desk, /const VIEWS = \[\{ key: 'lanes'/);
  assert.match(desk, /aria-label="Lanes"/);
  assert.match(desk, /function SoTable/);
  assert.match(desk, /'Enquiry', 'Buyer', 'Models', 'Pieces', 'Value', 'Terms', 'PO no\.', 'Earliest EDD', 'Ready\?', 'Status', 'With'/);
  assert.match(desk, /aria-label="Booked this week"/);
  assert.match(desk, /aria-label="Prepared, not yet in production"/);
  assert.match(desk, /id="so-prep-sheet"/);
  assert.match(desk, /window\.print\(\)/);
  assert.match(desk, /localStorage\.getItem\(VIEW_KEY\)/);
});

test('an order is sized in words', () => {
  assert.equal(sizeWords({ models: 2, pieces: 15000, value: 39500 }), '2 models · 15,000 pcs · ₹39,500');
  assert.equal(sizeWords({ models: 1, pieces: 0, value: 0 }), '1 model');
  assert.equal(sizeWords({ models: 0, pieces: 0, value: 0 }), '');
});
