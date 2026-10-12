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
  for (const section of ['What was checked', 'Resin', 'Hook', 'Clips', 'Print', 'Weight and measurements', 'Strength tests', 'Sample and defects', 'Verdict']) {
    assert.match(form, new RegExp(`title="\\d · ${section}"`), section);
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
  assert.match(runs, /disabled=\{busy \|\| \(shots != null && shots < 0\)\}/);
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
  assert.match(form, /ordersApi\.list\(\{ enquiry: sheet\.enquiry, limit: 20 \}\)/);
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
