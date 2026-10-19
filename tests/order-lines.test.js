/**
 * Each sales-order line's hook, clip and print, and its print reference carried to the
 * Production workflow page [components/OrderLineParts.jsx; server: services/orderParts.service.js].
 *
 *   node --test tests/order-lines.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the sales order shows hook, clip and print on every line, the mould’s default said as such', () => {
  const page = read('src/pages/OrderDetail.jsx');
  assert.match(page, /<th className="px-3 py-2\.5">Hook · Clip · Print<\/th>/);
  assert.match(page, /<PartsList parts=\{line\.parts \|\|/);
  assert.doesNotMatch(page, /hasParts/, 'the column is on every order, not only one with picked parts');
  const parts = read('src/components/OrderLineParts.jsx');
  assert.match(parts, /part\.from === 'mould'/);
  assert.match(parts, /mould default, pick one on the line/, 'two parts at one price are both named');
});

test('a print reference — words and artwork — is given on the line and read on the Production workflow page', () => {
  const page = read('src/pages/OrderDetail.jsx');
  assert.match(page, /<PrintReference order=\{order\} line=\{line\} mayEdit=\{mayGivePrint\} onSaved=\{absorb\} \/>/);
  assert.match(page, /const mayGivePrint = !\['closed', 'cancelled'\]\.includes\(order\.status\)/, 'released orders take one too');
  assert.match(read('src/api/endpoints.js'), /api\.put\(`\/orders\/\$\{id\}\/lines\/\$\{lineId\}\/print-reference`, form\)/);
  const parts = read('src/components/OrderLineParts.jsx');
  assert.match(parts, /form|setPrintReference\(\{ id: order\._id, lineId: line\._id, text, file, removeFile \}\)/);
  const flow = read('src/pages/ProductionWorkflow.jsx');
  assert.match(flow, /specs = \[\]/);
  assert.match(flow, /<PrintReferenceView reference=\{specOf\(row\.model\)\.printReference\} \/>/);
  assert.match(flow, /<PartsList parts=\{specOf\(row\.model\)\.parts\} \/>/);
});

test('a price, an amount or a percentage takes decimals — ₹4.40 is not refused by the browser', () => {
  const dialog = read('src/components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /step=\{field\.type === 'number' \? 'any' : undefined\}/, 'the task form: prices, target prices');
  const workflow = read('src/components/TaskWorkflow.jsx');
  assert.equal((workflow.match(/step=\{field\.type === 'number' \? 'any' : undefined\}/g) || []).length, 3, 'every status field: the amount received');
  for (const file of ['src/components/FollowUp.jsx', 'src/components/EnquiryFields.jsx', 'src/components/MaintenanceForm.jsx', 'src/pages/EnquiryDetail.jsx', 'src/components/OrderForm.jsx']) {
    assert.match(read(file), /step="any"/, file);
  }
});
