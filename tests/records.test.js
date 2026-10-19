/**
 * The plant's records [pages/QcRecord*.jsx, Machines.jsx, MachineDetail.jsx, MouldRuns.jsx,
 * DispatchRegister.jsx, components/MouldHistory.jsx, MaintenanceForm.jsx]: QC test sheets with
 * breaking strength worked out as typed, machines and their maintenance, mould runs and the shot
 * life on the mould, and the dispatch register with its download.
 *
 *   node --test tests/records.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fillFrom, workOut } from '../src/utils/records.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('breaking strength and the other tests are worked out from the figures, as the server does', () => {
  const worked = workOut({
    breaking: { requiredKg: 15, samplesKg: [18, 17.5, 19, 16] },
    hook: { pullRequiredKg: 8, pullActualKg: 7 },
    clip: { gripRequiredKg: 1.5, gripActualKg: 2 },
    weight: { target: 30, tolerance: 1, actual: 31.5 },
    hangLoad: { deflectionMm: 4, allowedDeflectionMm: 6 },
    measurements: [{ name: 'Width', target: 400, tolerance: 2, actual: 399 }, { name: 'Hook height', target: 60, actual: '' }],
  });
  assert.deepEqual(worked.breaking, { minKg: 16, maxKg: 19, avgKg: 17.6, result: 'pass' });
  assert.equal(worked.hook, 'fail');
  assert.equal(worked.clip, 'pass');
  assert.equal(worked.weight, 'fail', 'outside the tolerance');
  assert.equal(worked.hang, 'pass');
  assert.deepEqual(worked.measurements, ['pass', undefined]);
  /* The lowest sample decides, not the average. */
  assert.equal(workOut({ breaking: { requiredKg: 15, samplesKg: [30, 30, 14.9] } }).breaking.result, 'fail');
  assert.equal(workOut({ breaking: { samplesKg: [] } }).breaking.result, undefined);
});

test('the QC form covers resin, mould, moulding type, size, print, hook and clips, and refuses a pass against its own figures', () => {
  const form = read('pages/QcRecordForm.jsx');
  for (const section of ['What was checked', 'Resin', 'Hook', 'Clips', 'Print', 'Weight and measurements', 'Strength tests', 'Packing', 'Sample and defects', 'Verdict']) {
    assert.match(form, new RegExp(`title="\\d+ · ${section}"`), section);
  }
  for (const field of ['resin.grade', 'resin.batch', 'resin.masterbatchPercent', 'resin.regrindPercent', 'hook.pullActualKg', 'clip.gripActualKg', 'print.type', 'mouldingType', 'size', 'breaking.samples', 'hangLoad.deflectionMm']) {
    assert.ok(form.includes(`'${field}'`), field);
  }
  assert.match(form, /const off = verdict\.value === 'passed' && !cleanPass;/);
  assert.match(form, /sheet\.verdict === 'passed_with_deviation' && sheet\.remarks\.trim\(\)\.length < 5/);
  assert.match(form, /rejected > 0 && !sheet\.defects\.length/);
  assert.match(form, /navigate\(`\/qc-records\/\$\{made\._id\}`, \{ replace: true \}\)/);
  /* Opened from a task, an enquiry or a mould, it starts filled. */
  for (const key of ['stage', 'enquiry', 'task', 'run', 'mould', 'machine']) assert.match(form, new RegExp(`params\\.get\\('${key}'\\)`));
});

test('a QC record is approved by someone else, and downloads as a test report', () => {
  const detail = read('pages/QcRecordDetail.jsx');
  assert.match(detail, /const mayApprove = canWrite\('quality'\) && !record\.approvedAt && !mine;/);
  assert.match(detail, /qcRecordsApi\.certificate\(record\)/);
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /\/qc-records\/new\?task=\$\{todo\._id\}/);
  assert.match(workflow, /QC_KINDS\.includes\(todo\.kind\) && canWrite\('quality'\)/);
});

test('machines keep their maintenance; a mould shows its shot life, runs, maintenance and QC', () => {
  const machine = read('pages/MachineDetail.jsx');
  assert.match(machine, /<MaintenanceForm open=\{recording\} asset="machine"/);
  assert.match(machine, /<MaintenanceTable rows=\{maintenance\}/);
  assert.match(machine, /<RunsTable rows=\{runs\}/);
  const history = read('components/MouldHistory.jsx');
  assert.match(history, /mouldRunsApi\.mouldHistory\(mould\._id\)/);
  assert.match(history, /life\.maintenanceDue/);
  assert.match(history, /<MaintenanceForm open=\{recording\} asset="mould"/);
  assert.match(read('pages/MouldDetail.jsx'), /<MouldHistory key=\{mould\.updatedAt\} mould=\{mould\} \/>/);
  assert.match(read('components/MouldForm.jsx'), /register\('maintenanceEveryShots'\)/);
  const form = read('components/MaintenanceForm.jsx');
  assert.match(form, /backInService: !values\.stillDown/);
  assert.match(form, /required minLength=\{3\}/);
});

