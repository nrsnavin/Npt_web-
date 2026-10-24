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

import { EDD_TASK_KINDS, SHOWS_EDD_KINDS, eddChipOf, eddOf, eddOfTask, givesEdd, showsEdd } from '../src/utils/edd.js';

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
  /* A Production, Printing or Assembly task raised from the customer, with no enquiry, gives its own. */
  assert.equal(showsEdd({ kind: 'ask_edd', enquiry: null }), true);
  assert.equal(givesEdd({ kind: 'ask_printing', enquiry: null }), true);
  assert.equal(showsEdd({ kind: 'invoice_dispatch', enquiry: null }), true, 'a team dispatch request works to the job’s EDD');
  /* With no enquiry the EDD is the job's, marketing's — never a team's own dates. */
  assert.equal(eddOfTask({ kind: 'ask_edd', modelDates: [{ model: 'A', date: '2026-10-24' }, { model: 'B', date: '2026-10-26' }] }), null);
  assert.deepEqual(eddOfTask({ kind: 'ask_edd', jobEdd: { date: '2026-11-02' } }), { date: '2026-11-02', department: 'marketing' });
  assert.equal(eddOfTask({ kind: 'ask_edd', enquiry: bare, modelDates: [{ model: 'A', date: '2026-10-24' }] }), null, 'an enquiry’s task reads the enquiry’s EDD');
});

test('the chip: no EDD from marketing first; then a team that owes its own date; else marketing’s EDD', () => {
  assert.equal(eddOf(enquiry).department, 'marketing');
  assert.equal(eddOf(bare), null);
  assert.equal(eddOf('e1'), null);
  const needed = { tone: 'needed', label: 'EDD needed from marketing' };
  /* With no EDD the work has no place in the queues: that is said before anything else. */
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry: bare }), needed);
  assert.deepEqual(eddChipOf({ kind: 'ask_assembling_edd', enquiry: bare }), needed);
  assert.deepEqual(eddChipOf({ kind: 'invoice_dispatch', enquiry: bare }), needed);
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', jobEdd: null }), needed, 'a job raised from the customer too');
  /* With the EDD set: Production decides printing and assembly first [TaskRouting]. */
  const routed = { decidedAt: '2026-10-18T05:00:00Z', models: [{ model: 'NPT-410V' }], handsTo: [] };
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry }), { tone: 'needed', label: 'Printing / assembly to decide' });
  /* The last team owes its completion date until it gives one; then the chip reads marketing's EDD. */
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry, routing: routed }), { tone: 'needed', label: 'Completion date needed' });
  const set = eddChipOf({ kind: 'ask_edd', enquiry, routing: routed, modelDates: [{ model: 'NPT-410V', date: '2026-11-10' }] });
  assert.equal(set.tone, 'set');
  assert.match(set.label, /^EDD 12 Nov 2026$/);
  assert.equal(eddChipOf({ kind: 'ask_edd', jobEdd: { date: '2026-11-15' }, routing: routed, modelDates: [{ model: 'NPT-410V', date: '2026-11-10' }] }).label, 'EDD 15 Nov 2026', 'the job’s EDD');
  /* A team that hands on owes its hand-over date. */
  const handing = { ...routed, handsTo: ['printing'] };
  assert.deepEqual(eddChipOf({ kind: 'ask_edd', enquiry, routing: handing }), { tone: 'needed', label: 'Hand-over date needed' });
  assert.equal(eddChipOf({ kind: 'ask_edd', enquiry, routing: { ...handing, handOverDate: '2026-11-05' } }).label, 'EDD 12 Nov 2026');
  assert.deepEqual(eddChipOf({ kind: 'ask_printing', enquiry, routing: { handsTo: ['assembling'] } }), { tone: 'needed', label: 'Hand-over date needed' });
  /* A finished task with no date says nothing; a finished one with a date still shows it. */
  assert.equal(eddChipOf({ kind: 'ask_edd', enquiry: bare, completed: true }), null);
  assert.equal(eddChipOf({ kind: 'ask_edd', enquiry, completed: true }).tone, 'set');
  assert.equal(eddChipOf({ kind: 'quality_check', enquiry }), null);
});

