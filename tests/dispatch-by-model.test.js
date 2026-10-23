/**
 * An order going out model by model on the screens: the Dispatch desk says what may go now, what
 * has gone and what is still being made; the enquiry's dispatch plan line says what was sent;
 * the enquiries list has a Closed view and keeps Task Closed off Open; a card's WhatsApp number
 * starts as the mobile.
 *
 *   node --test tests/dispatch-by-model.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MARKETING_STATUSES } from '../src/utils/pipeline.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the Dispatch desk shows ready / sent / still being made for an order going out by model', () => {
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /\{row\.readiness\?\.plan === 'by_model' && \(/);
  assert.match(desk, /aria-label="Models to dispatch"/);
  assert.match(desk, /Ready to go: \{row\.readiness\.ready\.filter\(\(model\) => !\(row\.readiness\.sent \|\| \[\]\)\.includes\(model\)\)\.join\(', '\) \|\| 'none yet'\}/);
  assert.match(desk, /· Sent: \{row\.readiness\.sent\.join\(', '\)\}/);
  assert.match(desk, /mark Part Quantity Dispatched with the models sent/);
  assert.match(read('components/DepartmentDesk.jsx'), /\{readiness\.sent\?\.length > 0 && `Sent: \$\{readiness\.sent\.join\(', '\)\} · `\}/);
  assert.ok(MARKETING_STATUSES.some((entry) => entry.value === 'part_sent' && entry.label === 'Part sent'));
});

test('the enquiries list has a Closed view, and Open keeps Task Closed out', () => {
  const page = read('pages/Enquiries.jsx');
  assert.match(page, /\['open', 'due', 'closed', 'all'\]\.includes\(searchParams\.get\('view'\)\)/);
  assert.match(page, /\{ value: 'closed', label: 'Closed' \}/);
  assert.match(page, /open: view === 'closed' \? 'false' : !forCustomer && !source && !plantStage && \(view === 'open' \|\| view === 'due'\) \? 'true' : undefined/);
});

test('a buyer card starts with the WhatsApp number as the mobile, still editable', () => {
  const cards = read('pages/BuyerCards.jsx');
  assert.match(cards, /whatsapp: card\.reading\?\.whatsapp \|\| card\.reading\?\.mobile \|\| '',/);
  assert.match(cards, /<ReadField \{\.\.\.common\} label="WhatsApp" name="whatsapp" inputMode="tel" \/>/);
});
