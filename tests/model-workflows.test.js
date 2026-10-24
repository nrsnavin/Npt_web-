/**
 * One workflow per model on a Production, Printing or Assembly task of several models
 * [components/TaskWorkflow.jsx `ModelWorkflows`; utils/edd.js]: each model has its own status,
 * next step and list of moves, and a move goes for that model alone.
 *
 *   node --test tests/model-workflows.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { modelThrough, nextStepForModel, routeOf, statusesForModel } from '../src/utils/edd.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const PRODUCTION = [
  { key: 'received', label: 'EDD Request Received' },
  { key: 'started', label: 'Production Started' },
  { key: 'mould_issue', label: 'Mould Issue', issue: true },
  { key: 'completed', label: 'Production Completed' },
  { key: 'handed_printing', label: 'Handed to Printing', handsTo: 'printing' },
  { key: 'handed_assembly', label: 'Handed to Assembly', handsTo: 'assembling' },
  { key: 'ready_dispatch', label: 'Ready for Dispatch', readyForDispatch: true },
  { key: 'closed', label: 'Task Closed', done: true },
];
const task = {
  kind: 'ask_edd',
  status: 'started',
  routing: { decidedAt: '2026-10-01', handsTo: ['printing', 'assembling'], models: [{ model: 'CRF25', printing: true }, { model: 'CRF30', assembly: true }, { model: 'CRF40' }] },
  modelStatuses: [{ model: 'CRF25', status: 'completed' }],
};

test('each model is offered only the hand-overs it goes to', () => {
  const keys = (model) => statusesForModel(task, PRODUCTION, model).map((step) => step.key);
  assert.ok(keys('CRF25').includes('handed_printing') && !keys('CRF25').includes('handed_assembly'), 'printed, not assembled straight from moulding');
  assert.ok(!keys('CRF30').includes('handed_printing') && keys('CRF30').includes('handed_assembly'));
  assert.ok(!keys('CRF40').includes('handed_printing') && !keys('CRF40').includes('handed_assembly'), 'nothing follows moulding');
  assert.deepEqual(routeOf(task, 'CRF30'), { model: 'CRF30', assembly: true });
  /* Printing's task: a model with assembly after it is handed on; one without is not. */
  const printing = { kind: 'ask_printing', routing: { models: [{ model: 'CRF25', printing: true, assembly: true }, { model: 'CRF26', printing: true }] } };
  assert.ok(statusesForModel(printing, PRODUCTION, 'CRF25').some((step) => step.key === 'handed_assembly'));
  assert.ok(!statusesForModel(printing, PRODUCTION, 'CRF26').some((step) => step.key === 'handed_assembly'));
});

test('the next step is the model’s own: past Completed it is the hand-over it goes to, or Ready for Dispatch', () => {
  assert.equal(nextStepForModel(task, PRODUCTION, 'CRF25', 'completed').key, 'handed_printing');
  assert.equal(nextStepForModel(task, PRODUCTION, 'CRF30', 'completed').key, 'handed_assembly');
  assert.equal(nextStepForModel(task, PRODUCTION, 'CRF40', 'completed').key, 'ready_dispatch');
  assert.equal(nextStepForModel(task, PRODUCTION, 'CRF40', 'started').key, 'completed', 'an issue is never the next step');
  assert.equal(nextStepForModel(task, PRODUCTION, 'CRF40', 'closed'), null);
  assert.equal(modelThrough(PRODUCTION, 'handed_printing'), true);
  assert.equal(modelThrough(PRODUCTION, 'completed'), false);
});

test('the workflow draws one strip per model, each moving on its own; every model together on request', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /function ModelWorkflows\(\{ todo, form, statuses, offered, noDates, onMoved \}\)/);
  assert.match(workflow, /aria-label="Workflow by model"/);
  assert.match(workflow, /aria-label=\{`Change status of \$\{row\.model\}`\}/);
  assert.match(workflow, /fixedModels=\{\[row\.model\]\}/, 'a move from a strip is for that model alone');
  assert.match(workflow, /\.\.\.\(fixedModels \|\| \(byModel && picked\.length < allModels\.length\) \? \{ models: picked \} : \{\}\)/);
  assert.match(workflow, /\{byModel && !fixedModels && \(/, 'no tick-boxes on one model’s own form');
  assert.match(workflow, /\{movesByModel\(todo\) && !waiting\.length && \(/);
  assert.match(workflow, /\{allAtOnce \? 'Hide the move for every model' : 'Move every model together'\}/);
  /* A model gone on from this team (handed over, or ready for dispatch from the last team) is closed here, and its move alerts [server: closesModel]. */
  assert.match(workflow, /const closed = Boolean\(current\?\.done \|\| current\?\.handsTo \|\| current\?\.readyForDispatch\);/);
  assert.match(workflow, /closed here for this model/);
  assert.match(workflow, /else if \(step\.handsTo \|\| step\.readyForDispatch\) toast\(`\$\{model\} closed here`/);
});

test('Printing’s and Assembly’s strips say where each model’s goods are, and whether a ready model goes on its own', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const after = todo\.kind !== 'ask_edd';/);
  assert.match(workflow, /const received = todo\.routing\?\.receivedModels \|\| \{\};/);
  assert.match(workflow, /`Goods came \$\{formatDate\(received\[row\.model\]\)\} from \$\{ROUTE_LABELS\[fromOf\(route\)\]\}\$\{goodsOf\(todo, row\.model, statuses, row\.status\)\?\.stage === 'received' \? ' — not yet in the work queue' : ''\}`/);
  /* The goods coming in, on every Printing / Assembly task: received with Add to work queue, and what is still to come. */
  assert.match(workflow, /<GoodsIn todo=\{todo\} statuses=\{button\?\.form\?\.statuses \|\| \[\]\} onMoved=\{moved\} \/>/);
  assert.match(workflow, /onMoved\(await workspace\.todos\.workQueue\(\{ id: todo\._id, models: toQueue\.map\(\(entry\) => entry\.model\) \}\)\)/);
  assert.match(workflow, /`Still with \$\{ROUTE_LABELS\[fromOf\(route\)\]\}/);
  /* Assembly takes a printed model from Printing, an unprinted one from Production. */
  assert.match(workflow, /const fromOf = \(route\) => \(todo\.kind === 'ask_assembling_edd' && route\?\.printing \? 'printing' : 'production'\);/);
  assert.match(workflow, /const eachAsReady = todo\.enquiry\?\.dispatchPlan\?\.mode === 'by_model';/);
  assert.match(workflow, /\{current\?\.readyForDispatch && todo\.enquiry && \(/);
  assert.match(workflow, /Goes to Dispatch as soon as it is ready — dispatch plan: each model as it is ready\./);
  assert.match(workflow, /Waits for the other models — dispatch plan: all together\. Marketing or Admin can change it on the enquiry\./);
});