test('the Production, Printing or Assembly task asks for its completion date until it is given — the EDD it reads is marketing’s', () => {
  const taskEdd = read('components/TaskEdd.jsx');
  assert.match(taskEdd, /Completion date needed/);
  /* No EDD: asked for right there — marketing and Admin set it, everybody else is told who does. */
  assert.match(taskEdd, /export function EddNeeded\(\{ todo, onChanged, className = '' \}\)/);
  assert.match(taskEdd, /\{edd \? <EddLine edd=\{edd\} \/> : <EddNeeded todo=\{todo\} onChanged=\{onChanged\} \/>\}/);
  assert.match(taskEdd, /enquiriesApi\.setEdd\(\{ id: enquiryId, date, note \}\)/);
  assert.match(taskEdd, /workspace\.todos\.jobEdd\(\{ id: todo\._id, date, note \}\)/);
  assert.match(taskEdd, / Marketing or Admin sets it\./);
  assert.match(taskEdd, /workspace\.todos\.edd\(\{ id: todo\._id, date, models, note \}\)/);
  /* Wanted: the form is right there; given: a Change button. */
  assert.match(taskEdd, /\{gives && \(needed \|\| editing\) && \(/);
  assert.match(taskEdd, /Change completion date/);
  assert.match(taskEdd, /after the EDD: marketing and Admin see it on the enquiry/);
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
  assert.match(list, /title="Expected delivery date — marketing’s; under it, the plant’s completion date and whether the order is in danger of missing it">EDD<\/th>/);
  assert.match(list, /Plant \{formatDate\(enquiry\.progress\.completion\.date\)\}/);
  assert.match(list, /\{inDanger\(enquiry\.progress\?\.risk\) && <DeliveryBadge risk=\{enquiry\.progress\.risk\}/);
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
  assert.match(taskEdd, /aria-label=\{`\$\{hintOf \? hintOf\(model\) : dateLabel\} for \$\{model\}`\}/);
  assert.match(taskEdd, /same for all/);
  const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');
  assert.match(desk, /<ModelEdds rows=\{production\.byModel\}/);
});

test('a status move starts with the hand-over date already given; Handed to Printing / Assembly only where a model goes there', async () => {
  const { givenDateOf, statusesFor } = await import('../src/utils/edd.js');
  assert.equal(givenDateOf({ routing: { handsTo: ['printing'], handOverDate: '2026-11-04' } }), '2026-11-04');
  assert.equal(givenDateOf({ modelDates: [{ model: 'A', date: '2026-11-02' }, { model: 'B', date: '2026-11-06' }] }), '2026-11-06');
  assert.equal(givenDateOf({}), '');
  const statuses = [{ key: 'completed' }, { key: 'handed_printing', handsTo: 'printing' }, { key: 'handed_assembly', handsTo: 'assembling' }];
  assert.deepEqual(statusesFor({ routing: { handsTo: ['printing'] } }, statuses).map((step) => step.key), ['completed', 'handed_printing']);
  assert.deepEqual(statusesFor({}, statuses).map((step) => step.key), ['completed']);
  const workflow = readFileSync(new URL('../src/components/TaskWorkflow.jsx', import.meta.url), 'utf8');
  /* One model's own form starts with that model's date; the whole-task form with the task's. */
  assert.match(workflow, /const given = fixedModels\?\.length === 1 \? datesOfTask\(todo\)\[fixedModels\[0\]\] \|\| givenDateOf\(todo\) : givenDateOf\(todo\);/);
});

test('the enquiry sets the EDD per model and the dispatch plan, and shows which models are ready', () => {
  const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');
  assert.match(desk, /enquiriesApi\.setModelEdds\(\{ id: enquiry\._id, models: rows, note \}\)/);
  assert.match(desk, /enquiriesApi\.setDispatchPlan\(\{ id: enquiry\._id, mode \}\)/);
  assert.match(desk, /Dispatch each model as it is ready/);
  assert.ok(desk.indexOf('const [settingFinal, setSettingFinal] = useState(false);') < desk.indexOf('if (!catalogue) return null;'), 'hooks before the early return');
  const edd = readFileSync(new URL('../src/components/TaskEdd.jsx', import.meta.url), 'utf8');
  assert.match(edd, /\(set for this model\)/);
  assert.match(edd, /team\.kind === 'handover' \? 'hands over' : 'completes'/);
  assert.match(edd, /after the EDD/);
});

test('a task of several models moves model by model: the models ticked, each one’s status shown', async () => {
  const { modelStatusesOf, modelsForStep, movesByModel } = await import('../src/utils/edd.js');
  const task = {
    kind: 'ask_edd', status: 'started',
    routing: { models: [{ model: 'CRF25', printing: true }, { model: 'CRF30', assembly: true }, { model: 'CRF40' }] },
    modelStatuses: [{ model: 'CRF25', status: 'part1_ready' }],
  };
  assert.equal(movesByModel(task), true);
  assert.equal(movesByModel({ kind: 'ask_edd', brief: { model: 'CRF25' } }), false, 'one model: the task moves as one');
  assert.equal(movesByModel({ ...task, kind: 'quality_check' }), false);
  assert.deepEqual(modelStatusesOf(task).map((row) => [row.model, row.status]), [['CRF25', 'part1_ready'], ['CRF30', 'started'], ['CRF40', 'started']]);
  assert.deepEqual(modelsForStep(task, { key: 'completed' }), ['CRF25', 'CRF30', 'CRF40']);
  assert.deepEqual(modelsForStep(task, { key: 'handed_printing', handsTo: 'printing' }), ['CRF25']);
  assert.deepEqual(modelsForStep(task, { key: 'handed_assembly', handsTo: 'assembling' }), ['CRF30']);
  const workflow = readFileSync(new URL('../src/components/TaskWorkflow.jsx', import.meta.url), 'utf8');
  assert.match(workflow, /\.\.\.\(fixedModels \|\| \(byModel && picked\.length < allModels\.length\) \? \{ models: picked \} : \{\}\)/);
  /* Each model has its own workflow strip now [tests/model-workflows.test.js]. */
  assert.match(workflow, /aria-label="Workflow by model"/);
  assert.match(workflow, /The task stays open until every model is closed\./);
});

test('Printing / Assembly: a model whose goods have not come is offered nothing but the first step, Goods Received, an issue or closing it', async () => {
  const { statusesFor, statusesForModel, goodsAwaited, goodsOf } = await import('../src/utils/edd.js');
  const statuses = [
    { key: 'asked', label: 'Asked' }, { key: 'goods_received', label: 'Goods Received', receives: true }, { key: 'in_queue', label: 'In Work Queue', queues: true },
    { key: 'started', label: 'Started' }, { key: 'ready_dispatch', label: 'Ready for Dispatch', readyForDispatch: true }, { key: 'closed', label: 'Task Closed', done: true },
  ];
  const task = { kind: 'ask_assembling_edd', status: 'asked', brief: { models: 'A-1, B-2' }, routing: { byProduction: true, models: ['A-1', 'B-2'], receivedModels: { 'B-2': '2026-10-24' } } };
  assert.equal(goodsAwaited(task, 'A-1'), true);
  assert.equal(goodsAwaited(task, 'B-2'), false);
  assert.deepEqual(statusesForModel(task, statuses, 'A-1').map((step) => step.key), ['asked', 'goods_received', 'closed']);
  /* Goods in: Assembly's workflow, up to Ready for Dispatch — which closes the model, so no Task Closed after it. */
  assert.deepEqual(statusesForModel(task, statuses, 'B-2').map((step) => step.key), ['asked', 'goods_received', 'in_queue', 'started', 'ready_dispatch']);
  assert.deepEqual(goodsOf(task, 'B-2', statuses, 'goods_received'), { stage: 'received', came: '2026-10-24' });
  assert.equal(goodsOf(task, 'B-2', statuses, 'started').stage, 'in_queue', 'started straight away is in the work queue');
  assert.equal(goodsOf(task, 'A-1', statuses).stage, 'to_come');
  /* Nothing has come: the whole task offers only those. */
  assert.deepEqual(statusesFor({ ...task, routing: { ...task.routing, receivedModels: {} } }, statuses).map((step) => step.key), ['asked', 'goods_received', 'closed']);
  /* A task Dispatch asked by hand (not routed by Production) is not held. */
  assert.deepEqual(statusesFor({ ...task, routing: {} }, statuses).map((step) => step.key), ['asked', 'goods_received', 'in_queue', 'started', 'ready_dispatch']);
});

test('Production: Ready for Dispatch is not offered for a model that goes on to Printing or Assembly', async () => {
  const { statusesForModel } = await import('../src/utils/edd.js');
  const statuses = [{ key: 'started', label: 'Started' }, { key: 'handed_printing', label: 'Handed to Printing', handsTo: 'printing' }, { key: 'ready_dispatch', label: 'Ready for Dispatch', readyForDispatch: true }];
  const task = { kind: 'ask_edd', routing: { handsTo: ['printing'], models: [{ model: 'A-1', printing: true }, { model: 'C-3' }] } };
  assert.deepEqual(statusesForModel(task, statuses, 'A-1').map((step) => step.key), ['started', 'handed_printing']);
  assert.deepEqual(statusesForModel(task, statuses, 'C-3').map((step) => step.key), ['started', 'ready_dispatch']);
});

test('the hand-over date form says, model by model, whether its date is a hand-over or the completion date', () => {
  const edd = readFileSync(new URL('../src/components/TaskEdd.jsx', import.meta.url), 'utf8');
  assert.match(edd, /hintOf=\{\(model\) => dateLabelFor\(todo, 'Completion date', model\)\}/);
  assert.match(edd, /const endsHere = modelsOfTask\(todo\)\.filter\(\(model\) => routeEndOf\(todo, model\) === 'dispatch'\);/);
  assert.match(edd, /date is the completion date, then Ready for Dispatch\./);
});
