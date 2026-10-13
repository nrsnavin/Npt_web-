/**
 * Unit tests for the plain helpers no screen test reached: maps links, the remembered start
 * page, status colours, number and date wording, and the enquiry form's pure functions.
 *
 *   node --test tests/utils-units.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracyLabel, directionsUrl, mapsUrl, placeLabel, WORST_ACCURACY_M } from '../src/utils/maps.js';
import { setStartPage, startPage } from '../src/utils/startPage.js';
import { statusClass, statusTone, toneClass } from '../src/utils/statusStyles.js';
import { formatCompactCurrency, formatCurrency, formatDateTime, formatNumber, humanise, initialsOf, isoDay, plural } from '../src/utils/format.js';
import {
  buildEnquiryPayload, followUpState, furthestStage, inDays, itemForEdit, itemsForEdit, nextStagesFrom, numeric, text,
} from '../src/utils/pipeline.js';

/* ------------------------------ maps ------------------------------ */

test('maps links open a pin or a route, to six places', () => {
  const at = { lat: 11.1085, lng: 77.3411 };
  assert.equal(mapsUrl(at), 'https://www.google.com/maps/search/?api=1&query=11.108500,77.341100');
  assert.equal(directionsUrl(at), 'https://www.google.com/maps/dir/?api=1&destination=11.108500,77.341100');
});

test('a place reads as the nearest town, or its coordinates', () => {
  assert.equal(placeLabel({ lat: 11.1, lng: 77.3, place: { name: 'Tiruppur', state: 'Tamil Nadu' } }), 'near Tiruppur, Tamil Nadu');
  assert.equal(placeLabel({ place: { name: 'Avinashi' } }), 'near Avinashi');
  assert.equal(placeLabel({ lat: 11.123456, lng: 77.654321 }), '11.12346, 77.65432');
  assert.equal(placeLabel({}), '');
  assert.equal(placeLabel(), '');
});

test('accuracy is said in metres, then kilometres', () => {
  assert.equal(accuracyLabel(12.4), '±12 m');
  assert.equal(accuracyLabel(1400), '±1.4 km');
  assert.equal(accuracyLabel(null), '');
  assert.ok(WORST_ACCURACY_M >= 1000);
});

/* ------------------------------ start page ------------------------------ */

test('the start page is remembered, and anything odd falls back to home', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };
  assert.equal(startPage(), 'home');
  setStartPage('queries');
  assert.equal(startPage(), 'queries');
  setStartPage('somewhere-else');
  assert.equal(startPage(), 'home', 'an unknown page is stored as home');
  store.set('npt.startPage', 'admin-panel');
  assert.equal(startPage(), 'home', 'a tampered value is ignored');
});

test('blocked storage never breaks the app', () => {
  globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  assert.equal(startPage(), 'home');
  assert.doesNotThrow(() => setStartPage('today'));
  delete globalThis.window;
});

/* ------------------------------ status colours ------------------------------ */

test('a status takes its tone; an unknown one is neutral', () => {
  assert.equal(statusTone('in_production'), 'progress');
  assert.equal(statusTone('production_hold'), 'danger', 'a held job is red, not amber');
  assert.equal(statusTone('answered'), 'success');
  assert.equal(statusTone('sent'), 'info');
  assert.equal(statusTone('something_new'), 'neutral');
  assert.match(statusClass('production_hold'), /danger/);
  assert.equal(toneClass('nonsense'), toneClass('neutral'));
  assert.match(toneClass('accent'), /flame/);
});

/* ------------------------------ wording ------------------------------ */

test('money and counts in Indian style', () => {
  assert.equal(formatCurrency(125000), '₹1,25,000.00');
  assert.equal(formatCurrency('not a number'), '₹0.00');
  assert.equal(formatNumber(1234567), '12,34,567');
  assert.equal(formatCompactCurrency(25000000), '₹2.50Cr');
  assert.equal(formatCompactCurrency(1240000), '₹12.40L');
  assert.equal(formatCompactCurrency(4500), '₹4.5K');
  assert.equal(formatCompactCurrency(-150000), '₹-1.50L');
  assert.equal(formatCompactCurrency(999), '₹999.00');
});

test('a time of day reads in lower-case am / pm; nothing reads as a dash', () => {
  assert.match(formatDateTime(new Date(2026, 9, 12, 14, 19)), /12 Oct 2026.*2:19 pm$/);
  assert.equal(formatDateTime(null), '—');
});

test('a count agrees with its words', () => {
  assert.equal(plural(1, 'task needs you', 'tasks need you'), '1 task needs you');
  assert.equal(plural(3, 'task needs you', 'tasks need you'), '3 tasks need you');
  assert.equal(plural(2, 'order'), '2 orders');
  assert.equal(plural(1200, 'piece'), '1,200 pieces');
});

