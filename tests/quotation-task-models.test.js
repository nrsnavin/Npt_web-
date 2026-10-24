/**
 * A customer's Create Quotation task with no enquiry carries the quotation it raised [server:
 * raiseTeamTask], and its desk card opens it.
 *
 *   node --test tests/quotation-task-models.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a team task’s card opens the quotation it raised', () => {
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /: row\.records\?\.quotation \? \[\{ label: 'Cost the quotation', href: `\/quotations\/\$\{row\.records\.quotation\._id\}`, primary: true \}\] : \[\];/);
});
