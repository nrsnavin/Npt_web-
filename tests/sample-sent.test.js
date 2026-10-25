/**
 * Pieces sent, model by model [pages/SampleDetail.jsx, components/SamplingWorkQueue.jsx; server:
 * setSampleStatus `itemQuantities`] — asked for each model in the bag, and shown on the enquiry to
 * marketing and Admin [pages/EnquiryDetail.jsx].
 *
 *   node --test tests/sample-sent.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('what a sample sent, model by model, with how it went', async () => {
  const { sampleSent } = await import('../src/utils/sampleSent.js');
  assert.equal(sampleSent({ items: [{ modelNumber: 'A', quantity: 3 }] }), null, 'nothing sent yet');
  const two = sampleSent({ dispatchedQuantity: 5, courier: 'Blue Dart', awbNumber: '7721', dispatchedAt: '2026-10-25', items: [{ modelNumber: 'NPT-400S', dispatchedQuantity: 3 }, { modelNumber: 'NPT-380T', dispatchedQuantity: 2 }] });
  assert.deepEqual(two.models, [{ model: 'NPT-400S', pieces: 3 }, { model: 'NPT-380T', pieces: 2 }]);
  assert.equal(two.total, 5);
  assert.equal(two.how, 'Blue Dart 7721');
  const handed = sampleSent({ dispatchedQuantity: 9, deliveryMethod: 'direct', handedTo: 'Mr Ravi', modelNumber: 'TEST', items: [] });
  assert.deepEqual([handed.models, handed.how], [[{ model: 'TEST', pieces: 9 }], 'handed to Mr Ravi'], 'an older sample with a total only');
});

test('both dispatch forms ask the pieces of each model; the enquiry shows them to marketing and Admin', () => {
  const detail = read('pages/SampleDetail.jsx');
  assert.match(detail, /const byModel = rows\.length > 0;/, 'every sample with models, one or many');
  assert.match(detail, /\.\.\.\(dispatching && byModel \? \{ itemQuantities:/);
  const bench = read('components/SamplingWorkQueue.jsx');
  assert.match(bench, /Pieces sent, model by model/);
  assert.match(bench, /itemQuantities: models\.map\(\(item\) => \(\{ item: item\._id, quantity: Number\(pieces\[item\._id\]\) \|\| 0 \}\)\)/);
  const enquiry = read('pages/EnquiryDetail.jsx');
  assert.match(enquiry, /const seesSent = isAdmin \|\| departments\.includes\('marketing'\);/);
  assert.match(enquiry, /\{seesSent && sampleSent\(sample\) && /);
});
