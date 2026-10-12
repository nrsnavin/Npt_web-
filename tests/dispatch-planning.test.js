/**
 * Plan trips [components/TripPlanner.jsx, pages/DispatchPlan.jsx, pages/DispatchLists.jsx]: the
 * ready dispatch requests in groups that can go together, a schedule for a whole group in one
 * press, delivery details set on buyers from the planner, and the transporter and route lists.
 *
 *   node --test tests/dispatch-planning.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the planner reads the plan, filters by how the goods go, and keeps the waiting ones apart', () => {
  const planner = read('components/TripPlanner.jsx');
  assert.match(planner, /dispatchPlanning\.plan\(\)/);
  for (const label of ['Transport booking', 'Our vehicle', 'Party collects', 'Courier']) assert.match(planner, new RegExp(`label: '${label}'`));
  assert.match(planner, /<WaitingList title="Waiting for payment" rows=\{plan\.waitingPayment\}/);
  assert.match(planner, /<WaitingList title="Not ready yet" rows=\{plan\.notReady\}/);
  /* Every group says why it is a group, in words. */
  assert.match(planner, /\{group\.reason\}/);
});

test('a whole group is scheduled in one press, only the ticked buyers, and the plan reloads', () => {
  const planner = read('components/TripPlanner.jsx');
  assert.match(planner, /onSchedule\(\{ tasks: chosen\.map\(\(stop\) => stop\.task\), status: schedule, note: remark\.trim\(\) \|\| undefined \}\)/);
  assert.match(planner, /await dispatchPlanning\.schedule\(payload\);\s*await load\(\);/);
  assert.match(planner, /disabled=\{!schedule \|\| !chosen\.length \|\| busy\}/);
  /* Only the dispatch desk plans; anyone with the read grant sees the plan. */
  assert.match(planner, /const canPlan = canWrite\('dispatch'\);/);
});

test('a group without delivery details asks for them, set on all its buyers at once', () => {
  const planner = read('components/TripPlanner.jsx');
  assert.match(planner, /Fix now — add how these go/);
  assert.match(planner, /dispatchPlanning\.customerDelivery\(\{ customers: buyers\.map\(\(buyer\) => buyer\._id\), \.\.\.payload \}\)/);
  /* Blanks leave each buyer as they were. */
  assert.match(planner, /Object\.entries\(values\)\.filter\(\(\[, value\]\) => value !== ''\)/);
});

test('the API, routes and menu reach the planner and the lists', () => {
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /plan: \(\) => api\.get\('\/dispatch-planning\/plan'\)/);
  assert.match(endpoints, /schedule: \(payload\) => api\.post\('\/dispatch-planning\/schedule', payload\)/);
  assert.match(endpoints, /api\.post\('\/transporters', payload\)/);
  assert.match(endpoints, /api\.patch\(`\/delivery-routes\/\$\{id\}`, payload\)/);
  const app = read('App.jsx');
  assert.match(app, /path="dispatch\/plan"/);
  assert.match(app, /path="dispatch\/lists"/);
  const layout = read('components/Layout.jsx');
  assert.match(layout, /\{ to: '\/dispatch\/plan', label: 'Plan trips' \}/);
  assert.match(layout, /\{ to: '\/dispatch\/lists', label: 'Transporters & routes' \}/);
});

test('the lists edit with the version they were opened on, and nothing is deleted — only switched off', () => {
  const lists = read('pages/DispatchLists.jsx');
  assert.match(lists, /spec\.api\.update\(\{ id: row\._id, expectedUpdatedAt: row\.updatedAt/);
  assert.match(lists, /In use — offered when planning/);
  assert.doesNotMatch(lists, /\.remove\(|delete\(/);
});

test('the customer form keeps how the goods go: the usual way, transporter and route', () => {
  const form = read('pages/Customers.jsx');
  assert.match(form, /register\('deliveryMode'\)/);
  assert.match(form, /register\('usualTransporter'\)/);
  assert.match(form, /register\('deliveryRoute'\)/);
  /* Cleared on an edit is cleared on the record. */
  assert.match(form, /deliveryMode: values\.deliveryMode \|\| \(editing \? null : undefined\)/);
  /* Without the dispatch grant the lists fail quietly and the two pickers stay hidden. */
  assert.match(form, /transportersApi\.list\(\{ active: 'true' \}\)\.catch\(\(\) => \[\]\)/);
});
