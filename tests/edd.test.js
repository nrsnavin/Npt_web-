/**
 * The expected delivery date, one date read everywhere [utils/edd.js; components/TaskEdd.jsx;
 * server: models/Enquiry.js `edd`]: asked for on the Production task until it is given, set by
 * marketing on the enquiry page, shown on the Production and Dispatch tasks and on the list.
 *
 *   node --test tests/edd.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { EDD_TASK_KINDS, SHOWS_EDD_KINDS, eddChipOf, eddOf, givesEdd, showsEdd } from '../src/utils/edd.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/* The date is a calendar day, as the server keeps it [models/Enquiry.js `edd`]. */
const enquiry = { _id: 'e1', number: 'ENQ-1', edd: { date: '2026-11-12', department: 'marketing', at: '2026-10-17T05:00:00.000Z' } };
const bare = { _id: 'e2', number: 'ENQ-2' };

test('the tasks that give the EDD are Production’s, Assembly’s and Printing’s; Dispatch works to it', () => {
  assert.deepEqual(EDD_TASK_KINDS, ['ask_edd', 'ask_assembling_edd', 'ask_printing']);
  assert.deepEqual(SHOWS_EDD_KINDS, [...EDD_TASK_KINDS, 'invoice_dispatch']);
  assert.equal(givesEdd({ kind: 'ask_edd', enquiry: bare }), true);
  assert.equal(givesEdd({ kind: 'invoice_dispatch', enquiry: bare }), false);
  assert.equal(showsEdd({ kind: 'invoice_dispatch', enquiry: bare }), true);
  assert.equal(showsEdd({ kind: 'po_so', enquiry: bare }), false);
  /* A team task has no enquiry to carry one. */
  assert.equal(showsEdd({ kind: 'ask_edd', enquiry: null }), false);
});

test('the chip: the date when there is one; "EDD needed" on an open Production task; "not given yet" on Dispatch', () => {
  assert.equal(eddOf(enquiry).department, 'marketing');
  assert.equal(eddOf(bare), null);
  assert.equal(eddOf('e1'), null);
  /* Production decides printing and assembly first [TaskRouting]; until then the chip says so. */
  const routed = { decidedAt: '2026-10-18T05:00:00Z', models: [{ model: 'NPT-410V' }], handsTo: [] };
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry: bare }), { tone: 'needed', label: 'Printing / assembly to decide' });
  const set = eddChipOf({ kind: 'ask_edd', enquiry, routing: routed });
  assert.equal(set.tone, 'set');
  assert.match(set.label, /^EDD 12 Nov 2026$/);
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry: bare, routing: routed }), { tone: 'needed', label: 'EDD needed' });
  /* A team that hands on shows its hand-over date, not the EDD. */
  const handing = { ...routed, handsTo: ['printing'] };
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry, routing: handing }), { tone: 'needed', label: 'Hand-over date needed' });
  assert.equal(eddChipOf({ kind: 'ask_edd', enquiry, routing: { ...handing, handOverDate: '2026-11-05' } }).label, 'To Printing 05 Nov 2026');
  assert.deepEqual(eddChipOf({ kind: 'ask_printing', enquiry: bare, routing: { handsTo: ['assembling'] } }), { tone: 'needed', label: 'Hand-over date needed' });
  assert.deepEqual(eddChipOf({ kind: 'ask_assembling_edd', enquiry: bare }), { tone: 'needed', label: 'EDD needed' });
  assert.deepEqual(eddChipOf({ kind: 'invoice_dispatch', enquiry: bare }), { tone: 'missing', label: 'EDD not given yet' });
  /* A finished task with no date says nothing; a finished one with a date still shows it. */
  assert.equal(eddChipOf({ kind: 'ask_edd', enquiry: bare, completed: true }), null);
  assert.equal(eddChipOf({ kind: 'ask_edd', enquiry, completed: true }).tone, 'set');
  assert.equal(eddChipOf({ kind: 'quality_check', enquiry }), null);
});

