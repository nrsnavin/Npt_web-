/**
 * The send quotation form [components/SendQuotationForm.jsx; server: quotation.controller
 * `sendQuotation`, handoff.subscriber]: sending closes the quotation task by default; the tick
 * can be cleared to keep the task open as Quote Sent.
 *
 *   node --test tests/quotation-send-form.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Close the quotation task is ticked by default and goes with every send, message or not', () => {
  const form = read('components/SendQuotationForm.jsx');
  assert.match(form, /const \[closeTask, setCloseTask\] = useState\(true\);/, 'ticked by default');
  assert.match(form, /checked=\{closeTask\} onChange=\{\(event\) => setCloseTask\(event\.target\.checked\)\}/);
  assert.match(form, /Close the quotation task/);
  assert.match(form, /Untick to keep it open as Quote Sent/);
  assert.match(form, /quotationsApi\.deliver\(\{ id: quotation\._id, \.\.\.channels, closeTask \}\)/, 'one send path, so the hand-over button carries it too');
  assert.match(form, /onClick=\{\(\) => send\(\{\}\)\}/, 'Mark sent without a message goes through the same send');
});
