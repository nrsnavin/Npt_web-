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
  assert.match(read('pages/DepartmentDashboard.jsx'), /\) : isSoTeam \? \(\s*<SoDesk me=\{me\} onChanged=\{reload\} \/>/);
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

test('cards only — no lanes, no table, no view toggle, no prep sheet — with the week’s bookings and held orders', () => {
  const desk = read('components/SoDesk.jsx');
  assert.doesNotMatch(desk, /VIEWS|aria-label="Lanes"|function SoTable|localStorage|aria-label="View"/);
  assert.match(desk, /<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">\s*\{rows\.map\(\(row\) => <SoCard key=\{row\.task\._id\}/);
  assert.match(desk, /aria-label="Booked this week"/);
  assert.match(desk, /aria-label="Prepared, not yet in production"/);
  assert.doesNotMatch(desk, /so-prep-sheet|window\.print\(\)|Print prep sheet|PrepSheet/);
});

test('an order is sized in words', () => {
  assert.equal(sizeWords({ models: 2, pieces: 15000, value: 39500 }), '2 models · 15,000 pcs · ₹39,500');
  assert.equal(sizeWords({ models: 1, pieces: 0, value: 0 }), '1 model');
  assert.equal(sizeWords({ models: 0, pieces: 0, value: 0 }), '');
});

test('the SO task offers only Escalate to Admin beside its workflow — the form says so, the actions follow it', () => {
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /const allowed = buttonFor\(catalogue, todo\.kind\)\?\.form\?\.taskActions;/);
  assert.match(actions, /\]\.filter\(\(choice\) => allows\(choice\.key\)\)\.concat\(escalate, adminClose\);/);
  for (const key of ['update', 'back', 'date']) assert.match(actions, new RegExp(`\\{allows\\('${key}'\\) && <button`));
});

test('marketing’s answers stay on the SO card, and on the enquiry for marketing and Admin', () => {
  const desk = read('components/SoDesk.jsx');
  assert.match(desk, /function Answered\(\{ answered, question \}\)/);
  assert.match(desk, /<Answered answered=\{so\.answered\} question=\{so\.question\} \/>/);
  assert.match(desk, /Marketing’s answers \(\{list\.length\}\)/);
  /* The answer already shown under the question is not listed twice. */
  assert.match(desk, /question\?\.answer \? \(answered \|\| \[\]\)\.slice\(0, -1\)/);
  const panel = read('components/EnquiryClarifications.jsx');
  assert.match(panel, /Questions answered \(\$\{list\.length\}\)/);
  assert.match(panel, /pair\.answeredBy\?\.name/);
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /<EnquiryClarifications clarifications=\{enquiry\.clarifications\} \/>/);
});

test('a new SO request on an enquiry in production alerts first and is sent only once ticked', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /kind === 'po_so' \? runningOrder \|\| prefill\?\.orderInProduction \|\| null : null/);
  assert.match(dialog, /\(running && !stopOk\)/, 'blocked until ticked');
  assert.match(dialog, /running && stopOk \? \{ revise: true \}/);
  assert.match(dialog, /Stop that production and send this SO request/);
  assert.match(dialog, /failure\.details\?\.code === 'SO_IN_PRODUCTION'/, 'a refusal from the server opens the same alert');
  assert.match(dialog, /'Stop production & send'/);
});
