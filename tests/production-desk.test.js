/**
 * The Production desk: the queue in EDD order, nothing else, and the hand-ons to Assembly,
 * Printing, Quality and Dispatch from each task [utils/productionQueue.js;
 * pages/DepartmentDashboard.jsx; server: config/departmentTaskForms.js ask_edd `actions`].
 *
 *   node --test tests/production-desk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { EDD_BANDS, PRODUCTION_FILTERS, byEdd, eddBandOf, eddBands } from '../src/utils/productionQueue.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
/* 17 Oct 2026, 10:00 in India. */
const now = new Date('2026-10-17T04:30:00.000Z');
const row = (id, edd, due) => ({ task: { _id: id, dueDate: due }, enquiry: edd ? { edd: { date: edd } } : {} });

test('the bands: late, today, this week, later, and no EDD last', () => {
  assert.equal(eddBandOf(row('a', '2026-10-16'), now), 'late');
  assert.equal(eddBandOf(row('b', '2026-10-17'), now), 'today');
  assert.equal(eddBandOf(row('c', '2026-10-24'), now), 'week', 'seven days out is still this week');
  assert.equal(eddBandOf(row('d', '2026-10-25'), now), 'later');
  assert.equal(eddBandOf(row('e', null), now), 'none');
  assert.deepEqual(EDD_BANDS.map((band) => band.key), ['late', 'today', 'week', 'later', 'none']);
});

test('the queue is in EDD order, soonest first and the undated last; the due time breaks ties', () => {
  const rows = [row('none', null), row('later', '2026-11-02'), row('today2', '2026-10-17', '2026-10-17T12:00:00Z'), row('late', '2026-10-10'), row('today1', '2026-10-17', '2026-10-17T06:00:00Z'), row('week', '2026-10-20')];
  assert.deepEqual(byEdd(rows, now).map((entry) => entry.task._id), ['late', 'today1', 'today2', 'week', 'later', 'none']);
  const bands = eddBands(rows, now);
  assert.deepEqual(bands.map((band) => [band.key, band.rows.length]), [['late', 1], ['today', 2], ['week', 1], ['later', 1], ['none', 1]]);
  assert.deepEqual(eddBands([row('x', '2026-10-17')], now).map((band) => band.key), ['today'], 'empty bands are left out');
  assert.deepEqual(PRODUCTION_FILTERS.map((entry) => entry.key), ['all', 'late', 'today', 'week', 'later', 'none', 'unclaimed', 'mine']);
});

test('the Production desk is the queue alone — no enquiries tab — banded by EDD, with its own tiles and filters', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /const isProduction = data\?\.figures\?\.department === 'production';/);
  assert.match(page, /const seesEnquiries = canRead\('enquiries'\) && !isProduction;/);
  assert.match(page, /\.\.\.\(isProduction \? \[\{ key: 'pqueue', label: 'Production queue', count: null \}\] : \[\]\)/);
  assert.match(page, /\? eddBands\(shown\)\.map\(/);
  assert.match(page, /const filters = isProduction \? PRODUCTION_FILTERS : FILTERS;/);
  assert.match(page, /<Tile label="No EDD yet" value=\{undated\}/);
  assert.match(page, /EDD_BANDS\.some\(\(band\) => band\.key === filter\) && eddBandOf\(row\) !== filter/);
});

test('a readiness ask holds the asking task; Production’s hand-ons do not', () => {
  assert.match(read('components/TaskWorkflow.jsx'), /\(action\.kind === task\.kind \|\| action\.was === task\.kind\) && action\.waits/);
});
