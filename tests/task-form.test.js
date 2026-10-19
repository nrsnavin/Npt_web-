/**
 * The department task form's plain logic [utils/taskForm.js].
 *
 *   node --test tests/task-form.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  briefToSend, cellText, departmentOptions, describeBrief, missingAnswer, noteNeeded, optionOf, startingAnswers,
} from '../src/utils/taskForm.js';

const SAMPLE = {
  key: 'sample_request', label: 'Sample Request', department: 'sampling',
  form: { team: 'Sampling Team', noteRequired: { items: 'items', column: 'quantity', above: 3, message: 'Say why' } },
  asks: [{
    key: 'items', label: 'Sample models', type: 'items', required: true, from: 'items',
    columns: [
      { key: 'model', label: 'Mould / model', required: true }, { key: 'material', label: 'Material' },
      { key: 'hook', label: 'Hook' }, { key: 'colourType', label: 'Colour is', type: 'choice', options: ['Preferred colour', 'Compulsory colour'] },
      { key: 'quantity', label: 'Pcs', type: 'number' },
    ],
  }],
};
const SO = {
  key: 'po_so', label: 'PO & SO', department: 'order_confirmation', form: { team: 'SO Team' },
  asks: [
    { key: 'contactPerson', label: 'Contact person', from: 'customer.contactPerson' },
    { key: 'paymentTerms', label: 'Payment terms', type: 'choice', options: ['100% advance'], from: 'order.paymentTerms' },
  ],
};
const TEAM = { key: 'team_payment_followup', label: 'Team Payment Follow-up', department: 'payment_collection', form: { team: 'Payment Follow-up', option: 'team_payment_followup' }, asks: [{ key: 'vigorous', label: 'Vigorous', type: 'check' }] };
const MY = { key: 'my_payment_followup', label: 'My Payment Follow-up', department: 'owner', form: { team: 'Payment Follow-up', option: 'team_payment_followup' }, asks: [] };
const QUOTE = { key: 'create_quotation', label: 'Create Quotation', department: 'quotation', form: { team: 'Quotation Team' }, asks: [] };
const NEGOTIATE = { key: 'price_negotiation', label: 'Price Negotiation', department: 'quotation', form: { team: 'Quotation Team' }, asks: [] };

const PREFILL = {
  customer: { contactPerson: 'Ramesh Jain' },
  order: { paymentTerms: 'Something else' },
  items: [{ model: 'UTJRSH-0', material: 'PP', hook: 'Chrome hook', colourType: 'Compulsory colour', quantity: '3', clip: 'not a column' }],
};

test('the form starts from the enquiry: rows with their parts, the contact; a choice it does not offer stays empty', () => {
  const sample = startingAnswers(SAMPLE, PREFILL);
  assert.deepEqual(sample.items, [{ model: 'UTJRSH-0', material: 'PP', hook: 'Chrome hook', colourType: 'Compulsory colour', quantity: '3' }]);
  const so = startingAnswers(SO, PREFILL);
  assert.equal(so.contactPerson, 'Ramesh Jain');
  assert.equal(so.paymentTerms, '', 'not one of the offered terms');
  assert.deepEqual(startingAnswers(SAMPLE, {}).items.length, 1, 'one empty row to fill when the enquiry has none');
});

test('the department list names teams, makes My/Team follow-up one entry, and tells two Quotation tasks apart', () => {
  const options = departmentOptions([SAMPLE, SO, TEAM, MY, QUOTE, NEGOTIATE, { key: 'photos_sent', label: 'Photos Sent', department: null }]);
  assert.deepEqual(options.map((option) => option.label), [
    'Sampling Team', 'SO Team', 'Payment Follow-up', 'Quotation Team — Create Quotation', 'Quotation Team — Price Negotiation',
  ]);
  assert.equal(optionOf(MY), 'team_payment_followup');
});

test('what is still needed, the over-3-pcs rule, and what is sent', () => {
  assert.equal(missingAnswer(SAMPLE, { items: [{ model: '', material: 'PP' }] }), 'Mould / model on every row');
  assert.equal(missingAnswer(SAMPLE, { items: [{ model: 'OF-8' }] }), null);
  assert.equal(noteNeeded(SAMPLE, { items: [{ model: 'OF-8', quantity: '5' }] }), true);
  assert.equal(noteNeeded(SAMPLE, { items: [{ model: 'OF-8', quantity: '3' }] }), false);
  assert.deepEqual(briefToSend(SAMPLE, { items: [{ model: 'OF-8', material: '' }, { model: '', material: '' }] }), { items: [{ model: 'OF-8', material: '' }] });
  assert.deepEqual(briefToSend(TEAM, { vigorous: true }), { vigorous: true });
  assert.deepEqual(briefToSend(TEAM, { vigorous: false }), {});
});

test('what a task was asked, in lines — a line per row of a table', () => {
  assert.deepEqual(describeBrief(SAMPLE, { items: [{ model: 'UTJRSH-0', material: 'PP', colourType: 'Compulsory colour', quantity: '5' }] }), [
    'UTJRSH-0 · PP · Compulsory colour · 5 pcs',
  ]);
  assert.deepEqual(describeBrief(SO, { contactPerson: 'Ramesh', paymentTerms: '100% advance' }), ['Contact person: Ramesh · Payment terms: 100% advance']);
  assert.deepEqual(describeBrief(SO, undefined), []);
});

test('a member question picks a person of its department — the PRT member to visit', () => {
  const dialog = readFileSync(new URL('../src/components/DepartmentTaskDialog.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /if \(field\.type === 'member'\) \{/);
  assert.match(dialog, /prefill\?\.members\?\.\[field\.department\]/);
  assert.match(dialog, /<option key=\{person\._id\} value=\{person\._id\}>\{person\.name\}<\/option>/);
});

test('register questions are a dropdown from the register — on an enquiry or a team task, SO and sample rows too', () => {
  const dialog = readFileSync(new URL('../src/components/DepartmentTaskDialog.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /const register = field\.register && prefill\?\.registers\?\.\[field\.register\];/);
  /* The enquiry's own models stay the choices where a question offers them. */
  assert.match(dialog, /if \(register && !\(field\.optionsFrom && options\.length\)\)/);
  /* Narrowing as you go, and a model or material the register does not know is kept as typed. */
  assert.match(dialog, /<Combobox/);
  assert.match(dialog, /createLabel="Use as typed"/);
  assert.match(dialog, /<Answer field=\{column\} value=\{row\[column\.key\]\} prefill=\{prefill\}/);
  assert.match(dialog, /<Rows field=\{field\} rows=\{answers\[field\.key\] \|\| \[\]\} prefill=\{prefill\}/);
});

