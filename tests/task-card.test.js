/**
 * A department task read at a glance [utils/taskState.js, components/TaskCard.jsx,
 * components/DepartmentDesk.jsx]: the colour a step carries by what it means, how far along its
 * ladder a task is, which band of the enquiry's list it sits in, the date beside it, and the
 * card folded to a status row until it is opened.
 *
 *   node --test tests/task-card.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bandOf, ladderOf, latestOf, stateOf, toneOfStep, whenOf } from '../src/utils/taskState.js';
import { formatRelative, initialsOf } from '../src/utils/format.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/* Production's ladder, as the plant wrote it: problem steps beside it, Task Closed at the end. */
const STATUSES = [
  { key: 'received', label: 'EDD Request Received' },
  { key: 'accepted', label: 'EDD Accepted' },
  { key: 'started', label: 'Production Started' },
  { key: 'part1_ready', label: 'Part 1 Ready' },
  { key: 'mould_issue', label: 'Mould Issue', issue: true },
  { key: 'raw_material', label: 'Raw Material Not Available', issue: true },
  { key: 'completed', label: 'Production Completed' },
  { key: 'closed', label: 'Task Closed', done: true },
];
const button = { key: 'ask_edd', label: 'Ask EDD', department: 'production', form: { statuses: STATUSES } };

test('a step’s colour says what it means: waiting, progress, blocked, done', () => {
  assert.equal(toneOfStep(STATUSES[0], 0), 'waiting', 'the first step is waiting to be picked up');
  assert.equal(toneOfStep(STATUSES[2], 2), 'progress');
  assert.equal(toneOfStep(STATUSES[4], 4), 'blocked', 'a problem step is red');
  assert.equal(toneOfStep(STATUSES[7], 7), 'done');
  assert.equal(toneOfStep({ key: 'asked', label: 'Asked Assembling Readiness' }, 3), 'waiting', 'waiting on another desk');
});

test('the ladder leaves the problem steps beside it, remembers how far the task got, and names the next rung', () => {
  const moving = ladderOf(button, { status: 'started', updates: [{ kind: 'status', status: 'accepted' }, { kind: 'status', status: 'started' }] });
  assert.deepEqual([moving.total, moving.reached, moving.next.key, moving.blocked], [6, 2, 'part1_ready', false]);
  const stuck = ladderOf(button, { status: 'raw_material', updates: [{ kind: 'status', status: 'started' }, { kind: 'status', status: 'raw_material' }] });
  assert.deepEqual([stuck.reached, stuck.blocked, stuck.next.key], [2, true, 'part1_ready'], 'stuck after Started: the bars stay where it got to');
  const finished = ladderOf(button, { status: 'closed', completed: true, updates: [] });
  assert.deepEqual([finished.finished, finished.next], [true, null]);
  assert.equal(ladderOf({ form: {} }, {}), null, 'no ladder without a workflow');
});

test('a task’s state is its step, or how it ended', () => {
  assert.deepEqual(stateOf({ status: 'mould_issue' }, button), { label: 'Mould Issue', tone: 'blocked', step: STATUSES[4] });
  assert.deepEqual(stateOf({ completed: true, outcome: { result: 'returned' } }, button), { label: 'Sent back', tone: 'blocked' });
  assert.equal(stateOf({ completed: true, status: 'closed' }, button).label, 'Task Closed');
  assert.deepEqual(stateOf({ user: { name: 'Meera' } }, { form: {} }), { label: 'With Meera', tone: 'progress' });
  assert.deepEqual(stateOf({}, { form: {} }), { label: 'Not picked up yet', tone: 'waiting' });
});

test('the bands: yours or your department’s to work, with somebody else, done', () => {
  const worksIn = (department) => department === 'production';
  assert.equal(bandOf({ department: 'production' }, button, { me: 'u1', worksIn }), 'needs_you');
  assert.equal(bandOf({ department: 'sampling', user: { _id: 'u1' } }, { department: 'sampling' }, { me: 'u1', worksIn }), 'needs_you', 'with me by name');
  assert.equal(bandOf({ department: 'owner' }, { department: 'owner' }, { me: 'u1', worksIn, owner: 'u1' }), 'needs_you', 'the marketing person’s own question');
  assert.equal(bandOf({ department: 'sampling' }, { department: 'sampling' }, { me: 'u1', worksIn }), 'in_progress');
  assert.equal(bandOf({ department: 'production', completed: true }, button, { me: 'u1', worksIn }), 'done');
});

test('the date beside the card: the ready date the department gave, else due (late when past), else done', () => {
  const now = new Date('2026-10-13T06:00:00Z');
  assert.deepEqual(whenOf({ updates: [{ kind: 'status', status: 'started', date: '2026-10-16', dateLabel: 'ERD / Ready date' }], dueDate: '2026-10-12T18:29:59Z' }, { now }), { label: 'Ready date', date: '2026-10-16', late: false });
  assert.deepEqual(whenOf({ dueDate: '2026-10-12T18:29:59Z' }, { now }), { label: 'Due', date: '2026-10-12T18:29:59Z', late: true });
  assert.deepEqual(whenOf({ completed: true, completedAt: '2026-10-13T05:00:00Z', dueDate: '2026-10-12T18:29:59Z' }, { now }), { label: 'Done', date: '2026-10-13T05:00:00Z', late: false });
  assert.equal(whenOf({}, { now }), null);
});

