/**
 * Release to production in one click from the order's checklist [pages/OrderDetail.jsx;
 * server: order.controller `applyOrderAction` with `confirmAll`].
 *
 *   node --test tests/one-click-release.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the checklist ends with the release button; with checks open it says which it confirms first', () => {
  const page = readFileSync(new URL('../src/pages/OrderDetail.jsx', import.meta.url), 'utf8');
  assert.match(page, /'Confirm all & release to production'/);
  assert.match(page, /: 'Release to production'/);
  assert.match(page, /This confirms \{open\.map\(\(check\) => check\.label\.toLowerCase\(\)\)\.join\(', '\)\} in your name/);
  assert.match(page, /onChanged\(await ordersApi\.release\(\{ id: order\._id, expectedUpdatedAt: order\.updatedAt \}\)\)/);
  const api = readFileSync(new URL('../src/api/endpoints.js', import.meta.url), 'utf8');
  assert.match(api, /\{ \.\.\.payload, action: 'release', confirmAll: true \}/);
});

test('a status that asks for a choice (the payment mode) shows a dropdown; Payment Inward Confirmed says what follows', () => {
  const workflow = readFileSync(new URL('../src/components/TaskWorkflow.jsx', import.meta.url), 'utf8');
  assert.match(workflow, /\{field\.options \? \(\s*<select/);
  assert.match(workflow, /step\.confirmsInward && <p/);
  assert.match(workflow, /It goes on Accounts’ Payments to confirm list. When Accounts confirms it in the bank, this task reads Paid and closes — or Part Paid, open for the rest./);
  const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');
  assert.match(desk, /waiting for the advance — ₹\$\{Math\.round\(order\.advanceShort\)/);
});
