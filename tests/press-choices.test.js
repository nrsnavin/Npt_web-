/**
 * The scored press choice on the web [components/PressChoices.jsx, pages/PlanningBoard.jsx,
 * utils/planningBoard.js `indexChoices`]: the board ranks presses while a job is dragged, and a
 * job opened from the board shows its best three presses with reasons.
 *
 *   node --test tests/press-choices.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexChoices, rankWords } from '../src/utils/planningBoard.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a ranking indexes by press: the choice, why a press cannot, and the best', () => {
  const index = indexChoices({
    sized: true,
    choices: [{ machine: { _id: 'p2', code: 'IM-2' }, rank: 1, score: 4 }, { machine: { _id: 'p1', code: 'IM-1' }, rank: 2, score: 30 }],
    cannot: [{ machine: { _id: 'p3', code: 'IM-3' }, why: 'needs a 120 T press' }],
  });
  assert.equal(index.byPress.p1.rank, 2);
  assert.equal(index.cannot.p3, 'needs a 120 T press');
  assert.equal(index.best.machine.code, 'IM-2');
  assert.equal(indexChoices({ sized: false, why: 'no cycle time', choices: [], cannot: [] }).why, 'no cycle time');
  assert.deepEqual([1, 2, 3, 4].map(rankWords), ['Best', '2nd', '3rd', '4th']);
});

test('moving a job asks for its ranking and tags each machine; a machine that cannot take it refuses at once', () => {
  const board = read('pages/PlanningBoard.jsx');
  assert.match(board, /productionApi\.choices\(job\._id\)/);
  assert.match(board, /choice=\{ranked\?\.byPress\?\.\[String\(press\.machine\._id\)\]\}/);
  assert.match(board, /cannot=\{ranked\?\.cannot\?\.\[String\(press\.machine\._id\)\]\}/);
  assert.match(board, /if \(why\) \{\s*warn\(`\$\{job\.number\} not moved`, why\);\s*return;/);
  assert.match(board, /<PressChoices result=\{ranked\} currentPressId=\{press\?\._id\}/, 'the job dialog shows the best machines');
  assert.match(board, /onDragEnd=\{endDrag\}/);
  assert.match(read('components/planning/TimelineView.jsx'), /<PressRankTag pressId=\{String\(press\.machine\._id\)\} ranked=\{ranked\} \/>/);
  const card = read('components/planning/JobCard.jsx');
  assert.match(card, /Best: <span className="font-bold text-steel-50">\{best\.machine\.code\}/, 'a waiting job names its best machine');
});

test('each choice says its done-by day and the reasons for and against, with one button to place it', () => {
  const card = read('components/PressChoices.jsx');
  assert.match(card, /Put it on \{choice\.machine\.code\}/);
  assert.match(card, /reason\.good \? '✓ ' : '✗ '/);
  assert.match(card, /Show every press/);
  assert.match(card, /Cannot take it/);
});

test('the machine and mould forms take what decides the fit', () => {
  const machine = read('pages/Machines.jsx');
  for (const key of ['tieBarWidthMm', 'tieBarHeightMm', 'minMouldHeightMm', 'maxMouldHeightMm', 'hotRunnerZones', 'hasDryer']) assert.ok(machine.includes(key), key);
  const mould = read('components/MouldForm.jsx');
  for (const key of ['widthMm', 'heightMm', 'thicknessMm', 'needsDryer', 'changeoverMinutes', 'preferredMachines']) assert.ok(mould.includes(key), key);
  assert.match(mould, /<MachinePicks label="Presses it usually runs on"/);
  assert.match(read('components/PlantCalendarCard.jsx'), /mouldChangeHours: Number\(change\)/);
});
