/**
 * The production queue [pages/ProductionQueue.jsx; components/ProductionQueueList.jsx;
 * server: controllers/productionQueue.controller.js]: one line per open Production task in EDD
 * order — the EDD, whose it is, its state in at most thirty words and its work orders — and the
 * Production workflow page [pages/ProductionWorkflow.jsx] where every update is given.
 *
 *   node --test tests/production-queue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEPARTMENT_WORKSPACES } from '../src/config/departments.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const page = read('pages/ProductionQueue.jsx');
const list = read('components/ProductionQueueList.jsx');
const workflow = read('pages/ProductionWorkflow.jsx');

test('the queue is one line per enquiry: EDD, whose it is, the thirty-word summary, work orders, and Open job →', () => {
  assert.match(list, /productionApi\.queue\(\)/);
  assert.match(list, /setInterval\(load, REFRESH_MS\)/, 'it keeps itself fresh');
  assert.match(list, /\{row\.summary\}/);
  assert.match(list, /<WorkOrderChip key=\{wo\._id\} wo=\{wo\} orderId=\{row\.order\?\._id\} \/>/);
  assert.match(list, /<Link to=\{row\.link\} className=\{`\$\{mayPlan && row\.production && !row\.production\.taken \? 'btn-secondary' : 'btn-primary'\} [^`]*`\}>Open job →<\/Link>/, 'the main button, unless adding to the queue is');
  assert.match(list, /\{row\.edd \? dueWords\(row\.edd\.date\) : 'give the date'\}/);
  assert.doesNotMatch(list, /<select/, 'no status is changed from the queue');
  assert.match(page, /<ProductionQueueList onRows=\{onRows\} \/>/);
  assert.match(page, /onClick=\{\(\) => window\.print\(\)\}>Print</);
});

test('the Production desk shows the same compact queue; the workflow page is reachable from the queue, the desk and the task', () => {
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /\{tab === 'pqueue' && <ProductionQueueList compact \/>\}/);
  const app = read('App.jsx');
  assert.match(app, /path="production\/queue"/);
  assert.match(app, /path="production\/workflow\/:taskId"/);
  assert.match(app, /moduleKey=\{\['production', 'dispatch', 'quality', 'orders', 'enquiries'\]\}/, 'every department that reads it');
  assert.match(read('components/TaskWorkflow.jsx'), /<Link to=\{`\/production\/workflow\/\$\{todo\._id\}`\} className="btn-secondary px-3 py-1\.5 text-xs">Production workflow<\/Link>/);
  const linked = Object.entries(DEPARTMENT_WORKSPACES)
    .filter(([, workspace]) => (workspace.pages || []).some((entry) => entry.to === '/production/queue'))
    .map(([key]) => key);
  for (const key of ['production', 'despatch', 'assembling', 'quality', 'printing', 'mould']) assert.ok(linked.includes(key), `${key} desk links the queue`);
});

test('the workflow page: the model table, Production’s updates, the later teams’ updates to read, the work orders and presses', () => {
  assert.match(workflow, /productionApi\.workflow\(taskId\)/);
  for (const head of ['Model', 'After moulding', 'Production', 'EDD', 'Work order']) assert.ok(workflow.includes(`>${head}</th>`), head);
  for (const head of ['Printing', 'Assembly']) assert.ok(!workflow.includes(`>${head}</th>`), `no ${head} column — Production reads their updates instead`);
  assert.match(workflow, /goods came \{formatDate\(received\)\}/);
  assert.match(workflow, /\{status\.given\.label\} \{formatDate\(status\.given\.date\)\}/, 'each team’s hand-over date or EDD under its status');
  assert.match(workflow, /<TaskEdd todo=\{task\} mayAct onChanged=\{changed\} \/>/, 'printing / assembly decided and the dates given');
  assert.match(workflow, /<TaskWorkflow todo=\{task\} onChanged=\{changed\} \/>/, 'each model’s status and hand-over');
  assert.match(workflow, /<TeamUpdates title="Printing" task=\{teams\.printing\} \/>/);
  assert.match(workflow, /<TeamUpdates title="Assembly" task=\{teams\.assembling\} \/>/);
  assert.doesNotMatch(workflow, /TeamCard|TaskEdd todo=\{task\} onChanged/, 'no workflow or date controls for the later teams on Production’s page');
  assert.match(workflow, /\{dateLabelFor\(task, 'Completion date'\)\} \{formatDate\(given\)\}/, 'the date each team gave, to read');
  assert.match(workflow, /title=\{`Work orders \(\$\{workOrders\.length\}\)`\}/);
  assert.match(workflow, /Plan on a press/);
  assert.match(workflow, /running since \{formatDate\(run\.startedAt\)\}/);
});

/* ------------------------------ The board's second pass ------------------------------ */

