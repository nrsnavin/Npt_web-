/**
 * The offer to close a task with nothing left on it [components/CloseTaskPrompt.jsx; server:
 * taskClosable.service `closable`]: after a move, on the task, after a QC record, on the card.
 *
 *   node --test tests/close-task.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the prompt closes with the task’s own Task Closed, with a remark, or keeps it open', () => {
  const prompt = read('components/CloseTaskPrompt.jsx');
  assert.match(prompt, /workspace\.todos\.status\(\{ id: task\._id, status: 'closed', note: note\.trim\(\) \}\)/);
  assert.match(prompt, /title="Close this task\?"/);
  assert.match(prompt, />Keep it open</);
  assert.match(prompt, /\{busy \? 'Closing…' : 'Close the task'\}/);
  assert.match(prompt, /export const offersClose = \(task\) => Boolean\(task && !task\.completed && task\.closable\?\.why\);/);
});

test('a move that leaves nothing to do opens the prompt; a task sent that way says so until it is closed', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const moved = \(saved\) => \{\s*onChanged\?\.\(saved\);\s*if \(offersClose\(saved\)\) setOffer\(saved\);/);
  assert.match(workflow, /moved\(await workspace\.todos\.status\(\{ id: todo\._id, status: key \}\)\)/, 'the quick move');
  assert.match(workflow, /moved\(await workspace\.todos\.status\(\{ id: todo\._id, status: asking\.key, note \}\)\)/, 'the commented move');
  assert.match(workflow, /if \(saved\?\.completed\) toast\(moving\.label, 'The task is finished\.'\);\s*moved\(saved\);/, 'the form move');
  assert.match(workflow, /\{offersClose\(todo\) && \(/);
  assert.match(workflow, /Nothing left to do<\/span> — \{todo\.closable\.why\}/);
  assert.match(workflow, /onClick=\{\(\) => setOffer\(todo\)\}>Close the task</);
  assert.match(workflow, /<CloseTaskPrompt\s+task=\{offer\}\s+why=\{offer\.closable\?\.why\}/);
  assert.match(read('components/TaskCard.jsx'), /\{!task\.completed && task\.closable\?\.why && \([\s\S]*?>Can be closed</);
});

test('a QC record entered against a Quality task offers to close it before the record opens', () => {
  const form = read('pages/QcRecordForm.jsx');
  assert.match(form, /if \(made\.closeTask\) setSaved\(made\);\s*else navigate\(`\/qc-records\/\$\{made\._id\}`, \{ replace: true \}\);/);
  assert.match(form, /task=\{\{ _id: saved\.closeTask\._id, title: saved\.closeTask\.title \}\}/);
  assert.match(form, /onClose=\{\(\) => navigate\(`\/qc-records\/\$\{saved\._id\}`, \{ replace: true \}\)\}/);
});

test('the workflow page says a model is closed for its team once handed on or ready', () => {
  assert.match(read('pages/ProductionWorkflow.jsx'), /\{status\.through && <span className="block text-xs text-success-400">closed for this model<\/span>\}/);
});