test('enum words and initials', () => {
  assert.equal(humanise('ready_to_dispatch'), 'Ready To Dispatch');
  assert.equal(humanise(undefined), '');
  assert.equal(initialsOf('Ramesh Plant Kumar'), 'RP');
  assert.equal(initialsOf('nandhini'), 'N');
  assert.equal(initialsOf(''), '?');
});

/* ------------------------------ enquiry form ------------------------------ */

test('the furthest stage an enquiry reached is its floor, until it is reopened', () => {
  const climbed = { status: 'hold', statusHistory: [{ from: 'new', to: 'pricing_required' }, { from: 'pricing_required', to: 'negotiation' }, { from: 'negotiation', to: 'hold' }] };
  const offered = nextStagesFrom(climbed).map((stage) => stage.value);
  assert.ok(!offered.includes('pricing_required'), 'a parked enquiry cannot drop below where it was');
  assert.ok(offered.includes('negotiation') && offered.includes('lost'));

  const reopened = { status: 'new', statusHistory: [{ from: 'new', to: 'negotiation' }, { from: 'negotiation', to: 'lost' }, { from: 'lost', to: 'new' }] };
  assert.ok(furthestStage(reopened) < furthestStage(climbed), 'reopening rewinds the floor');
  assert.ok(nextStagesFrom(reopened).some((stage) => stage.value === 'requirement_clarification'));
});

test('a closed enquiry offers every open stage to reopen at', () => {
  const offered = nextStagesFrom({ status: 'lost', statusHistory: [] }).map((stage) => stage.value);
  assert.ok(!offered.includes('won') && !offered.includes('lost'));
  assert.ok(offered.includes('new'));
  assert.ok(!nextStagesFrom('negotiation').some((stage) => stage.value === 'new'), 'a bare status floors at itself');
});

test('blank form values are left out, numbers become numbers', () => {
  assert.equal(numeric(''), undefined);
  assert.equal(numeric('12.5'), 12.5);
  assert.equal(numeric(0), 0);
  assert.equal(text(''), undefined);
  assert.equal(text(null), undefined);
  assert.equal(text('Call'), 'Call');
  const payload = buildEnquiryPayload({ targetPrice: '1.85', estimatedValue: '', remarks: '', nextAction: 'Send rates', source: 'indiamart' }, { items: [{ modelNumber: 'NH-400' }] });
  assert.deepEqual(payload, {
    items: [{ modelNumber: 'NH-400' }], targetPrice: 1.85, estimatedValue: undefined, requiredDeliveryDate: undefined,
    remarks: undefined, nextAction: 'Send rates', nextFollowUpDate: undefined, source: 'indiamart',
  });
});

test('a stored line opens in the editor with ids unwrapped and nothing undefined', () => {
  const line = itemForEdit({ mould: { _id: 'm1', name: 'NH-400' }, materialRef: { _id: 'pp' }, hookRef: 'h1', sizeMm: 0, quantity: 5000 });
  assert.equal(line.mould, 'm1');
  assert.equal(line.materialRef, 'pp');
  assert.equal(line.hookRef, 'h1');
  assert.equal(line.clipRef, '');
  assert.equal(line.sizeMm, 0, 'a zero is kept, not blanked');
  assert.equal(line.quantity, 5000);
  assert.ok(!('quantity' in itemForEdit({})), 'no quantity key when none was stored');
  assert.ok(Object.values(itemForEdit({})).every((value) => value !== undefined));
});

test('an enquiry from before the item list opens with its one model', () => {
  const rows = itemsForEdit({ items: [], mould: 'm9', isNewDevelopment: true }, { modelNumber: 'OLD-1' });
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].mould, rows[0].isNewDevelopment, rows[0].modelNumber], ['m9', true, 'OLD-1']);
  assert.equal(itemsForEdit({ items: [{ modelNumber: 'A' }, { modelNumber: 'B' }] }).length, 2);
});

test('follow-up dates say how overdue they are', () => {
  assert.equal(followUpState(null), null);
  assert.deepEqual(followUpState(inDays(0)), { text: 'Due today', tone: 'warn' });
  assert.deepEqual(followUpState(inDays(1)), { text: 'Due tomorrow', tone: 'info' });
  assert.deepEqual(followUpState(inDays(-1)), { text: 'Overdue by a day', tone: 'danger' });
  assert.deepEqual(followUpState(inDays(-4)), { text: 'Overdue by 4 days', tone: 'danger' });
  assert.deepEqual(followUpState(inDays(6)), { text: 'In 6 days', tone: 'neutral' });
  assert.equal(inDays(0), isoDay());
});
