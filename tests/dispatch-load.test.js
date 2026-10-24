/**
 * A load sent on a Dispatch request [components/DispatchLoadDialog.jsx]: the dispatch statuses
 * open the form — models ticked (Select all), pieces of each, the mode of travel, and the LR copy,
 * proof of delivery or signed receipt uploaded with it — and Fully Dispatched or Dispatched offers
 * to close the task. Reception sends the LR copy Dispatch uploaded.
 *
 *   node --test tests/dispatch-load.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const dialog = read('components/DispatchLoadDialog.jsx');
const workflow = read('components/TaskWorkflow.jsx');

test('the dispatch statuses open the dispatch form, never a bare move', () => {
  assert.match(workflow, /if \(step\.loads\) return setLoading\(step\);/);
  assert.match(workflow, /<DispatchLoadDialog\s+todo=\{todo\}\s+step=\{loading\}/);
});

test('models ticked with Select all — the ready ones first when it goes model by model — pieces of each, the mode, and the paper it needs', () => {
  assert.match(dialog, />\s*Select all\s*</);
  assert.match(dialog, /const starts = \(row\) => \(left\(row\) > 0 \|\| !row\.ordered\) && \(data\.plan !== 'by_model' \|\| row\.ready\);/);
  assert.match(dialog, /aria-label=\{`Pieces of \$\{row\.model\} in this load`\}/);
  assert.match(dialog, /role="radiogroup" aria-label="Mode of travel"/);
  assert.match(dialog, /<input type="file" required accept=\{TYPES\.join\(','\)\}/);
  assert.match(dialog, /const ready = chosen\.length > 0 && !missingPieces && how && file && !tooBig && !wrongType;/);
  assert.match(read('api/endpoints.js'), /dispatchLoad: \(\{ id, status, mode, lines, note, file \}\) =>/);
});

test('Fully Dispatched or Dispatched offers to close the task', () => {
  assert.match(dialog, /const closes = Boolean\(step\.next\) && step\.key !== 'part_dispatched';/);
  assert.match(dialog, /if \(closes && !saved\.completed\) setOffer\(saved\);/);
  assert.match(dialog, /<CloseTaskPrompt/);
});

test('Reception sends the LR copy Dispatch uploaded — from the task and from its LR row', () => {
  assert.match(workflow, /button\.form\.sendResult && todo\.resultFile && !resultSent\(todo, statuses\)/);
  assert.match(workflow, /workspace\.todos\.sendResult\(todo\._id\)/);
  const tables = read('components/DeskTables.jsx');
  assert.match(tables, /\{mayWork && task\.resultFile && !sent && \(/);
  assert.match(tables, /\{sending \? 'Sending…' : 'Send to buyer'\}/);
});