test('the collapsed card shows the newest thing somebody wrote, not that it was raised', () => {
  const raised = { kind: 'raised', at: '2026-10-13T01:00:00Z', text: 'Buyer wants 10,000' };
  const moved = { kind: 'status', at: '2026-10-13T02:00:00Z', text: 'On M3' };
  assert.equal(latestOf([raised, moved]), moved);
  assert.equal(latestOf([raised]), raised);
  assert.equal(latestOf([]), null);
});

test('how long ago, as a person says it; the exact time stays on hover', () => {
  const now = new Date('2026-10-13T10:00:00+05:30').getTime();
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString();
  assert.equal(formatRelative(ago(0.5), now), 'just now');
  assert.equal(formatRelative(ago(25), now), '25 min ago');
  assert.equal(formatRelative(ago(3 * 60), now), '3 h ago');
  assert.equal(formatRelative(ago(26 * 60), now), 'yesterday');
  assert.equal(formatRelative(ago(3 * 24 * 60), now), '3 days ago');
  assert.match(formatRelative(ago(20 * 24 * 60), now), /Sept? 2026$/);
  assert.equal(initialsOf('Ramesh Plant'), 'RP');
  assert.equal(initialsOf('Nandhini'), 'N');
  assert.equal(initialsOf(''), '?');
});

test('the card is a status row that opens; the stepper, the one big next step, and ⋯ for the rest', () => {
  const card = read('components/TaskCard.jsx');
  assert.match(card, /aria-expanded=\{open\}/);
  assert.match(card, /<TaskStepper button=\{button\} task=\{task\}/);
  assert.match(card, /CHIP\[state\.tone\]/, 'the status chip coloured by meaning');
  assert.match(card, /formatRelative\(latest\.at\)/, 'the latest update on the closed card');
  assert.match(card, /when\.late \? 'Late' : when\.label/, 'the date tile');
  assert.match(card, /<HandoffTaskActions todo=\{task\} onChanged=\{onChanged\} layout="menu" primary=\{hasWorkflow \? undefined : 'done'\} \/>/);
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const next = ladderOf\(button, todo\)\?\.next;/);
  assert.match(workflow, /\{next\.label\} →/, 'the next rung is the primary button');
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /srLabel="More actions"/);
  const stepper = read('components/TaskStepper.jsx');
  assert.match(stepper, /Step \$\{Math\.max\(reached \+ 1, 1\)\} of \$\{total\}/);
});

test('the enquiry’s departments: three bands, done folded, one menu to raise a task, and a timeline across every task', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /\{ key: 'needs_you', label: 'Needs you', open: true \}/);
  assert.match(desk, /\{ key: 'in_progress', label: 'In progress', open: false \}/);
  assert.match(desk, /\{ key: 'done', label: 'Done', open: false \}/);
  assert.match(desk, /const folded = band\.key === 'done' && openCount > 0 && !showDone;/);
  assert.match(desk, /<Menu label="\+ Raise a task" items=\{raise\}/);
  assert.doesNotMatch(desk, /drawn\.map\(\(button\) => \(\s*<button/, 'no more row of eighteen buttons');
  assert.match(desk, /option\('timeline', 'Timeline'\)/);
  assert.match(desk, /<TaskTimeline entries=\{shownFeed\} \/>/);
  assert.match(desk, /work\.filter\(\(task\) => bandOf\(task, buttonOf\(task\), \{ me, worksIn, owner \}\) === band\.key\)/);
  const history = read('components/TaskHistory.jsx');
  assert.match(history, /dayHeading\(entry\.at\)/, 'a divider per day');
  assert.match(history, /initialsOf\(nameOf\(entry\)\)/, 'a marker per person');
  assert.match(history, /sameAuthor \? 'invisible'/, 'the same person again is not named again');
});

test('Admin can close any department task with a reason — closed, never deleted', () => {
  const actions = readFileSync(new URL('../src/components/HandoffTaskActions.jsx', import.meta.url), 'utf8');
  const endpoints = readFileSync(new URL('../src/api/endpoints.js', import.meta.url), 'utf8');
  assert.match(endpoints, /adminClose: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/admin-close`/);
  assert.match(actions, /const \{ isAdmin, departments = \[\] \} = useAuth\(\)/);
  assert.match(actions, /isAdmin \? \[\{ key: 'admin', label: 'Close task \(Admin\)'/, 'in the card’s ⋯ menu, for Admin only');
  assert.match(actions, /\{isAdmin && <button type="button" className="row-action" onClick=\{\(\) => setMode\('admin'\)\}>Close task<\/button>\}/);
  assert.match(actions, /if \(mode === 'admin'\) updated = await workspace\.todos\.adminClose\(\{ id: todo\._id, reason: note \}\)/);
  assert.match(actions, /admin: 'Why it is being closed'/);
  const state = readFileSync(new URL('../src/utils/taskState.js', import.meta.url), 'utf8');
  assert.match(state, /closed_by_admin'\) return \{ label: 'Closed by Admin'/);
});
