/**
 * Production decides printing and assembly per model before any date; a team that hands on gives
 * a hand-over date and the last team gives the EDD [server: tests/production-routing.test.js].
 *
 *   node --test tests/production-routing.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dateLabelFor, handsOnOf, incomingOf, needsRouting, pathOf, teamWords } from '../src/utils/edd.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('an open Production task on an enquiry needs routing until Production decides', () => {
  assert.equal(needsRouting({ kind: 'ask_edd', enquiry: 'e1' }), true);
  assert.equal(needsRouting({ kind: 'ask_edd', enquiry: 'e1', routing: { decidedAt: '2026-10-18' } }), false);
  assert.equal(needsRouting({ kind: 'ask_edd', enquiry: 'e1', completed: true }), false);
  assert.equal(needsRouting({ kind: 'ask_edd' }), true, 'a Production task raised from the customer is routed the same way');
  assert.equal(needsRouting({ kind: 'ask_printing', enquiry: 'e1' }), false);
});

test('a team that hands on gives a hand-over date; the last team gives the EDD', () => {
  assert.deepEqual(handsOnOf({ routing: { handsTo: ['printing', 'assembling'] } }), ['printing', 'assembling']);
  assert.equal(teamWords(['printing', 'assembling']), 'Printing and Assembly');
  assert.equal(dateLabelFor({ routing: { handsTo: ['assembling'] } }, 'Ready date'), 'Hand-over date to Assembly');
  assert.equal(dateLabelFor({ routing: { handsTo: [] } }, 'ERD / Ready date'), 'ERD / Ready date');
  assert.deepEqual(incomingOf({ routing: { incoming: { production: '2026-11-02', printing: '2026-11-05' } } }).map((row) => row.label), ['Production', 'Printing']);
});

test('each model’s path reads Production → Printing → Assembly', () => {
  assert.equal(pathOf({ printing: true, assembly: true }), 'Production → Printing → Assembly');
  assert.equal(pathOf({ assembly: true }), 'Production → Assembly');
  assert.equal(pathOf({}), 'Production');
});

test('the task shows the routing first and the move form gives no date until it is decided', () => {
  const edd = read('components/TaskEdd.jsx');
  assert.match(edd, /<TaskRouting todo=\{todo\}/);
  assert.match(edd, /<HandOverDate todo=\{todo\}/);
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const unrouted = needsRouting\(todo\)/);
  assert.match(workflow, /dateLabelFor\(todo, form\.statusDate\?\.label \|\| 'Ready date'\)/);
  const routing = read('components/TaskRouting.jsx');
  assert.match(routing, /workspace\.todos\.route\(/);
  assert.match(routing, /aria-label=\{`Printing for \$\{row\.model\}`\}/);
});
