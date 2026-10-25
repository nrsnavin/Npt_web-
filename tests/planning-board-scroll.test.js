/**
 * The planning board's timeline runs on to the last day any press is booked and scrolls across,
 * the press column held on the left, each press saying how far it is booked
 * [components/planning/TimelineView.jsx; server: planning.service `planningBoard`].
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAY_WIDTH_REM, PRESS_WIDTH_REM, boardColumns, boardWidth, monthMark } from '../src/utils/planningBoard.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a fixed width a day, so a long programme scrolls across rather than squeezing', () => {
  assert.equal(boardColumns(40), `${PRESS_WIDTH_REM}rem repeat(40, ${DAY_WIDTH_REM}rem)`);
  assert.equal(boardWidth(40), `${PRESS_WIDTH_REM + 40 * DAY_WIDTH_REM}rem`);
});

test('the month is marked where it opens, and on the first day shown', () => {
  assert.equal(monthMark('2026-11-01'), 'Nov');
  assert.equal(monthMark('2026-10-26'), '');
  assert.equal(monthMark('2026-10-26', true), 'Oct');
});

test('the press column stays put, each press says how far it is booked, nothing reads "outside these days"', () => {
  const view = read('components/planning/TimelineView.jsx');
  assert.match(view, /const pinned = 'sticky left-0 z-10 bg-ink-850';/);
  assert.match(view, /overflow-x-auto/);
  assert.match(view, /style=\{\{ width: boardWidth\(board\.days\.length\), minWidth: '100%' \}\}/);
  assert.match(view, /Booked till \{shortDay\(press\.bookedUntil\)\}/);
  assert.match(view, /scroll across →/);
  assert.doesNotMatch(view, /Outside these days/);
});

test('weightage: the in charge picks it on the job, and heavier jobs carry a tag on the board', async () => {
  const { WEIGHT_PRESETS, weightWords } = await import('../src/utils/planningBoard.js');
  assert.deepEqual(WEIGHT_PRESETS.map((preset) => preset.value), [3, 5, 7, 9, 10]);
  assert.deepEqual([10, 9, 7, 5, 3].map(weightWords), ['top', 'urgent', 'high', 'normal', 'low']);
  const picker = read('components/planning/Weightage.jsx');
  assert.match(picker, /onSave\(\{ weightage, \.\.\.\(note\.trim\(\) \? \{ note: note\.trim\(\) \} : \{\}\) \}/);
  assert.match(picker, /Use the order’s priority/);
  assert.match(picker, /if \(!job\?\.weight \|\| job\.weight <= 5\) return null;/, 'only above normal gets a tag');
  const board = read('pages/PlanningBoard.jsx');
  assert.match(board, /\{mayPlan && job\.status !== 'running' && <WeightagePicker job=\{job\} busy=\{busy\} onSave=\{send\} \/>\}/);
  for (const file of ['components/planning/JobCard.jsx', 'components/planning/PressCard.jsx', 'components/planning/TimelineView.jsx']) assert.match(read(file), /<WeightTag job=\{job\}/, file);
});