test('runs start and finish; the counter cannot go backwards', () => {
  const runs = read('pages/MouldRuns.jsx');
  assert.match(runs, /mouldRunsApi\.start\(/);
  assert.match(runs, /mouldRunsApi\.finish\(\{\s*id: run\._id/);
  assert.match(runs, /disabled=\{busy \|\| \(shots != null && shots < 0\) \|\| rejectsOver\}/);
  assert.match(runs, /const mayRun = canWrite\('production'\);/);
});

test('the dispatch register lists and downloads, and every screen is reachable', () => {
  const register = read('pages/DispatchRegister.jsx');
  assert.match(register, /dispatchRegisterApi\.list\(\{ from, to \}\)/);
  assert.match(register, /dispatchRegisterApi\.csv\(\{ from, to \}\)/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /api\.post\('\/qc-records', payload\)/);
  assert.match(endpoints, /api\.post\(`\/qc-records\/\$\{id\}\/approve`\)/);
  assert.match(endpoints, /api\.post\(`\/mould-runs\/\$\{id\}\/finish`, payload\)/);
  assert.match(endpoints, /api\.get\(`\/moulds\/\$\{mouldId\}\/history`\)/);
  assert.match(endpoints, /save\('\/dispatch-register', \{ \.\.\.params, format: 'csv' \}/);
  const app = read('App.jsx');
  for (const path of ['qc-records', 'qc-records/new', 'qc-records/:id', 'machines', 'machines/:id', 'mould-runs', 'dispatch/register']) assert.match(app, new RegExp(`path="${path}"`), path);
  assert.match(app, /\[\]\.concat\(moduleKey\)\.some\(canRead\)/);
  const layout = read('components/Layout.jsx');
  assert.match(layout, /\{ to: '\/qc-records', label: 'QC records' \}/);
  assert.match(layout, /\{ to: '\/machines', label: 'Machines & maintenance', module: \['production', 'moulds'\] \}/);
  assert.match(layout, /\{ to: '\/dispatch\/register', label: 'Dispatch register' \}/);
  assert.match(layout, /\[\]\.concat\(grant\)\.some\(canRead\)/);
});

test('the SO page carries its QC records and its dispatch details; the QC form picks the SO and its line', () => {
  const page = read('pages/OrderDetail.jsx');
  assert.match(page, /\{released && <OrderDispatchDetails order=\{order\} \/>\}/);
  assert.match(page, /\{released && canRead\('quality'\) && <OrderQcRecords order=\{order\} \/>\}/);
  const qc = read('components/OrderQcRecords.jsx');
  assert.match(qc, /qcRecordsApi\.onOrder\(order\._id\)/);
  assert.match(qc, /\/qc-records\/new\?order=\$\{order\._id\}/);
  assert.match(qc, /&orderLine=\$\{line\}/);
  const dispatch = read('components/OrderDispatchDetails.jsx');
  assert.match(dispatch, /orderDispatchDetails\(order\._id\)/);
  assert.match(dispatch, /<TaskPdfLink file=\{row\.lrCopy\} \/>/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /api\.get\(`\/orders\/\$\{orderId\}\/qc-records`\)/);
  assert.match(endpoints, /api\.get\(`\/orders\/\$\{orderId\}\/dispatch-details`\)/);
  const form = read('pages/QcRecordForm.jsx');
  assert.match(form, /ordersApi\.list\(\{ enquiry: sheet\.enquiry, open: 'true', limit: 20 \}\)/);
  assert.match(form, /params\.get\('orderLine'\)/);
  assert.match(form, /qcRecordsApi\.prefill\(query\)/);
  assert.match(form, /const out = fillFrom\(current, answer, before\);/);
  assert.match(read('pages/QcRecordDetail.jsx'), /label: 'Sales order'/);
  assert.match(read('pages/DispatchRegister.jsx'), /to=\{`\/orders\/\$\{row\.orderId\}`\}/);
});

test('the prefill fills empty boxes, swaps its own figures when the line changes, and keeps what was typed', () => {
  const blank = {
    enquiry: '', order: '', orderLine: '', modelNumber: '', size: '', mould: '', mouldingType: '', cavities: '', lotSize: '',
    resin: { material: '', name: '', colour: '', supplier: '' }, hook: { type: '', finish: '' }, clip: { type: '' },
    print: { type: '', colour: '', artwork: '' }, weight: { target: '', tolerance: '', actual: '' },
    measurements: [{ name: 'Width', unit: 'mm', target: '', tolerance: '', actual: '' }],
  };
  const one = fillFrom(blank, {
    enquiry: { _id: 'e1' }, order: { _id: 'o1' }, lineKind: 'order', line: 'l1',
    fields: { modelNumber: 'NH-400', size: '400 mm', resin: { name: 'PP', colour: 'Black' }, hook: { type: 'swivel' }, weight: { target: 31 }, lotSize: 6000, measurements: [{ name: 'Width', unit: 'mm', target: 400 }] },
  });
  const first = one.sheet;
  assert.deepEqual([first.enquiry, first.order, first.orderLine], ['e1', 'o1', 'l1']);
  assert.equal(first.modelNumber, 'NH-400');
  assert.equal(first.resin.colour, 'Black');
  assert.equal(first.weight.target, 31);
  assert.equal(first.measurements[0].target, 400);

  /* The inspector changes the colour; another line is picked. */
  const typed = { ...first, resin: { ...first.resin, colour: 'Jet black' }, orderLine: 'l2' };
  const two = fillFrom(typed, {
    enquiry: { _id: 'e1' }, order: { _id: 'o1' }, lineKind: 'order', line: 'l2',
    fields: { modelNumber: 'NH-500', resin: { name: 'HIPS', colour: 'White' }, lotSize: 2000 },
  }, one.filled);
  /* Pure: run twice on the same input, the same answer (React runs updaters twice in development). */
  assert.deepEqual(fillFrom(typed, { lineKind: 'order', fields: { modelNumber: 'NH-500' } }, one.filled).sheet.modelNumber, 'NH-500');
  const second = two.sheet;
  assert.equal(second.modelNumber, 'NH-500', 'its own figure swapped');
  assert.equal(second.resin.name, 'HIPS');
  assert.equal(second.resin.colour, 'Jet black', 'what was typed stays');
  assert.equal(second.size, '', 'the old line’s size is not left behind');
  assert.equal(second.hook.type, '');
  assert.equal(second.lotSize, 2000);
});

test('the enquiry page shows its SOs, QC records and dispatch details', () => {
  const panel = read('components/EnquiryRecords.jsx');
  assert.match(panel, /enquiryRecords\(enquiry\._id\)/);
  assert.match(panel, /<DispatchBody data=\{data\.dispatch\}/);
  assert.match(panel, /\/qc-records\/new\?enquiry=\$\{enquiry\._id\}/);
  assert.match(read('pages/EnquiryDetail.jsx'), /<EnquiryRecords enquiry=\{enquiry\} \/>/);
  assert.match(read('components/OrderDispatchDetails.jsx'), /export function DispatchBody\(\{ data, showOrder = false \}\)/);
  assert.match(read('api/endpoints.js'), /api\.get\(`\/enquiries\/\$\{enquiryId\}\/records`\)/);
  assert.match(read('api/endpoints.js'), /api\.get\('\/qc-records\/prefill', \{ params, feedback: false \}\)/);
});

test('AQL plans match the standard table, and the new tests work out as the server does', async () => {
  const { aqlPlan } = await import('../src/utils/records.js');
  assert.deepEqual(aqlPlan(10000, 2.5), { letter: 'L', sampleSize: 200, accept: 10, reject: 11 });
  assert.deepEqual(aqlPlan(500, 1), { letter: 'H', sampleSize: 50, accept: 1, reject: 2 });
  assert.deepEqual(aqlPlan(30, 0.65), { letter: 'D', sampleSize: 20, accept: 0, reject: 1 }, 'the arrow points down to the 20-piece plan');
  assert.equal(aqlPlan(200000, 6.5).sampleSize, 200, 'and up');
  assert.equal(aqlPlan(1, 2.5), null);
  const worked = workOut({
    hookTurns: { required: 500, achieved: 420 },
    shrinkage: { mouldMm: 402, partMm: 400, maxPercent: 1 },
    resinChecks: { moisturePercent: 0.1, moistureMaxPercent: 0.2, mfi: 14, mfiMin: 8, mfiMax: 12 },
    packing: { piecesPerCarton: 200, piecesFound: 200, labels: 'fail' },
    aql: 2.5, lotSize: 10000, rejected: 12,
  });
  assert.equal(worked.hookTurns, 'fail');
  assert.deepEqual([worked.shrinkagePercent, worked.shrinkage], [0.5, 'pass']);
  assert.deepEqual([worked.moisture, worked.mfi], ['pass', 'fail']);
  assert.equal(worked.packing, 'fail', 'labels wrong');
  assert.equal(worked.aql.result, 'fail');
});

test('the prefill brings the standards in, and the form has the new tests, packing and AQL', () => {
  const filled = fillFrom({ enquiry: '', order: '', orderLine: '', breaking: { requiredKg: '', samples: '' }, measurements: [{ name: 'Width', unit: 'mm', target: '', tolerance: '', actual: '' }] }, {
    lineKind: 'order', fields: { breaking: { requiredKg: 18 }, resinChecks: { moistureMaxPercent: 0.2 }, aql: 2.5, standardsFrom: 'Standards: buyer X', measurements: [{ name: 'Width', unit: 'mm', target: 400, tolerance: 2 }] },
  }).sheet;
  assert.equal(filled.breaking.requiredKg, 18);
  assert.equal(filled.resinChecks.moistureMaxPercent, 0.2, 'a section the sheet had no object for yet');
  assert.equal(filled.aql, 2.5);
  assert.equal(filled.measurements[0].tolerance, 2);
  const form = read('pages/QcRecordForm.jsx');
  for (const field of ['resinChecks.moisturePercent', 'resinChecks.mfi', 'hookTurns.achieved', 'shrinkage.partMm', 'uv.hours', 'packing.piecesFound', 'cartonDrop.heightCm']) assert.ok(form.includes(`'${field}'`), field);
  assert.match(form, /const cleanPass = !failed\.length && rejected <= \(worked\.aql \? worked\.aql\.accept : 0\);/);
  assert.match(form, /AQL_LEVELS\.map/);
  assert.match(read('components/MouldForm.jsx'), /<QcStandardsFields register=\{register\} who="model"/);
  assert.match(read('pages/Customers.jsx'), /<QcStandardsFields register=\{register\} who="buyer"/);
  assert.match(read('components/QcStandardsFields.jsx'), /register\(`qcStandards\.\$\{key\}`\)/);
});

test('dispatch sees the QC verdict and is never held; buyers can be asked for their location', () => {
  const flag = read('components/QcFlag.jsx');
  assert.match(flag, /rejected: \{ label: 'QC rejected'/);
  assert.match(flag, /askCustomerLocation\(customerId\)/);
  assert.match(read('components/TripPlanner.jsx'), /\{stop\.qc && <p className="mt-1"><QcFlag qc=\{stop\.qc\} \/><\/p>\}/);
  assert.match(read('pages/TripDetail.jsx'), /<QcFlag qc=\{stop\.qc\} \/>/);
  assert.match(read('components/OrderDispatchDetails.jsx'), /<QcFlag qc=\{request\.qc\} \/>/);
  assert.match(read('components/TripPlanner.jsx'), /canPlan && !stop\.site && stop\.customer\?\._id && <p className="mt-1"><AskLocation/);
  assert.match(read('pages/CustomerDetail.jsx'), /!customer\.site && mayWrite/);
  assert.match(read('api/endpoints.js'), /api\.post\(`\/customers\/\$\{customerId\}\/ask-location`\)/);
});

test('reject report, runs on an SO line, the resin store, and the SO on a task', () => {
  assert.match(read('pages/QcReport.jsx'), /qcReportApi\(\{ from, to \}\)/);
  assert.match(read('App.jsx'), /path="qc-records\/report"/);
  assert.match(read('components/Layout.jsx'), /\{ to: '\/qc-records\/report', label: 'Reject report', module: \['quality', 'production'\] \}/);
  const runs = read('pages/MouldRuns.jsx');
  assert.match(runs, /orderLine: values\.orderLine \|\| undefined/);
  assert.match(runs, /material: values\.resinMaterial \|\| undefined/);
  assert.match(read('components/RecordTables.jsx'), /run\.productionNote/);
  const stock = read('components/StockDialog.jsx');
  assert.match(stock, /materialStock\.move\(\{ id: material\._id, kind: values\.kind, kg: Number\(values\.kg\)/);
  assert.match(read('pages/Materials.jsx'), /<StockDialog material=\{stocking\}/);
  assert.match(read('components/MaterialForm.jsx'), /register\('reorderKg'\)/);
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /\.\.\.\(order \? \{ order \} : \{\}\)/);
  assert.match(dialog, /orders\.length > 1 &&/);
  assert.match(read('components/Combobox.jsx'), /fallbackLabel/);
});

test('several open SOs: every form asks which, and the planner can ask unpinned buyers for their location in one go', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /\|\| \(orders\.length > 1 && !order && !fromTask && !team\);/);
  assert.match(dialog, /<option value="">Pick the SO…<\/option>/);
  const form = read('pages/QcRecordForm.jsx');
  assert.match(form, /prefill\?\.orderChoices\?\.length > 0 && !sheet\.order/);
  assert.match(read('pages/MouldRuns.jsx'), /disabled=\{busy \|\| \(!workOrder && \(!values\.mould \|\| needsOrder\)\)\}/);
  const planner = read('components/TripPlanner.jsx');
  assert.match(planner, /canPlan && plan\.unpinned\?\.length > 0 && <AskAllUnpinned buyers=\{plan\.unpinned\} \/>/);
  assert.match(planner, /await askCustomerLocation\(buyer\._id\)/);
});

test('audit: one form for Quality, a run from the Production task, and Admin\'s setup checklist', () => {
  const quality = read('components/OrderQuality.jsx');
  assert.match(quality, /to=\{`\/qc-records\/new\?order=\$\{order\._id\}/);
  assert.match(quality, /Quick check on a consignment/);
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /todo\.kind === 'ask_edd' && todo\.enquiry && canWrite\('production'\)/);
  assert.match(workflow, /to=\{`\/mould-runs\?start=1&enquiry=/);
  const runs = read('pages/MouldRuns.jsx');
  assert.match(runs, /params\.get\('start'\) \? \{ enquiry: params\.get\('enquiry'\)/);
  assert.match(runs, /enquiry: initial\.enquiry \|\| ''/);
  assert.match(runs, /fallbackLabel=\{values\.enquiry && values\.enquiry === initial\.enquiry \? initial\.label : undefined\}/);
  assert.match(workflow, /&label=\$\{encodeURIComponent/);
  /* The "Finish setting up" card was taken off the dashboard at the plant's request. */
  assert.doesNotMatch(read('pages/OverviewDashboard.jsx'), /SetupChecklist|Finish setting up/);
  assert.match(read('pages/QcRecordDetail.jsx'), /label: 'SO inspection'/);
});

test('a team task types its model and material, needs no instruction, and a coster lands on the quotation raised', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  /* A dropdown from the register that narrows as you type; a model or material it does not know is kept as typed. */
  assert.match(dialog, /<RegisterPick field=\{field\} register=\{register\}/);
  assert.match(dialog, /onCreate=\{\(typed\) => \{ if \(typed\) onChange\(typed\); \}\}/);
  assert.doesNotMatch(dialog, /Choose from the \$\{field\.register/, 'the fixed dropdown is gone');
  /* The instruction is optional on a team task; the answers say what to do. */
  assert.match(dialog, /const mustExplain = \(noteNeeded\(button, answers\) \|\| Boolean\(fromTask\)\) && note\.trim\(\)\.length < 3;/);
  assert.match(dialog, /required=\{noteNeeded\(button, answers\) \|\| Boolean\(fromTask\)\}/);
  /* Create Quotation raised the costing sheet: whoever may cost it is taken there. */
  assert.match(dialog, /if \(sent\.quotation\?\._id && canWrite\('pricing'\)\) navigate\(`\/quotations\/\$\{sent\.quotation\._id\}`\);/);
});

test('the customer page lists the buyer’s quotations — models and rates, never the cost — with a way to the full list', () => {
  const page = readFileSync(new URL('../src/pages/CustomerDetail.jsx', import.meta.url), 'utf8');
  assert.match(page, /title=\{`Quotations \(\$\{timeline\.quotationTotal \?\? timeline\.quotations\.length\}\)`\}/);
  assert.match(page, /\{timeline\.quotations && \(/, 'only where the server sent the strand');
  assert.match(page, /to=\{`\/quotations\?customer=\$\{customer\._id\}`\}/);
  assert.match(page, /to=\{`\/quotations\/\$\{quotation\._id\}`\}/);
  assert.match(page, /formatCurrency\(line\.unitPrice\)/);
  assert.doesNotMatch(page, /totalCost|materialCost|markup/, 'nothing of the cost on a buyer’s page');
  assert.match(readFileSync(new URL('../src/pages/Quotations.jsx', import.meta.url), 'utf8'), /customer: params\.get\('customer'\) \|\| undefined/, 'the list takes the buyer');
});