import { BOARD_COLUMNS, boardColumnOf, boardOf, dayGroups, dueWords, queueCsv } from '../src/utils/productionQueue.js';

/* 17 Oct 2026, 10:00 in India — a Saturday. */
const now = new Date('2026-10-17T04:30:00.000Z');
const at = (id, edd, status, extra = {}) => ({ task: { _id: id, status, statusLabel: status, ...extra }, enquiry: { number: id, edd: edd ? { date: edd } : undefined, customer: { name: 'SCM' }, model: 'NPT-400S', quantity: '6000' }, edd: edd ? { date: edd } : null, teams: {} });

test('the EDD in the floor’s words: days late, today, tomorrow, in N days, no EDD', () => {
  assert.equal(dueWords('2026-10-15', now), '2 days late');
  assert.equal(dueWords('2026-10-16', now), '1 day late');
  assert.equal(dueWords('2026-10-17', now), 'today');
  assert.equal(dueWords('2026-10-18', now), 'tomorrow');
  assert.equal(dueWords('2026-10-21', now), 'in 4 days');
  assert.equal(dueWords(null, now), 'no EDD');
});

test('the list is cut into days — late first, each EDD day by name, the undated last', () => {
  const groups = dayGroups([at('a', '2026-10-10'), at('b', '2026-10-16'), at('c', '2026-10-17'), at('d', '2026-10-18'), at('e', '2026-10-20'), at('f', null)], now);
  assert.deepEqual(groups.map((group) => [group.key, group.label, group.rows.length]), [
    ['late', 'Late — past the EDD', 2],
    ['2026-10-17', 'Today · Sat 17 Oct', 1],
    ['2026-10-18', 'Tomorrow · Sun 18 Oct', 1],
    ['2026-10-20', 'Tue 20 Oct', 1],
    ['none', 'No EDD yet — ask for the date', 1],
  ]);
});

test('the board folds Production’s statuses into five columns; a problem lands in Problems whatever its key', () => {
  assert.deepEqual(BOARD_COLUMNS.map((column) => column.key), ['new', 'planned', 'press', 'problem', 'done']);
  assert.equal(boardColumnOf('received'), 'new');
  assert.equal(boardColumnOf('planning'), 'planned');
  assert.equal(boardColumnOf('part1_ready'), 'press');
  assert.equal(boardColumnOf('raw_material'), 'problem');
  assert.equal(boardColumnOf('ready_for_dispatch'), 'done');
  assert.equal(boardColumnOf('something_new', true), 'problem');
  assert.equal(boardColumnOf('something_new'), 'planned');
  const board = boardOf([at('a', null, 'received'), at('b', null, 'started'), at('c', null, 'mould_issue', { issue: true })]);
  assert.deepEqual(board.map((column) => column.rows.length), [1, 0, 1, 1, 0], 'every column kept, empty ones too');
});

test('the sheet for the floor: one line a row — the models, the summary, the work orders — quoted where a comma would break it', () => {
  const row = at('ENQ-1', '2026-10-17', 'started');
  row.models = [{ model: 'CRF25' }, { model: 'CRF30' }];
  row.summary = 'CRF25 Handed to Printing; CRF30 Production Started. No EDD yet';
  row.workOrders = [{ number: 'WO-1', status: 'running' }];
  const csv = queueCsv([row], now);
  const [head, line] = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(head, 'EDD,Due,Against the EDD,Enquiry,Buyer,Models,SO,Status,Work orders');
  assert.equal(line, '2026-10-17,today,,ENQ-1,SCM,"CRF25, CRF30",,CRF25 Handed to Printing; CRF30 Production Started. No EDD yet,WO-1 running');
});

test('press time reads from the mould, and is flagged when it runs past the EDD', async () => {
  const { capacityWords, pressTimeTight } = await import('../src/utils/productionQueue.js');
  assert.equal(capacityWords({ days: 2, perDay: 12960, basis: 'mould' }), '2 press days · 12,960 a day');
  assert.equal(capacityWords({ days: 1, perDay: 12000, basis: 'assumed' }), '1 press day · 12,000 a day (plant estimate)');
  assert.equal(capacityWords(null), null);
  assert.equal(pressTimeTight({ capacity: { finish: '2026-11-05T00:00:00Z' }, edd: { date: '2026-11-03' } }), true);
  assert.equal(pressTimeTight({ capacity: { finish: '2026-11-02T00:00:00Z' }, edd: { date: '2026-11-03' } }), false);
});

