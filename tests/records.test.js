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
import { workOut } from '../src/utils/records.js';

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
