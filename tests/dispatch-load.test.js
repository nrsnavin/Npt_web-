/**
 * A load sent on a Dispatch request [components/DispatchLoadDialog.jsx]: the dispatch statuses
 * open the form — models ticked (Select all), pieces of each, the mode of travel, and the LR copy,
 * proof of delivery or signed receipt uploaded with it. The app picks Part / Fully Dispatched from
 * what has gone, and Fully Dispatched offers to close the task. Reception sends the LR copy Dispatch uploaded.
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
  assert.match(workflow, /<DispatchLoadDialog\s+todo=\{todo\}\s+onClose=/);
});

test('models ticked with Select all — the ready ones first when it goes model by model — pieces of each, the mode, and the paper it needs', () => {
  assert.match(dialog, />\s*Select all ready\s*</);
  assert.match(dialog, /const starts = \(row\) => \(left\(row\) > 0 \|\| !row\.ordered\) && row\.ready;/, 'only ready models start ticked, whatever the plan');
  assert.match(dialog, /aria-label=\{`Pieces of \$\{row\.model\} in this load`\}/);
  assert.match(dialog, /role="radiogroup" aria-label="Mode of travel"/);
  assert.match(dialog, /<input type="file" required accept=\{TYPES\.join\(','\)\}/);
  assert.match(dialog, /const ready = chosen\.length > 0 && !missingPieces && how && file && !tooBig && !wrongType;/);
  assert.match(read('api/endpoints.js'), /dispatchLoad: \(\{ id, mode, lines, note, file \}\) =>/, 'no status — the server picks it');
});

test('only a model ready can go: one not ready cannot be ticked and names the team that has it', () => {
  assert.match(dialog, /<input type="checkbox" disabled=\{!row\.ready \|\| togetherWaiting\.length > 0\} checked=\{Boolean\(ticked\[row\.model\]\) && row\.ready && !togetherWaiting\.length\}/);
  assert.match(dialog, /not ready — \{whereNow\(row\)\}/);
  /* Where the model is now — "in Production · EDD Request Received", not the team that finishes it. */
  assert.match(dialog, /const whereNow = \(row\) => `\$\{row\.waitingOn === 'production' \? 'in' : 'with'\} \$\{WAITING_WORDS\[row\.waitingOn\] \|\| 'the plant'\}\$\{row\.waitingStatus \? ` · \$\{row\.waitingStatus\}` : ''\}`;/);
  assert.match(dialog, /const chosen = togetherWaiting\.length \? \[\] : models\.filter\(\(row\) => ticked\[row\.model\] && row\.ready\);/);
  assert.match(dialog, /Nothing is ready to dispatch yet/);
});

test('the app says what the load makes it; only Fully Dispatched offers to close the task', () => {
  assert.match(dialog, /const outcome = models\.length && !stillToGo\.length \? 'Fully Dispatched' : 'Part Quantity Dispatched';/);
  assert.match(dialog, /This load makes it \{outcome\}/);
  assert.match(dialog, /Still to go: \{stillToGo\.map/);
  assert.match(dialog, /if \(saved\.status === 'fully_dispatched' && !saved\.completed\) setOffer\(saved\);/);
  assert.match(dialog, /<CloseTaskPrompt/);
  assert.doesNotMatch(dialog, /status: step\.key/, 'Dispatch never picks the status');
});

test('Reception sends the LR copy Dispatch uploaded — from the task and from its LR row', () => {
  assert.match(workflow, /button\.form\.sendResult && todo\.resultFile && !resultSent\(todo, statuses\)/);
  assert.match(workflow, /workspace\.todos\.sendResult\(todo\._id\)/);
  const tables = read('components/DeskTables.jsx');
  assert.match(tables, /\{mayWork && task\.resultFile && !sent && \(/);
  assert.match(tables, /\{sending \? 'Sending…' : 'Send to buyer'\}/);
});

test('all together: nothing can be ticked until every model is ready; each model as it is ready: the ready ones go', () => {
  assert.match(dialog, /const togetherWaiting = sheet && sheet\.plan !== 'by_model' \? models\.filter\(\(row\) => !row\.ready\) : \[\];/);
  assert.match(dialog, /const goable = togetherWaiting\.length \? \[\] :/);
  assert.match(dialog, /This order goes all together — nothing is dispatched until every model is ready/);
});
