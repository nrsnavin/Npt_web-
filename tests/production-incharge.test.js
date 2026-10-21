/**
 * The Production in charge [server: models/User.js `productionInCharge`]: Admin ticks it on
 * someone in Production. They (or Admin) give Production's EDD and hand-over dates, decide
 * printing / assembly, and add to the production queue; the rest of Production sees all of it and
 * moves the statuses — never one that sets a date.
 *
 *   node --test tests/production-incharge.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the auth context says who plans Production: Admin, or the Production in charge from any department', () => {
  const auth = read('context/AuthContext.jsx');
  assert.match(auth, /mayPlanProduction: user\?\.role === 'admin'/);
  assert.match(auth, /\|\| user\?\.productionInCharge === true,/);
});

test('on Production’s task the routing, the hand-over date and the EDD are the planner’s; the rest read them', () => {
  const edd = read('components/TaskEdd.jsx');
  assert.match(edd, /const plans = mayAct && mayPlanProduction;/);
  assert.match(edd, /<TaskRouting todo=\{todo\} mayAct=\{plans\}/);
  assert.match(edd, /<HandOverDate todo=\{todo\} mayAct=\{plans\}/);
  assert.match(edd, /<EddBox todo=\{todo\} mayAct=\{plans\}/);
  assert.match(edd, /The Production in charge gives the EDD and decides printing and assembly — you update the status\./);
  assert.match(read('components/TaskRouting.jsx'), /The Production in charge decides this\./);
});

test('a Production member is not offered a dated status, the date box, or Add to production queue', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const noDates = todo\?\.kind === 'ask_edd' && !mayPlanProduction;/);
  assert.match(workflow, /const offered = noDates \? statuses\.filter\(\(entry\) => !entry\.date \|\| entry\.key === todo\.status\) : statuses;/);
  assert.match(workflow, /\{offered\.map\(\(entry\) => <option/);
  assert.match(workflow, /!\(noDates && next\.date\)/, 'Ready Tomorrow is not the one-press next step for them');
  assert.match(workflow, /const dated = Boolean\(form\.statusDate\) && !unrouted && !noDates;/);
  assert.match(workflow, /\{dated && \(\s*<Field label=\{dateLabel\}/);
  assert.match(read('components/ProductionQueueList.jsx'), /const mayPlan = mayPlanProduction;/);
  assert.match(read('pages/ProductionWorkflow.jsx'), /works && mayPlanProduction && !task\.completed/);
});

test('Admin ticks Production in charge on anyone — a marketing person too — and Production joins their departments', () => {
  const users = read('pages/Users.jsx');
  assert.match(users, /function ProductionInCharge\(\{ checked, onChange, disabled \}\)/);
  assert.match(users, /\{role !== 'admin' && <ProductionInCharge checked=\{inCharge\} onChange=\{markInCharge\} \/>\}/);
  assert.match(users, /if \(value && department !== 'production'\) setExtras/, 'ticked on a new user, Production is added and its access proposed');
  assert.match(users, /productionInCharge: values\.role !== 'admin' \? inCharge : false,/);
  assert.match(users, /setExtras\(updated\.extraDepartments \|\| \[\]\);\s*setGrants\(grantsToMap\(updated\.moduleAccess\)\);/, 'ticked later, the form shows Production and its access');
  assert.match(users, /usersApi\.update\(\{ id: user\.id, productionInCharge: value \}\)/);
  assert.match(users, /\{row\.productionInCharge && <> <Badge tone="progress">Production in charge<\/Badge><\/>\}/);
});

test('the Expected date on Production’s Done / Update is the EDD: not offered to the rest of Production', () => {
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /const records = \(button\?\.records \|\| \[\]\)\.filter\(\(record\) => !\(todo\.kind === 'ask_edd' && record\.type === 'date' && !mayPlanProduction\)\);/);
  assert.match(actions, /\{records\.map\(\(record\) => \(/);
});
