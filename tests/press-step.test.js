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
  assert.match(panel, /accepted: 'plan', planning: 'plan',\s+started: 'start',\s+part1_ready: 'made', part2_ready: 'made', completed: 'made',\s+mould_issue: 'stop', raw_material: 'stop',/);
  assert.match(panel, /todo\?\.kind === 'ask_edd' \? PRESS_STEPS\[status\]/, 'only on the Production task');
  assert.match(panel, /workspace\.todos\.pressStep\(\{ id: todo\._id, status, models \}\)/);
  assert.match(panel, /Not on a press yet — just change the status/, 'the status may move alone');
  assert.match(panel, /`\$\{kind === 'start' \? 'Confirm production on' : 'Plan on'\} \$\{codes\.join\(', '\)\}`/, 'the button names the press');
  assert.match(panel, /disabled=\{kind === 'start' && Boolean\(press\.running\)\}/, 'a press running another job is not offered');
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
