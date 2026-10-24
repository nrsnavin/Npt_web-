/**
 * A finished task on the enquiry shows what it left behind [components/TaskCard.jsx]: the Sample
 * Request how the sample went — courier, AWB, pieces, or who received it — with the courier copy;
 * the Create Quotation its quotation, opened as a PDF from a button beside the arrow.
 *
 *   node --test tests/task-card-records.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const card = read('components/TaskCard.jsx');

test('a finished sample task shows the courier and AWB, or who received it, and the courier copy — opened, or uploaded by whoever works it', () => {
  assert.match(card, /\{task\.completed && <SampleSent task=\{task\} mayAct=\{mayAct\} onChanged=\{onChanged\} \/>\}/);
  assert.match(card, /AWB <span className="font-semibold text-steel-100">\{sample\.awbNumber\}<\/span>/);
  assert.match(card, /Received by <span className="font-semibold text-steel-100">\{given\.collectorName \|\| sample\.handedTo \|\| '—'\}<\/span>/);
  assert.match(card, />Courier copy<\/button>/);
  assert.match(card, /workspace\.todos\.addDocument\(\{ id: task\._id, docType: 'courier_copy', file \}\)/);
  assert.match(card, /'Upload courier copy'/);
});

test('a finished quotation task opens its quote as a PDF from a button beside the arrow — never a draft', () => {
  assert.match(card, /\{task\.quotation\?\._id && \(task\.completed \|\| task\.quotation\.sentAt\) && \(/);
  assert.match(card, /onClick=\{\(\) => openBlob\(\(\) => quotationsApi\.pdf\(task\.quotation\._id\)\)\}/);
  const quote = card.indexOf('Quote PDF');
  const arrow = card.indexOf("aria-label={open ? 'Hide the task' : 'Show the task'}");
  assert.ok(quote > 0 && arrow > quote, 'the PDF button sits just before the arrow');
});
