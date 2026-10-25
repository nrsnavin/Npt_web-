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
  assert.match(plan, /Choose press/);
  assert.match(plan, /productionApi\.choices\(choosing\.workOrder\._id\)/);
  assert.match(plan, /<PressChoices /);
  assert.match(plan, /after moulding is due/);
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

test('the floor tablet ticks the mould change, and a run before the first piece says why', () => {
  const floor = read('pages/Floor.jsx');
  assert.match(floor, /const SETUP_STEPS = \[\['mouldOff', 'Mould off'\], \['mouldOn', 'Mould on'\], \['heated', 'Heated'\], \['firstPiece', 'First piece OK'\]\];/);
  assert.match(floor, /onClick=\{\(\) => setupTap\(job, key, done\)\}/);
  assert.match(read('api/endpoints.js'), /setupStep: \(\{ id, step, undo \}\) => api\.post\(`\/work-orders\/\$\{id\}\/setup`/);
  const runs = read('pages/MouldRuns.jsx');
  assert.match(runs, /const setupOpen = Boolean\(workOrder\?\.task && !workOrder\?\.setup\?\.firstPiece\?\.at && !workOrder\?\.firstRunAt\);/);
  assert.match(runs, /setupSkipReason: skipReason\.trim\(\)/);
});
