/**
 * The production queue board [pages/ProductionQueue.jsx; server: controllers/productionQueue.controller.js]:
 * one row per open Production task in EDD order, the other teams beside each, filters by band and
 * by team, status moves and problem reports from the row, Assembly tasked from the row, and the
 * page reachable from every department that works to it.
 *
 *   node --test tests/production-queue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEPARTMENT_WORKSPACES } from '../src/config/departments.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const page = read('pages/ProductionQueue.jsx');

test('the board reads one endpoint, refreshes itself, and keeps its band and team filters in the address', () => {
  assert.match(read('api/endpoints.js'), /queue: \(\) => api\.get\('\/production\/queue'\)/);
  assert.match(page, /productionApi\.queue\(\)/);
  assert.match(page, /const REFRESH_MS = 60 \* 1000;/, 'a minute between refreshes');
  assert.match(page, /setInterval\(load, REFRESH_MS\)/);
  assert.match(page, /useSearchParams\(\)/);
  assert.match(page, /params\.get\('band'\)/);
  assert.match(page, /params\.get\('team'\)/);
  for (const key of ['assembly', 'quality', 'dispatch', 'issues', 'unclaimed']) assert.match(page, new RegExp(`key: '${key}'`), `team filter ${key}`);
});

test('the tiles answer the questions the floor asks: late, due today, due tomorrow, no EDD, printing / assembly to decide, problems, not picked up', () => {
  for (const label of ['Late', 'Due today', 'Due tomorrow', 'No EDD yet', 'Printing / assembly\\?', 'Problems', 'Not picked up']) {
    assert.match(page, new RegExp(`<Tile label="${label}"`), label);
  }
  assert.match(page, /teams\.dueTomorrow/);
  assert.match(page, /bands\.none/);
  assert.match(page, /teams\.toRoute/);
});

test('each row carries Assembly, Printing, Quality and Dispatch beside Production’s own status, and who has it', () => {
  for (const team of ['assembling', 'printing', 'quality', 'despatch']) assert.match(page, new RegExp(`row\\.teams\\.${team}`), team);
  assert.match(page, /<TeamCell /);
  assert.match(page, /row\.task\.with/);
  assert.match(page, /row\.task\.latest/);
});

test('Production moves its status and reports a problem from the row; everyone else sees the status as a chip', () => {
  assert.match(page, /aria-label=\{`Production status of \$\{row\.enquiry\.number\}`\}/);
  assert.match(page, /aria-label=\{`Report a problem on \$\{row\.enquiry\.number\}`\}/);
  assert.match(page, /<option value="">Report a problem…<\/option>/);
  assert.match(page, /\.filter\(\(entry\) => entry\.issue\)/, 'the problem list is the issue statuses');
  assert.match(page, /mayWork\(row\)/);
  assert.match(page, /<TaskPanel/);
  assert.match(page, /startWith=/);
});

test('Assembly is tasked from the row with the Production task behind it, on the enquiry, with the model prefilled', () => {
  assert.match(page, /<DepartmentTaskDialog/);
  assert.match(page, /kind="ask_assembling_edd"/);
  assert.match(page, /fromTask=\{\{ _id: assemblyFor\.task\._id, kind: 'ask_edd' \}\}/);
  assert.match(page, /enquiry=\{\{ _id: assemblyFor\.enquiry\._id, customer: assemblyFor\.enquiry\.customer \}\}/);
  assert.match(page, />Task Assembly</);
  assert.match(page, />Needs assembly</);
  assert.match(page, /!row\.teams\.assembling/, 'not offered once Assembly has its task');
});

test('the board is reachable: its route, the Production desk button, and a page link on every desk that works to it', () => {
  const app = read('App.jsx');
  assert.match(app, /path="production\/queue"/);
  assert.match(app, /moduleKey=\{\['production', 'dispatch', 'quality', 'orders', 'enquiries'\]\}/, 'every department that reads it');
  assert.match(read('pages/DepartmentDashboard.jsx'), /\{isProduction && <Link to="\/production\/queue" className="btn-primary">Queue board<\/Link>\}/);
  const linked = Object.entries(DEPARTMENT_WORKSPACES)
    .filter(([, workspace]) => (workspace.pages || []).some((entry) => entry.to === '/production/queue'))
    .map(([key]) => key);
  for (const key of ['production', 'despatch', 'assembling', 'quality', 'printing', 'mould']) assert.ok(linked.includes(key), `${key} desk links the queue`);
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

test('the sheet for the floor: one line a row, the teams beside it, quoted where a comma would break it', () => {
  const row = at('ENQ-1', '2026-10-17', 'started');
  row.teams = { assembling: { label: 'Started', with: { name: 'Anand' } }, quality: null };
  row.task.latest = { note: 'Slotted on M2, after the current run' };
  const csv = queueCsv([row], now);
  const [head, line] = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(head, 'EDD,Due,Enquiry,Buyer,Model,Qty,Colour,Production,With,Assembly,Printing,Quality,Dispatch,SO,Latest');
  assert.equal(line, '2026-10-17,today,ENQ-1,SCM,NPT-400S,6000,,started,not picked up,Started (Anand),,,,,"Slotted on M2, after the current run"');
});

test('the page offers list and board, the day headings, the row opened to its updates, print and CSV', () => {
  assert.match(page, /\[\['list', 'List'\], \['board', 'Board'\]\]/);
  assert.match(page, /params\.get\('view'\) === 'board'/);
  assert.match(page, /\{dayGroups\(shown\)\.map\(\(group\) => \(/);
  assert.match(page, /\{dueWords\(row\.edd\?\.date\)\}/);
  assert.match(page, /aria-expanded=\{expanded\.has\(row\.task\._id\)\}/);
  assert.match(page, /<RowDetail row=\{row\} \/>/);
  assert.match(page, /row\.task\.recent/);
  assert.match(page, /<Board columns=\{boardOf\(shown\)\}/);
  assert.match(page, /onClick=\{\(\) => window\.print\(\)\}>Print</);
  assert.match(page, /queueCsv\(shown\)/);
  assert.match(read('index.css'), /@media print/);
});
