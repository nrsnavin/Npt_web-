/**
 * Readiness queries — Printing, Assembly or Dispatch asking Production (or Dispatch asking
 * Assembly) when the goods will be ready — are tasks of their own with a short workflow, shown
 * on their own tab of the desk [server: config/departmentTaskForms.js `readinessQuery`].
 *
 *   node --test tests/readiness-queries.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the desk draws the queries under To do, in a group of their own apart from the order’s work', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /queries: everyQuery = \[\]/);
  assert.match(dashboard, /<TaskGroup title="Other teams ask: when will it be ready\?"/);
  assert.match(dashboard, /const toDoCount = \(isProduction \|\| queueTeam \? 0 : enquiries\.length\) \+ queries\.length \+ requests\.length;/);
  assert.match(dashboard, /<EnquiryCard key=\{row\.task\._id\} row=\{row\} department=\{row\.task\.department\} me=\{me\} onChanged=\{reload\} query \/>/);
  assert.match(dashboard, /asks — when will it be ready\?/);
});

test('a query card opens the enquiry only — the answer is its own workflow on the card', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /const actions = query\s+\? \(enquiry \? \[\{ label: 'Open enquiry', href: `\/enquiries\/\$\{enquiry\._id\}` \}\] : \[\]\)/);
  assert.match(dashboard, /<TaskWorkflow todo=\{task\} onChanged=\{onChanged\} \/>/);
});

test('the asking task still reads an ask raised before queries had their own task', () => {
  assert.match(read('components/TaskWorkflow.jsx'), /action\.was === task\.kind/);
});