test('picking a customer on a team task fills only the blanks — what was typed stays', () => {
  const dialog = readFileSync(new URL('../src/components/DepartmentTaskDialog.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /if \(startedFor\.current !== button\.key\) \{/);
  assert.match(dialog, /\[key, blank\(current\[key\]\) \? value : current\[key\]\]/);
});

test('an SO request’s rows read with their pieces, price and EDD', () => {
  const button = {
    asks: [{
      key: 'items', label: 'Sales order details', type: 'items',
      columns: [
        { key: 'model', label: 'Model' }, { key: 'material', label: 'Material & colour' },
        { key: 'quantity', label: 'Qty (pcs)', type: 'number' }, { key: 'price', label: 'Price (₹ / pc)', type: 'number' },
        { key: 'edd', label: 'EDD', type: 'date' },
      ],
    }, { key: 'productionConfirmed', label: 'Production confirmed', type: 'check' }],
  };
  const lines = describeBrief(button, { items: [{ model: 'NH-400', material: 'PP Black', quantity: '5000', price: '2.4', edd: '2026-11-10' }], productionConfirmed: 'Yes' });
  assert.ok(lines.includes('NH-400 · PP Black · 5000 pcs · ₹2.4 / pc · EDD 2026-11-10'), lines.join('\n'));
  assert.equal(cellText({ key: 'quantity' }, '3'), '3 pcs');
});

test('the held order’s banner and Move to Production are drawn by the desk for Admin or its owner', () => {
  const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');
  assert.match(desk, /stage === 'production_hold'/);
  assert.match(desk, /isManagement \|\| owner === me/);
  assert.match(desk, /Move to Production/);
});

test('Release to production: on the Sales orders list for confirmed orders, and on the enquiry with when and by whom', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const list = read('pages/Orders.jsx');
  assert.match(list, /readyToRelease: ready \? 'true' : undefined/);
  assert.match(list, /Confirmed — ready to release/);
  assert.match(list, /order\.releasable && \(mayWrite \?/);
  assert.match(list, /ordersApi\.act\(\{ id: order\._id, expectedUpdatedAt: order\.updatedAt, action: 'release' \}\)/);
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const orders = history\?\.orders \|\| \[\];/);
  assert.match(desk, /Released to production \{formatDate\(order\.released\.at\)\}/);
  assert.match(desk, /\{order\.mayRelease && \(/);
});

test('one story: the journey and the mould running on the enquiry, the production queue and the machines', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /<JourneyStrip journey=\{history\?\.journey\} floor=\{history\?\.floor\} \/>/);
  assert.match(desk, /Moulding now/);
  assert.match(desk, /sample: 'Sample — ends at the sample'/);
  const queue = read('pages/ProductionQueue.jsx');
  assert.match(queue, /<Moulding floor=\{row\.floor\} \/>/);
  assert.match(queue, /key: 'moulding', label: 'Moulding now'/);
  const machines = read('pages/Machines.jsx');
  assert.match(machines, /machine\.running\.enquiry\.number/);
});

test('the SO upload reads the PDF and drafts the order; the order says how it was drafted and what differs', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /reads=\{Boolean\(button\.booksOrder\)\}/);
  assert.match(workflow, /Reading the SO and drafting the order…/);
  const order = read('pages/OrderDetail.jsx');
  assert.match(order, /Drafted by reading the SO PDF/);
  assert.match(order, /order\.drafted\.differences\.map/);
});
