/**
 * Production's status move also moves the floor [components/PressStep.jsx; server:
 * productionStep.service]: Started confirms the press the run starts on, the ready statuses log
 * the pieces, the issue statuses call the press in — from the same drop-down and form.
 *
 *   node --test tests/press-step.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the Production statuses that move the floor', () => {
  const panel = read('components/PressStep.jsx');
  assert.match(panel, /accepted: 'plan', planning: 'plan',\s+started: 'start',\s+part1_ready: 'made', part2_ready: 'made', completed: 'made',\s+mould_issue: 'stop', raw_material: 'stop',\s+machine_not_allotted: 'plan',/);
  assert.match(panel, /todo\?\.kind === 'ask_edd' \? PRESS_STEPS\[status\]/, 'only on the Production task');
  assert.match(panel, /workspace\.todos\.pressStep\(\{ id: todo\._id, status, models \}\)/);
  assert.match(panel, /Not on a press yet — just change the status/, 'the status may move alone');
  assert.match(panel, /`\$\{kind === 'start' \? 'Confirm production on' : 'Plan on'\} \$\{codes\.join\(', '\)\}`/, 'the button names the press');
  assert.match(panel, /disabled=\{\(kind === 'start' && Boolean\(press\.running\)\) \|\| Boolean\(cannot\)\}/, 'a press running another job, or one that cannot take the mould, is not offered');
  assert.match(panel, /productionApi\.choices\(row\.workOrder\._id\)/, 'planning on a press: the presses ranked');
  assert.match(panel, /That makes the full quantity — the model reads Production Completed\./);
  assert.match(panel, /floor: \{ stop: true, models: running\.map\(\(row\) => row\.model\) \}/);
});

test('the move form sends the press with the status and says what the floor did', () => {
  const form = read('components/TaskWorkflow.jsx');
  assert.match(form, /const pressing = pressStepOf\(todo, step\.key\);/);
  assert.match(form, /\.\.\.\(pressing && press\.floor \? \{ floor: press\.floor \} : \{\}\),/);
  assert.match(form, /toast\('The floor follows', saved\.floorDone\.join\(' · '\)\)/);
  assert.match(form, /\{busy \? 'Saving…' : press\.label \|\| 'Update status'\}/);
  const api = read('api/endpoints.js');
  assert.match(api, /pressStep: \(\{ id, status, models \}\) => api\.get\(`\/workspace\/todos\/\$\{id\}\/press-step`/);
  assert.match(api, /floorDone: response\.data\.floor/);
});

test('the ready date starts from the press plan while the box is untouched', () => {
  const panel = read('components/PressStep.jsx');
  assert.match(panel, /row\.planned\?\._id === presses\[row\.model\] && row\.workOrder\?\.plannedEnd/);
  assert.match(panel, /readyBy: days\.length \? \{ date: days\.at\(-1\), models: readyModels \} : null,/);
  const form = read('components/TaskWorkflow.jsx');
  assert.match(form, /if \(!ready \|\| dateTouched \|\| !dated \|\| ready\.date < todayInIndia\(\)\) return;/);
  assert.match(form, /From the press plan — moulding ends then/);
});

test('Today on the presses: confirm, not today, move, the shift change, and where task and floor disagree', () => {
  const page = read('pages/PressDay.jsx');
  assert.match(page, /productionApi\.pressDayMove\(\{ id: press\.next\.workOrder\._id, move: 'confirm'/);
  assert.match(page, /productionApi\.pressDayMove\(\{ id: press\.next\.workOrder\._id, move: 'hold', reason: reason\.trim\(\) \}\)/);
  assert.match(page, /workOrdersApi\.plan\(\{ id: wo\._id, machine: choice\.machine\._id \}\)/);
  assert.match(page, /productionApi\.shiftReadings\(\{ shift, readings \}\)/);
  assert.match(page, /The task and the floor disagree \(\{data\.mismatches\.length\}\)/);
  assert.match(page, /\{mayPlan && next\.due && !next\.held && !running && <button.*?>Not today<\/button>\}/, 'holding a start is the in charge’s call');
  const api = read('api/endpoints.js');
  assert.match(api, /pressDay: \(\) => api\.get\('\/production\/press-day'\)/);
  assert.match(api, /shiftReadings: \(payload\) => api\.post\('\/production\/press-day\/shift', payload/);
  assert.match(read('App.jsx'), /path="production\/today"/);
});

test('on the task: Confirm running on the press row; Start a run only with floor planning off', () => {
  const plan = read('components/TaskPressPlan.jsx');
  assert.match(plan, /productionApi\.pressDayMove\(\{ id: row\.workOrder\._id, move: 'confirm' \}\)/);
  assert.match(plan, /Confirm running on \{wo\.machine\.code\}/);
  assert.match(read('components/TaskWorkflow.jsx'), /todo\.kind === 'ask_edd' && todo\.enquiry && canWrite\('production'\) && floorOn === false && \(/);
  assert.match(read('pages/ProductionWorkflow.jsx'), /canWrite\('production'\) && !enquiry\.team && floorOn === false && \(/);
});
