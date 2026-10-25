/**
 * Production floor planning [server: floorPlanning.service; Admin's switch on Profile] — off, the
 * Production task runs as before; on, its models are put on presses from the task, the board says
 * which enquiry each job is for, and the floor tablet checks the mould change before the run.
 *
 *   node --test tests/floor-planning.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('only an Admin sees the switch, and it is saved on the plant settings', () => {
  const card = read('components/FloorPlanningCard.jsx');
  assert.match(card, /if \(!isAdmin \|\| on === null\) return null;/);
  assert.match(card, /settings\.setFloorPlanning\(!on\)/);
  assert.match(card, /rememberPlant\(plant\)/);
  assert.match(card, /role="switch"/);
  assert.match(read('pages/Profile.jsx'), /<FloorPlanningCard \/>/);
  assert.match(read('api/endpoints.js'), /setFloorPlanning: \(on\) => api\.put\('\/settings\/floor-planning', \{ on \}\)/);
});

test('the Production task shows each routed model’s press, and draws nothing when it is off', () => {
  const plan = read('components/TaskPressPlan.jsx');
  assert.match(plan, /if \(!plan\?\.on \|\| !plan\.models\?\.length\) return null;/);
  assert.match(plan, /productionApi\.placeTaskModel\(\{ taskId: todo\._id, model: row\.model, machine: machine\._id \}\)/);
  assert.match(plan, /Put on \{row\.best\.machine\.code\}/);
  assert.match(plan, /Other press/);
  assert.match(plan, /productionApi\.choices\(choosing\.workOrder\._id\)/);
  assert.match(plan, /<PressChoices /);
  /* Only the in charge sees the buttons that plan; the rest read who plans it. */
  assert.match(plan, /\{mayPlan && state\.key === 'waiting' && row\.best\?\.machine && \(/);
  assert.match(plan, /\{mayPlan && onPress && \(/);
  assert.match(plan, /Planned by the Production in charge\./);
  assert.match(read('components/TaskEdd.jsx'), /\{routed && <TaskPressPlan todo=\{todo\} mayPlan=\{plans\} onChanged=\{onChanged\} \/>\}/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /taskPlan: \(taskId\) => api\.get\(`\/production\/task-plan\/\$\{taskId\}`\)/);
  assert.match(endpoints, /placeTaskModel: \(\{ taskId, model, machine \}\) => api\.post\(`\/production\/task-plan\/\$\{taskId\}\/place`, \{ model, machine \}/);
});

test('the board says which enquiry a job is for and where it goes, and says so when floor planning is off', () => {
  const card = read('components/planning/JobCard.jsx');
  assert.match(card, /job\.forTask && \(/);
  assert.match(card, /\{job\.forTask\.route\}/);
  assert.match(card, /job\.forTask \? 'Moulding due' : 'Due'/);
  assert.match(read('components/planning/PressCard.jsx'), /running\.forTask &&/);
  const board = read('pages/PlanningBoard.jsx');
  assert.match(board, /loadPlant\(\)\.then\(\(plant\) => setFloorPlanning\(Boolean\(plant\?\.floorPlanning\)\)\)/);
  assert.match(board, /Production floor planning is off/);
});

test('a model’s place on the presses, and what of it needs the in charge', async () => {
  const { modelPress, pressAttention, lateWords, afterMoulding, setupDone } = await import('../src/utils/floorPlanning.js');
  const waiting = { model: 'A', workOrder: { status: 'planned' }, best: { machine: { code: 'IM-08' } } };
  const noPress = { model: 'B', workOrder: { status: 'planned' }, best: { machine: null, why: 'too big' } };
  const noMould = { model: 'C', workOrder: { status: 'planned', mouldMissing: true } };
  const planned = { model: 'D', workOrder: { status: 'released', machine: { code: 'IM-02' } } };
  const late = { model: 'E', workOrder: { status: 'planned', machine: { code: 'IM-03' }, late: true, plannedEnd: '2026-11-12T00:00:00+05:30', dueDay: '2026-11-09' } };
  const running = { model: 'F', workOrder: { status: 'running', machine: { code: 'IM-04' } } };
  const made = { model: 'G', workOrder: { status: 'completed', machine: { code: 'IM-04' } } };
  assert.deepEqual([waiting, noPress, noMould, planned, late, running, made].map((row) => [modelPress(row).key, modelPress(row).tone]), [
    ['waiting', 'warn'], ['blocked', 'danger'], ['blocked', 'danger'], ['planned', 'neutral'], ['late', 'danger'], ['running', 'success'], ['made', 'success'],
  ]);
  assert.equal(modelPress({ model: 'H' }), null, 'no work order: nothing drawn');
  assert.deepEqual(pressAttention([waiting, noPress, noMould, planned, late, running, made]), { waiting: 1, blocked: 2, late: 1, proposed: 0, planned: 4, traded: 0, total: 7 });
  assert.match(lateWords(late.workOrder), /^Ends 12 Nov — after moulding is due 9 Nov$/);
  assert.equal(lateWords(planned.workOrder), null);
  assert.equal(afterMoulding({ printing: true, assembly: true }), 'Printing → Assembly');
  assert.equal(afterMoulding({}), 'Straight to dispatch');
  assert.equal(setupDone({ setup: { mouldOff: { at: 'x' }, heated: { at: 'y' }, firstPiece: {} } }), 2);
});

test('the board tells the in charge what needs them, and filters to it', async () => {
  const { boardAttention } = await import('../src/utils/floorPlanning.js');
  const { sortWaiting } = await import('../src/utils/planningBoard.js');
  const board = {
    unplanned: [
      { _id: 1, forTask: { route: 'Moulding' }, best: { machine: { code: 'IM-1' } } },
      { _id: 2, late: true, best: { machine: { code: 'IM-1' } } },
      { _id: 3, best: { machine: null, why: 'too big' } },
    ],
    presses: [
      { queue: [{ _id: 4, status: 'released', forTask: { firstPiece: false } }] },
      { queue: [{ _id: 5, status: 'running', forTask: { firstPiece: true } }, { _id: 6, status: 'planned', forTask: { firstPiece: false }, late: true }] },
      { queue: [{ _id: 7, status: 'planned', forTask: { firstPiece: true } }] },
    ],
  };
  assert.deepEqual(boardAttention(board), { tasksWaiting: 1, proposals: 0, late: 2, blocked: 1, firstPiece: 1 });
  assert.deepEqual(sortWaiting(board.unplanned, { only: 'tasks' }).map((job) => job._id), [1]);
  assert.deepEqual(sortWaiting(board.unplanned, { only: 'blocked' }).map((job) => job._id), [3]);
  const page = read('pages/PlanningBoard.jsx');
  assert.match(page, /\{mayPlan && needsAny \? \(/, 'only the in charge sees what needs them');
  assert.match(page, /aria-label="Needs you"/);
  assert.match(page, /The Production in charge plans the presses\./);
  assert.match(read('components/planning/PressCard.jsx'), /index === 0 && !running && job\.forTask && !job\.forTask\.firstPiece/);
});

test('the floor tablet ticks the mould change, and a run before the first piece says why', () => {
  const floor = read('pages/Floor.jsx');
  assert.match(floor, /const SETUP_STEPS = \[\['mouldOff', 'Mould off'\], \['mouldOn', 'Mould on'\], \['heated', 'Heated'\], \['firstPiece', 'First piece OK'\]\];/);
  assert.match(floor, /onClick=\{\(\) => setupTap\(job, key, done\)\}/);
  assert.match(read('api/endpoints.js'), /setupStep: \(\{ id, step, undo \}\) => api\.post\(`\/work-orders\/\$\{id\}\/setup`/);
  const runs = read('pages/MouldRuns.jsx');
  assert.match(runs, /const setupOpen = Boolean\(workOrder\?\.task && !workOrder\?\.setup\?\.firstPiece\?\.at && !workOrder\?\.firstRunAt\);/);
  assert.match(runs, /setupSkipReason: skipReason\.trim\(\)/);
});

test('the auto-planner’s proposals: shown on the task and the board, confirmed only by the in charge', async () => {
  const { modelPress, pressAttention, proposalWords, boardAttention } = await import('../src/utils/floorPlanning.js');
  const { sortWaiting } = await import('../src/utils/planningBoard.js');
  const proposed = { model: 'A', workOrder: { status: 'planned', dueDay: '2026-11-09', proposal: { machine: { code: 'IM-05' }, start: '2026-10-26', end: '2026-10-28', learned: ['You chose IM-05 for A before'] } } };
  const lateProposal = { model: 'B', workOrder: { status: 'planned', proposal: { machine: { code: 'IM-02' }, start: '2026-11-10', end: '2026-11-12', late: true, lateDays: 3 } } };
  assert.deepEqual([modelPress(proposed), modelPress(lateProposal)].map((state) => [state.key, state.tone, state.words]), [
    ['proposed', 'info', 'Proposed IM-05'], ['proposed', 'danger', 'Proposed IM-02'],
  ]);
  assert.deepEqual(pressAttention([proposed, lateProposal]), { waiting: 0, blocked: 0, late: 1, proposed: 2, planned: 0, traded: 0, total: 2 });
  assert.equal(proposalWords(proposed.workOrder.proposal, '2026-11-09'), '26 Oct – 28 Oct · in time for 9 Nov');
  assert.equal(proposalWords(lateProposal.workOrder.proposal), '10 Nov – 12 Nov · 3 days after moulding due');
  const board = { unplanned: [{ _id: 1, forTask: {}, proposal: { machine: { code: 'IM-05' } } }, { _id: 2, forTask: {} }], presses: [] };
  assert.deepEqual([boardAttention(board).proposals, boardAttention(board).tasksWaiting], [1, 1]);
  assert.deepEqual(sortWaiting(board.unplanned, { only: 'proposed' }).map((job) => job._id), [1]);

  const plan = read('components/TaskPressPlan.jsx');
  assert.match(plan, /\{mayPlan && proposal && \(/, 'Confirm and Change: the in charge only');
  assert.match(plan, /onClick=\{\(\) => onConfirm\(\[row\.model\]\)\}>Confirm</);
  assert.match(plan, /Confirm all \{needs\.proposed\}/);
  assert.match(plan, /productionApi\.confirmTaskPlan\(\{ taskId: todo\._id, models \}\)/);
  assert.match(plan, /productionApi\.proposeTaskPlan\(todo\._id\)/);
  assert.match(plan, /proposal\.learned\?\.\[0\]/, 'what it learned is said');
  const card = read('components/planning/JobCard.jsx');
  assert.match(card, /\{mayPlan && \(\s*<button type="button" className="btn-primary shrink-0 px-3 py-1\.5 text-xs" disabled=\{busy\} onClick=\{\(\) => onPlace\(proposal\.machine\)\}>Confirm<\/button>/);
  const page = read('pages/PlanningBoard.jsx');
  assert.match(page, /proposal\{needs\.proposals === 1 \? '' : 's'\} to confirm/);
  assert.match(page, /if \(mayPlan\) productionApi\.plannerStats\(\)/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /confirmTaskPlan: \(\{ taskId, models \}\) => api\.post\(`\/production\/task-plan\/\$\{taskId\}\/confirm`/);
  assert.match(endpoints, /proposeTaskPlan: \(taskId\) => api\.post\(`\/production\/task-plan\/\$\{taskId\}\/propose`/);
  assert.match(endpoints, /plannerStats: \(\) => api\.get\('\/production\/planner-stats'/);
});
