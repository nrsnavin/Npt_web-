/**
 * Work orders and the planning board on the web [pages/WorkOrders.jsx, pages/PlanningBoard.jsx].
 *
 *   node --test tests/planning-board.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barSpan, loadShare } from '../src/utils/planningBoard.js';
import { byPress, lateness, movesFor } from '../src/utils/workOrders.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].map((day) => ({ day }));

test('a bar covers its planned days, clipped to the days shown', () => {
  /* Stored as midnight India time, which is the evening before in UTC. */
  assert.deepEqual(barSpan({ plannedStart: '2026-10-19T18:30:00Z', plannedEnd: '2026-10-20T18:30:00Z' }, days), { from: 1, to: 2, clippedLeft: false, clippedRight: false });
  assert.deepEqual(barSpan({ plannedStart: '2026-10-15T00:00:00Z', plannedEnd: '2026-10-30T00:00:00Z' }, days), { from: 0, to: 3, clippedLeft: true, clippedRight: true });
  assert.equal(barSpan({ plannedStart: '2026-11-15T00:00:00Z', plannedEnd: '2026-11-16T00:00:00Z' }, days), null);
  assert.equal(barSpan({}, days), null);
  assert.equal(loadShare(44, 22), 200);
});

test('work orders group by press, unplanned first, each queue in sequence', () => {
  const groups = byPress([
    { _id: 'a', machine: { _id: 'm2', code: 'IM-2' }, sequence: 2 },
    { _id: 'b' },
    { _id: 'c', machine: { _id: 'm2', code: 'IM-2' }, sequence: 1 },
    { _id: 'd', machine: { _id: 'm1', code: 'IM-1' }, sequence: 1 },
  ]);
  assert.deepEqual(groups.map((group) => group.label), ['Not on a press yet', 'IM-1', 'IM-2']);
  assert.deepEqual(groups[2].rows.map((wo) => wo._id), ['c', 'a']);
});

test('moves offered from the status; lateness against the due date and the plan', () => {
  const moves = { release: { from: ['planned'], label: 'Release' }, cancel: { from: ['planned', 'paused'], label: 'Cancel' } };
  assert.deepEqual(movesFor(moves, 'planned').map((move) => move.key), ['release', 'cancel']);
  assert.deepEqual(movesFor(moves, 'running'), []);
  assert.equal(lateness({ status: 'released', dueDate: '2026-10-01' }, new Date('2026-10-18')).label, 'Past due');
  assert.equal(lateness({ status: 'released', dueDate: '2026-10-25', plannedEnd: '2026-10-28' }, new Date('2026-10-18')).label, 'Plan ends after due');
  assert.equal(lateness({ status: 'completed', dueDate: '2026-10-01' }), null);
});

test('the board drags onto a press, steps a job, sorts light to dark; runs start from a work order', () => {
  const board = read('pages/PlanningBoard.jsx');
  assert.match(read('components/planning/TimelineView.jsx'), /onDrop=\{\(\) => dropOn\(press\.machine\._id\)\}/);
  assert.match(read('components/planning/PressCard.jsx'), /onDrop=\{\(event\) => \{ event\.preventDefault\(\); setOver\(false\); onPlace\(press\.machine\); \}\}/);
  assert.match(board, /send\(\{ step: -1 \}/);
  assert.match(board, /productionApi\.sequenceByColour\(/);
  assert.match(read('pages/MouldRuns.jsx'), /workOrder: params\.get\('workOrder'\)/);
  const app = read('App.jsx');
  assert.match(app, /path="production\/plan"/);
  assert.match(app, /path="work-orders"/);
});

test('material needs and the hook and clip store', () => {
  const needs = read('pages/MaterialNeeds.jsx');
  assert.match(needs, /productionApi\.shortages\(\)/);
  assert.match(needs, /Work orders that will run short/);
  const store = read('components/PartStore.jsx');
  assert.match(store, /componentsApi\.moveStock\(\{ id: part\._id, kind: moving/);
  assert.match(read('pages/PartDetail.jsx'), /kind !== 'print' && <PartStore/);
  assert.match(read('components/PartForm.jsx'), /reorderQty: number\(values\.reorderQty\), perHanger: number\(values\.perHanger\)/);
  assert.match(read('pages/PlanningBoard.jsx'), /Will run short:/);
});

test('the floor tablet, the andon, the job card and the shift handover', () => {
  const floor = read('pages/Floor.jsx');
  assert.match(floor, /machinesApi\.andon\(\{ id: machine\._id, reason/);
  assert.match(floor, /machinesApi\.clearAndon\(/);
  assert.match(floor, /params\.get\('wo'\)/, 'a job card QR opens its job');
  assert.match(floor, /setInterval\(load, 30000\)/);
  assert.match(read('pages/WorkOrders.jsx'), /workOrdersApi\.jobCard\(wo\._id\)/);
  assert.match(read('pages/ShiftHandover.jsx'), /productionApi\.shiftSummary\(/);
  const app = read('App.jsx');
  assert.match(app, /path="floor"/);
  assert.match(app, /path="production\/shift"/);
});
