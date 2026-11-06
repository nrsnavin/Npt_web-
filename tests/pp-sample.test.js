/**
 * The PP sample on screen [components/PpSample.jsx; server: services/ppSample.service.js]: where it
 * stands and the buyer's answer, the DC Dispatch prepares, and the DCs waiting for the invoice.
 *
 *   node --test tests/pp-sample.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const pp = read('components/PpSample.jsx');
const endpoints = read('api/endpoints.js');

test('the endpoints: the card, the answer, the DC form, the DC PDF, added to an invoice', () => {
  assert.match(endpoints, /ofEnquiry: \(id\) => api\.get\(`\/enquiries\/\$\{id\}\/pp-sample`\)/);
  assert.match(endpoints, /answer: \(\{ id, verdict, note \}\) => api\.post\(`\/pp-samples\/\$\{id\}\/answer`, \{ verdict, note \}\)/);
  assert.match(endpoints, /saveChallan: \(\{ taskId, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{taskId\}\/challan`, payload\)/);
  assert.match(endpoints, /api\.get\(`\/delivery-challans\/\$\{id\}\/pdf`, \{ responseType: 'blob' \}\)/);
  assert.match(endpoints, /invoiced: \(\{ id, number, date \}\) => api\.post\(`\/delivery-challans\/\$\{id\}\/invoiced`/);
});

test('the card: bulk production waits; the marketing person answers Approved or Changes needed (which says what)', () => {
  assert.match(pp, /Bulk production starts only after the buyer approves the PP sample\./);
  assert.match(pp, /Approved — start production/);
  assert.match(pp, /Changes needed/);
  assert.match(pp, /disabled=\{busy \|\| note\.trim\(\)\.length < 3\} onClick=\{\(\) => send\('changes'\)\}/);
  assert.match(pp, /\{state\.mayAnswer && <Answer/);
});

test('the DC: model, mould, material, hook, clip, printing, pieces, and how it travels', () => {
  assert.match(pp, /\['model', 'Model'\], \['mould', 'Mould'\], \['material', 'Material & colour'\], \['hook', 'Hook'\], \['clip', 'Clip'\], \['printing', 'Printing'\], \['pieces', 'Pieces'\]/);
  assert.match(pp, /\['courier', 'Courier'\], \['transporter', 'Transporter'\]/);
  assert.match(pp, /Prepare the DC before sending/);
});

test('placed on the task panel, the enquiry, and Invoice & Dispatch', () => {
  const panel = read('components/TaskPanel.jsx');
  assert.match(panel, /\['po_so', 'pp_sample', 'pp_sample_send', 'pp_sample_approval'\]\.includes\(task\.kind\) && <PpSampleCard taskId=\{task\._id\}/);
  assert.match(panel, /task\.kind === 'pp_sample_send' && mayWork && <PpChallanAction/);
  assert.match(panel, /task\.kind === 'invoice_dispatch' && <ChallansToInvoice task=\{task\} \/>/);
  assert.match(read('pages/EnquiryDetail.jsx'), /<PpSampleCard enquiryId=\{enquiry\._id\} \/>/);
  assert.match(pp, /Add to the invoice: PP sample DC/);
});
