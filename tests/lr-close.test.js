/**
 * After the LR: the enquiry stays open and the desk offers Close, with the reason written
 * [components/DepartmentDesk.jsx; server config/handoffs.js lr_copy whenResult].
 *
 *   node --test tests/lr-close.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');

test('Close is offered only on an open enquiry with an LR in, to whoever may move it', () => {
  assert.match(desk, /\{!closed && mayMove && history\?\.lrUploaded && closeButton && \(/);
  assert.match(desk, /LR uploaded and sent to the buyer/);
  assert.match(desk, />\s*Close enquiry\s*</);
});

test('Close uses the Task Closed button with its reason already written', () => {
  assert.match(desk, /catalogue\.buttons\.find\(\(button\) => button\.key === 'task_closed'\)/);
  assert.match(desk, /note: 'LR sent to the buyer — order complete'/);
  assert.match(desk, /useState\(button\?\.note \|\| ''\)/, 'the dialog opens with the note filled in, still editable');
});
