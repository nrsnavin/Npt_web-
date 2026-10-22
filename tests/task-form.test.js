/**
 * The department task form's plain logic [utils/taskForm.js].
 *
 *   node --test tests/task-form.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  briefSections, briefToSend, cellText, departmentOptions, describeBrief, missingAnswer, noteNeeded, optionOf, startingAnswers,
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
  const pick = readFileSync(new URL('../src/components/RegisterPick.jsx', import.meta.url), 'utf8');
  assert.match(pick, /<Combobox/);
  assert.match(pick, /createLabel="Use as typed"/);
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

test('an SO request starts with Production confirmed ticked; unticked, nothing is sent and the order is held', () => {
  const button = { asks: [{ key: 'productionConfirmed', label: 'Production confirmed', type: 'check', checked: true }, { key: 'vigorous', label: 'Vigorous', type: 'check' }] };
  const answers = startingAnswers(button, {});
  assert.equal(answers.productionConfirmed, true, 'ticked by default');
  assert.equal(answers.vigorous, false, 'other boxes still start blank');
  assert.deepEqual(briefToSend(button, answers), { productionConfirmed: true });
  assert.deepEqual(briefToSend(button, { ...answers, productionConfirmed: false }), {}, 'unticked: held under Production Holded Orders');
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
  /* The queue says the press in its summary [server: productionSummary `summarise`]; the workflow page shows the run. */
  assert.match(read('components/ProductionQueueList.jsx'), /\{row\.summary\}/);
  assert.match(read('pages/ProductionWorkflow.jsx'), /running since \{formatDate\(run\.startedAt\)\}/);
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

test('a task raised without the hanger details offers to fill them, from the registers', async () => {
  const { missingDetails } = await import('../src/components/TaskWorkflow.jsx').catch(() => ({}));
  const workflow = readFileSync(new URL('../src/components/TaskWorkflow.jsx', import.meta.url), 'utf8');
  assert.match(workflow, /missing\.length \? 'Add hanger details' : 'Edit hanger details'/);
  assert.match(workflow, /workspace\.todos\.registers\(\)/);
  assert.match(workflow, /<RegisterPick field=\{field\} register=\{registers\[field\.register\]\}/);
  if (missingDetails) {
    const fields = [{ key: 'model' }, { key: 'material' }, { key: 'quantity' }, { key: 'hook' }];
    assert.deepEqual(missingDetails({ brief: { model: 'CRF25' } }, fields), ['material', 'quantity']);
  }
});

test('an SO request reads as it was entered: answers by name, a block per model with pcs × price, the total, the box', () => {
  const button = {
    asks: [
      { key: 'contactPerson', label: 'Contact person' }, { key: 'mobile', label: 'Mobile number' },
      { key: 'items', label: 'Sales order details', type: 'items', columns: [
        { key: 'model', label: 'Model' }, { key: 'material', label: 'Material & colour' }, { key: 'hook', label: 'Hook' },
        { key: 'clip', label: 'Clip' }, { key: 'print', label: 'Print' }, { key: 'quantity', label: 'Qty (pcs)', type: 'number' },
        { key: 'price', label: 'Price (₹ / pc)', type: 'number' }, { key: 'edd', label: 'EDD', type: 'date' },
      ] },
      { key: 'paymentTerms', label: 'Payment terms' }, { key: 'poNumber', label: 'Customer PO number' },
      { key: 'productionConfirmed', label: 'Production confirmed', type: 'check', checked: true },
    ],
  };
  const brief = {
    poNumber: 'PO-7781', paymentTerms: '50% advance, 50% before dispatch', contactPerson: 'Sasikumar', mobile: '9876543210', productionConfirmed: 'Yes',
    items: [
      { model: 'NPT-400S', material: 'PP Black', hook: 'Chrome swivel', clip: 'Metal clip', print: 'Logo', quantity: '10000', price: '2.4', edd: '2026-11-10' },
      { model: 'NPT-410V', material: 'HIPS Clear', quantity: '5000', price: '3.1' },
    ],
  };
  const { facts, checks, tables } = briefSections(button, brief);
  assert.deepEqual(facts.map((fact) => fact.label), ['Contact person', 'Mobile number', 'Payment terms', 'Customer PO number'], 'in the form’s order');
  assert.equal(tables[0].label, 'Sales order details');
  const [first, second] = tables[0].rows;
  assert.equal(first.title, 'NPT-400S');
  assert.deepEqual(first.parts.map((part) => `${part.label} ${part.value}`), ['Material & colour PP Black', 'Hook Chrome swivel', 'Clip Metal clip', 'Print Logo']);
  assert.match(first.amount, /^10,000 pcs × ₹2\.4 = ₹24,000 · EDD /);
  assert.equal(second.amount, '5,000 pcs × ₹3.1 = ₹15,500');
  assert.equal(tables[0].total, '2 models · 15,000 pcs · ₹39,500');
  assert.deepEqual(checks, [{ key: 'productionConfirmed', label: 'Production confirmed', ticked: true }]);
  /* Unticked, the box the form starts ticked still shows — the order is held. */
  assert.equal(briefSections(button, { ...brief, productionConfirmed: '' }).checks[0].ticked, false);
  assert.deepEqual(briefSections(button, undefined), { facts: [], checks: [], tables: [] });
});

test('a team task raised for a buyer says which enquiry filled its rows', () => {
  const dialog = readFileSync(new URL('../src/components/DepartmentTaskDialog.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /\{team && prefill\?\.from\?\.enquiry && \(/);
  assert.match(dialog, /Filled from <span className="font-semibold text-steel-200">\{prefill\.from\.enquiry\.number\}<\/span>, this buyer’s latest enquiry/);
});
