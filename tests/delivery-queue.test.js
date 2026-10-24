/**
 * The Dispatch desk's delivery queue and the urgency marketing or Admin gives a request
 * [components/DeliveryQueue.jsx, DeliveryUrgencyDialog.jsx, utils/deliveryUrgency.js].
 *
 *   node --test tests/delivery-queue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELIVERY_URGENCIES, dueWords, urgencyTone } from '../src/utils/deliveryUrgency.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('five urgencies, Top Most Urgent first', () => {
  assert.deepEqual(DELIVERY_URGENCIES.map((entry) => entry.label), ['Top Most Urgent', 'Today Morning', 'Today Evening', 'Today', 'Tomorrow']);
  assert.deepEqual(DELIVERY_URGENCIES.map((entry) => entry.key), ['top_urgent', 'today_morning', 'today_evening', 'today', 'tomorrow']);
});

test('the due words read in India time, and late says so', () => {
  const now = new Date('2026-10-21T03:30:00Z'); // 9 AM IST
  assert.equal(dueWords({ urgency: 'today_morning', dueBy: '2026-10-21T06:30:00Z' }, now), 'By 12 noon today');
  assert.equal(dueWords({ urgency: 'tomorrow', dueBy: '2026-10-22T13:30:00Z' }, now), 'By 7 PM tomorrow');
  assert.equal(dueWords({ urgency: 'today', dueBy: '2026-10-21T13:30:00Z', late: true }, now), 'Late — was due 7 PM today');
  assert.equal(dueWords({ urgency: 'top_urgent', dueBy: null }, now), 'First, whatever the time');
  assert.equal(dueWords(null, now), 'Urgency not given yet');
  assert.match(urgencyTone({ urgency: 'top_urgent' }), /danger/);
  assert.match(urgencyTone({ urgency: 'today', late: true }), /danger/);
  assert.match(urgencyTone({ urgency: 'today_evening' }), /warn/);
});

test('the Dispatch desk has a Delivery queue tab; marketing and Admin set the urgency from a row or the task', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /\{ key: 'delivery', label: 'Delivery queue', count: null \}/);
  assert.match(dashboard, /\{tab === 'delivery' && \([\s\S]*<DeliveryQueue \/>/);
  const queue = read('components/DeliveryQueue.jsx');
  assert.match(queue, /dispatchPlanning\.queue\(\)/);
  /* Only Admin or the request's marketing person is offered the urgency — the server says which row [row `maySetUrgency`]. */
  assert.match(queue, /\{row\.maySetUrgency && \(/);
  assert.match(queue, /!row\.delivery \? 'Today' : row\.delivery\.late \? 'Late' : row\.delivery\.label/, 'no urgency given reads Today');
  assert.match(queue, /\{row\.delivery\?\.label \|\| 'Today'\}\{row\.delivery\?\.default \? ' · default' : ''\}/);
  const dialog = read('components/DeliveryUrgencyDialog.jsx');
  assert.match(dialog, /workspace\.todos\.setDelivery\(\{ id: taskId, urgency/);
  assert.match(dialog, /const ready = urgency && \(!changing \|\| \(urgency !== current && note\.trim\(\)\.length >= 3\)\)/, 'a change says why');
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /todo\.kind === 'invoice_dispatch' && \(isAdmin \|\| departments\.includes\('marketing'\)\)/);
  assert.match(read('api/endpoints.js'), /setDelivery: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/delivery`/);
});

test('Dispatch updates each request’s status from the delivery queue — the task’s own workflow in its panel', () => {
  const queue = read('components/DeliveryQueue.jsx');
  assert.match(queue, /onClick=\{\(\) => setOpened\(row\.task\)\}/);
  assert.match(queue, /\{mayWork\(row\.task\) \? 'Update status' : 'Open'\}/);
  assert.match(queue, /<TaskPanel\s+task=\{opened\}/);
});

test('the urgency is asked on the enquiry page and the task: Today by default, confirmed or changed by marketing or Admin only', () => {
  const prompt = read('components/DeliveryUrgencyPrompt.jsx');
  assert.match(prompt, /const isDefault = !delivery \|\| Boolean\(delivery\.default\);/);
  assert.match(prompt, /\{maySet && \(/, 'Dispatch reads it, never sets it');
  assert.match(prompt, /\{isDefault \? 'Confirm or change' : 'Change urgency'\}/);
  assert.match(read('components/DepartmentDesk.jsx'), /<DeliveryUrgencyPrompt task=\{dispatchRequest\} maySet=\{isManagement \|\| owner === me\}/);
  assert.match(read('components/TaskPanel.jsx'), /<DeliveryUrgencyPrompt task=\{task\}/);
  const dialog = read('components/DeliveryUrgencyDialog.jsx');
  assert.match(dialog, /const changing = Boolean\(current\) && !isDefault;/, 'the default is changed without a reason');
  assert.match(dialog, /confirming \? 'Confirm Today'/);
});
