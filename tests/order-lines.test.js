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
