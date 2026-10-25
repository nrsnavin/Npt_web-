/**
 * The planning board made simple [pages/PlanningBoard.jsx, components/planning/*,
 * utils/planningBoard.js]: waiting jobs on the left, machine cards by bay on the right, and a job
 * placed by one tap on its best machine, by picking a machine, or by dragging.
 *
 *   node --test tests/planning-wall.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardStats, byBay, pressSummary, sortWaiting, swatchOf } from '../src/utils/planningBoard.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const today = '2026-10-25';
const press = (code, extra = {}, queue = []) => ({ machine: { _id: code, code, status: 'idle', ...extra }, queue });

test('a colour name finds its swatch; the specific name wins; an unknown one has none', () => {
  assert.equal(swatchOf('Navy Blue'), '#1e3a8a');
  assert.equal(swatchOf('Wine red'), '#722f37');
  assert.equal(swatchOf('Natural'), 'clear');
  assert.equal(swatchOf('Mango'), null);
  assert.equal(swatchOf(''), null);
});

test('a machine card: the running job and how far along, what is next, when it is free, its state', () => {
  const busy = pressSummary(press('IM-1', { status: 'running' }, [
    { _id: 'a', status: 'running', quantity: 18000, goodQty: 7200, plannedEnd: '2026-10-26' },
    { _id: 'b', status: 'planned', plannedEnd: '2026-10-29', late: true },
  ]), today);
  assert.equal(busy.state, 'running');
  assert.equal(busy.progress, 40);
  assert.equal(busy.upcoming.length, 1);
  assert.equal(busy.freeFrom, '2026-10-29');
  assert.equal(busy.late, true);
  assert.equal(pressSummary(press('IM-2'), today).state, 'free');
  assert.equal(pressSummary(press('IM-3', {}, [{ _id: 'c', status: 'planned', plannedEnd: '2026-10-28' }]), today).state, 'booked');
  assert.equal(pressSummary(press('IM-4', { status: 'breakdown' }), today).state, 'down');
  assert.equal(pressSummary(press('IM-5', { status: 'maintenance' }), today).state, 'service');
});

test('the figures across the top count running, free, stopped, waiting and late', () => {
  const stats = boardStats({
    presses: [
      press('IM-1', {}, [{ _id: 'a', status: 'running', quantity: 10, goodQty: 1, late: true }]),
      press('IM-2'),
      press('IM-3', { status: 'breakdown' }),
    ],
    unplanned: [{ _id: 'x', late: true }, { _id: 'y' }],
  }, today);
  assert.deepEqual(stats, { presses: 3, running: 1, free: 1, down: 1, waiting: 2, late: 2 });
});

test('machines group by bay, bays in number order, no bay last', () => {
  const groups = byBay([press('A', { location: 'Bay 10' }), press('B'), press('C', { location: 'Bay 2' }), press('D', { location: 'Bay 2' })]);
  assert.deepEqual(groups.map((group) => [group.bay, group.presses.length]), [['Bay 2', 2], ['Bay 10', 1], ['', 1]]);
});

test('waiting jobs: search any word, late first, by due day, biggest, late only', () => {
  const jobs = [
    { _id: '1', number: 'WO-1', mould: { mouldCode: 'M-101' }, colour: 'White', dueDate: '2026-11-03', toMake: 100 },
    { _id: '2', number: 'WO-2', mould: { mouldCode: 'M-102' }, colour: 'Black', dueDate: '2026-11-10', toMake: 900, late: true, customer: 'Vogue Retail' },
    { _id: '3', number: 'WO-3', mould: { mouldCode: 'M-141' }, colour: 'Grey', dueDate: '2026-10-30', toMake: 500 },
  ];
  assert.deepEqual(sortWaiting(jobs).map((job) => job._id), ['2', '3', '1']);
  assert.deepEqual(sortWaiting(jobs, { order: 'due' }).map((job) => job._id), ['3', '1', '2']);
  assert.deepEqual(sortWaiting(jobs, { order: 'big' }).map((job) => job._id), ['2', '3', '1']);
  assert.deepEqual(sortWaiting(jobs, { search: 'vogue' }).map((job) => job._id), ['2']);
  assert.deepEqual(sortWaiting(jobs, { search: 'm-14' }).map((job) => job._id), ['3']);
  assert.deepEqual(sortWaiting(jobs, { lateOnly: true }).map((job) => job._id), ['2']);
});

test('the board: waiting jobs and machine cards, three ways to place a job, Undo, and the timeline', () => {
  const board = read('pages/PlanningBoard.jsx');
  assert.match(board, /<JobCard/);
  assert.match(board, /<PressCard/);
  assert.match(board, /byBay\(shown\)/);
  assert.match(board, /undoable\(`\$\{job\.number\} is on \$\{machine\.code\}`/, 'placing says where, with Undo');
  assert.match(board, /machine: from \}\)/, 'Undo puts it back where it was');
  assert.match(board, /if \(event\.key === 'Escape'\) stopMoving\(\)/);
  assert.match(board, /\['machines', 'Machines'\], \['timeline', 'Timeline'\]/);
  assert.match(board, /<TimelineView/);
  assert.match(board, /Every job is on a machine/);
  const card = read('components/planning/JobCard.jsx');
  assert.match(card, /Put on \{best\.machine\.code\}/);
  assert.match(card, /\{picked \? 'Cancel' : 'Choose machine'\}/);
  assert.match(card, /No machine can take it — \{best\.why\}/);
  const machine = read('components/planning/PressCard.jsx');
  assert.match(machine, /role=\{target \? 'button' : undefined\}/, 'a machine is the target while a job moves');
  assert.match(machine, /Drop to put \{moving\.number\} here/);
  assert.match(machine, /role="progressbar"/);
  assert.match(machine, /Can’t take it — \{cannot\}/);
  assert.match(machine, /Free — ready for a job/);
});