test('the Production desk opens on what is not in the production queue; the queue page on what is; the choice is kept', () => {
  const list = readFileSync(new URL('../src/components/ProductionQueueList.jsx', import.meta.url), 'utf8');
  assert.match(list, /label: 'Not in the production queue', count: \(meta\) => meta\?\.teams\?\.notTaken/);
  assert.match(list, /label: 'In the production queue', count: \(meta\) => meta\?\.teams\?\.inProduction/);
  assert.match(list, /return 'all';/, 'both, until a choice is made — a task just sent to Production is not in the queue yet');
  assert.match(list, /not shown by this filter/, 'a kept choice that hides tasks says so');
  assert.match(list, /onClick=\{\(\) => setStage\('all'\)\}>Show all<\/button>/);
  assert.match(list, /if \(stage === 'not_taken' && row\.production\?\.taken\) return false;/);
  assert.match(list, /if \(stage === 'in_production' && !row\.production\?\.taken\) return false;/);
  assert.match(list, /window\.localStorage\.setItem\(stageKey\(compact\), next\)/);
  assert.match(list, /'Not in the queue yet'/, 'each line says which it is');
});

test('Production adds a task to the queue from the desk or the workflow page: routing, EDD, remark in one step', () => {
  const list = readFileSync(new URL('../src/components/ProductionQueueList.jsx', import.meta.url), 'utf8');
  assert.match(list, /const mayPlan = mayPlanProduction;/, 'the Production in charge (or Admin) adds to the queue');
  assert.match(list, /mayPlan && row\.production && !row\.production\.taken && \(/, 'offered only on a line not yet in the queue');
  assert.match(list, /<AddToProductionQueue/);
  const dialog = readFileSync(new URL('../src/components/AddToProductionQueue.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /workspace\.todos\.addToQueue\(\{/);
  assert.match(dialog, /aria-label=\{`Printing for \$\{row\.model\}`\}/);
  assert.match(dialog, /aria-label=\{`Assembly for \$\{row\.model\}`\}/);
  assert.match(dialog, /\{pathOf\(row\)\} → Dispatch/, 'the cycle it will follow, said per model');
  assert.match(dialog, /type="date"/);
  const flow = readFileSync(new URL('../src/pages/ProductionWorkflow.jsx', import.meta.url), 'utf8');
  assert.match(flow, /works && mayPlanProduction && !task\.completed && !task\.queuedAt && \(/);
  assert.match(readFileSync(new URL('../src/api/endpoints.js', import.meta.url), 'utf8'), /api\.post\(`\/workspace\/todos\/\$\{id\}\/production-queue`, payload/);
});

test('a Production task raised from the customer, with no enquiry, is a job of its own on the queue and its workflow page', () => {
  const list = readFileSync(new URL('../src/components/ProductionQueueList.jsx', import.meta.url), 'utf8');
  assert.match(list, /row\.enquiry\.team\s*\? <p className="font-bold text-steel-50">Team task/);
  const flow = readFileSync(new URL('../src/pages/ProductionWorkflow.jsx', import.meta.url), 'utf8');
  assert.match(flow, /enquiry\.team \? `Team task · \$\{enquiry\.customer\?\.name \|\| 'no customer named'\}`/);
  assert.match(flow, /\{!enquiry\.team && <Link to=\{`\/enquiries\/\$\{enquiry\._id\}`\} className="btn-secondary">Enquiry<\/Link>\}/);
  const routing = readFileSync(new URL('../src/components/TaskRouting.jsx', import.meta.url), 'utf8');
  assert.match(routing, /if \(todo\.kind !== 'ask_edd'\) return null;/, 'printing and assembly decided on a team task too');
});

test('Admin deletes a Production task from the desk, in the queue or not — closed with a reason', () => {
  const list = readFileSync(new URL('../src/components/ProductionQueueList.jsx', import.meta.url), 'utf8');
  assert.match(list, /\{isAdmin && \(\s*<button type="button" className="btn-ghost[^"]*" onClick=\{\(\) => setDeleting\(row\)\}>Delete task<\/button>/, 'on every row, for Admin only');
  assert.match(list, /await workspace\.todos\.adminClose\(\{ id: row\.task\._id, reason \}\)/, 'closed on the server, never wiped');
  assert.match(list, /disabled=\{busy \|\| reason\.trim\(\)\.length < 5\}/, 'a reason first');
  assert.match(list, /onDeleted=\{\(\) => load\(\)\}/, 'the desk reloads without it');
});
