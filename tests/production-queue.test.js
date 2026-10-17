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

test('the tiles answer the questions the floor asks: late, due today, due tomorrow, no EDD, needs assembly, problems, not picked up', () => {
  for (const label of ['Late', 'Due today', 'Due tomorrow', 'No EDD yet', 'Needs assembly', 'Problems', 'Not picked up']) {
    assert.match(page, new RegExp(`<Tile label="${label}"`), label);
  }
  assert.match(page, /teams\.dueTomorrow/);
  assert.match(page, /bands\.none/);
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
