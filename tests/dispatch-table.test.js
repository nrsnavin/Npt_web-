/**
 * The Dispatch desk as a table [components/DispatchTable.jsx]: one line a request, the columns
 * the desk asked for, the urgency set from the row by Admin or marketing, Update status opening
 * the task, and the table first with the cards a toggle away (remembered on the device).
 *
 *   node --test tests/dispatch-table.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const table = read('components/DispatchTable.jsx');

test('the columns: customer, enquiry / SO, models & qty, marketing, EDD, urgency, status, goods / QC, booking, with', () => {
  const heads = [...table.matchAll(/<th className="px-3 py-2\.5">([^<]+)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(heads, ['Customer', 'Enquiry / SO', 'Models &amp; qty', 'Marketing', 'EDD', 'Urgency', 'Status', 'Goods / QC', 'Booking', 'With']);
  assert.match(table, /enquiry\?\.edd\?\.date \|\| task\.jobEdd\?\.date/, 'marketing’s EDD, or a customer job’s');
  assert.match(table, />Not set<\/span>/, 'no EDD says so');
  assert.match(table, /function GoodsCell\(\{ goods, status \}\)/);
  assert.match(table, /QC pending/);
});

test('the urgency is set from the row by Admin or the marketing person; Update status opens the task', () => {
  assert.match(table, /const maySetUrgency = \(row\) => isManagement \|\| idOf\(row\.enquiry \? row\.enquiry\.assignedTo : row\.task\.createdBy\) === me;/);
  assert.match(table, /\{isDefault \? 'Set urgency' : 'Change urgency'\}/);
  assert.match(table, /<DeliveryUrgencyDialog/);
  assert.match(table, /\{mayWork\(task\) \? 'Update status' : 'Open'\}/);
  assert.match(table, /<TaskPanel/);
});

test('the Dispatch desk opens on the table, with a remembered Table / Cards toggle', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /const viewKeyOf = \(department\) => \(department === 'despatch' \? 'npt\.dispatchView' : `npt\.deskView\.\$\{department\}`\);/);
  assert.match(dashboard, /localStorage\.getItem\(viewKeyOf\(department\)\) === 'cards' \? 'cards' : 'table'/);
  assert.match(dashboard, /figures\.department === 'despatch' \? 'Dispatch view'/);
  assert.match(dashboard, /figures\.department === 'despatch' && viewOf\('despatch'\) === 'table' && shown\.length > 0 \? \(\s*<DispatchTable rows=\{shown\} me=\{me\} onChanged=\{reload\} \/>/);
});