test('the Production task asks for the EDD at the top until it is given, and gives it without a status move', () => {
  const taskEdd = read('components/TaskEdd.jsx');
  assert.match(taskEdd, /EDD needed/);
  assert.match(taskEdd, /the enquiry has no expected delivery date yet/);
  assert.match(taskEdd, /workspace\.todos\.edd\(\{ id: todo\._id, date, models, note \}\)/);
  /* Wanted: the form is right there; given: a Change button. */
  assert.match(taskEdd, /\{gives && \(needed \|\| editing\) && \(/);
  assert.match(taskEdd, /Change EDD/);
  /* Dispatch reads it, and says when Production has not given it. */
  assert.match(taskEdd, /EDD not given yet/);
  assert.match(taskEdd, /min=\{todayInIndia\(\)\}/);
  assert.match(read('api/endpoints.js'), /api\.post\(`\/workspace\/todos\/\$\{id\}\/edd`, payload, \{ feedback: false \}\)/);
});

test('it is on the task card, the task panel, the dashboard card and the department tasks table', () => {
  const card = read('components/TaskCard.jsx');
  assert.match(card, /const edd = eddChipOf\(task\);/);
  assert.match(card, /EDD_CHIP\[edd\.tone\]/);
  assert.match(card, /<TaskEdd todo=\{task\} mayAct=\{mayAct\} onChanged=\{onChanged\} \/>/);
  assert.match(read('components/TaskPanel.jsx'), /<TaskEdd todo=\{task\} mayAct=\{mayWork\} onChanged=\{onChanged\} \/>/);
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /eddChipOf\(task\)/);
  assert.match(dashboard, /<TaskEdd todo=\{task\} mayAct onChanged=\{onChanged\} \/>/);
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /function EddChip\(\{ task \}\)/);
  assert.equal((board.match(/<EddChip task=\{task\} \/>/g) || []).length, 2, 'the table row and the phone card');
});

test('marketing sets it on the enquiry page from the order on; the list shows it', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const maySetEdd = canWrite\('enquiries'\) && !closed;/);
  assert.match(desk, /const fromOrder = !\['enquiry', 'sample', 'pricing_quote'\]\.includes\(stage\);/);
  assert.match(desk, /enquiriesApi\.setEdd\(\{ id: enquiry\._id, date, note \}\)/);
  assert.match(desk, /\{production\.edd \? 'Change EDD' : 'Set EDD'\}/);
  assert.match(desk, /EDD not set yet/);
  assert.match(read('api/endpoints.js'), /api\.post\(`\/enquiries\/\$\{id\}\/edd`, payload, \{ feedback: false \}\)/);
  const list = read('pages/Enquiries.jsx');
  assert.match(list, /title="Expected delivery date — set by marketing on the enquiry, or given by Production">EDD<\/th>/);
  assert.match(list, /enquiry\.progress\?\.edd \? formatDate\(enquiry\.progress\.edd\.date\) : '—'/);
});

test('an order of several models: a date for each, one box fills them all; the enquiry shows each model’s EDD', async () => {
  const { modelsOfTask, datesOfTask } = await import('../src/utils/edd.js');
  assert.deepEqual(modelsOfTask({ routing: { models: [{ model: 'CRF25', printing: true }, { model: 'CRF30' }] } }), ['CRF25', 'CRF30']);
  assert.deepEqual(modelsOfTask({ routing: { models: ['CRF25'] } }), ['CRF25'], 'Printing and Assembly keep their models as names');
  assert.deepEqual(modelsOfTask({ brief: { models: 'A-1, B-2' } }), ['A-1', 'B-2']);
  assert.deepEqual(datesOfTask({ modelDates: [{ model: 'CRF25', date: '2026-11-05' }] }), { CRF25: '2026-11-05' });
  const taskEdd = readFileSync(new URL('../src/components/TaskEdd.jsx', import.meta.url), 'utf8');
  assert.match(taskEdd, /models=\{modelsOfTask\(todo\)\} given=\{datesOfTask\(todo\)\}/);
  assert.match(taskEdd, /aria-label=\{`\$\{dateLabel\} for \$\{model\}`\}/);
  assert.match(taskEdd, /same for all/);
  const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');
  assert.match(desk, /<ModelEdds rows=\{production\.byModel\}/);
});
