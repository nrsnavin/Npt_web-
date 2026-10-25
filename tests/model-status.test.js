/**
 * Where each model is, at a glance on the enquiry [components/ModelStatus.jsx, utils/journey.js].
 *
 *   node --test tests/model-status.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentStep, journeyFor, sentOf, whereTone, whereWords } from '../src/utils/journey.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const row = (model, steps) => ({ model, steps });

test('where a model is: the team on it and its status, a problem first, the pieces gone', () => {
  const printing = row('CRF-35', [
    { team: 'production', label: 'Production', status: 'Handed to Printing', state: 'done' },
    { team: 'printing', label: 'Printing', status: 'Goods Received', state: 'now' },
    { team: 'dispatch', label: 'Dispatch', status: 'Waiting for Printing', state: 'waiting', ordered: 16000, sent: 0 },
  ]);
  assert.equal(whereWords(printing), 'Printing · Goods Received');
  assert.equal(whereTone(printing), 'now');
  const part = row('CRF-44', [
    { team: 'production', label: 'Production', status: 'Ready for Dispatch', state: 'done' },
    { team: 'dispatch', label: 'Dispatch', status: 'Part sent 10,000 of 16,000 pcs', state: 'now', ordered: 16000, sent: 10000 },
  ]);
  assert.equal(whereWords(part), 'Part sent 10,000 of 16,000 pcs');
  assert.deepEqual(sentOf(part), { ordered: 16000, sent: 10000 });
  const gone = row('CRF-50', [{ team: 'production', label: 'Production', status: 'Ready', state: 'done' }, { team: 'dispatch', label: 'Dispatch', status: 'Sent', state: 'done', sent: 5000 }]);
  assert.equal(whereWords(gone), 'All sent · 5,000 pcs');
  assert.equal(whereTone(gone), 'done');
  const stuck = row('CRF-60', [{ team: 'production', label: 'Production', status: 'Mould issue', state: 'issue' }, { team: 'dispatch', label: 'Dispatch', status: 'Waiting', state: 'waiting' }]);
  assert.equal(currentStep(stuck).team, 'production');
  assert.equal(whereTone(stuck), 'issue');
  assert.equal(journeyFor([printing, part], 'crf-44 ').model, 'CRF-44');
  assert.equal(whereWords(null), 'Not with Production yet');
});

test('the enquiry opens on where each model is, then the dispatch; each model card says its own status', () => {
  const page = read('pages/EnquiryDetail.jsx');
  const glance = page.indexOf('<ModelStatusGlance journeys={records.data?.journeys} />');
  const dispatch = page.indexOf('<EnquiryDispatch data={records.data} highlight />');
  const desk = page.indexOf('<DepartmentDesk enquiry={enquiry}');
  assert.ok(glance > 0 && glance < dispatch && dispatch < desk, 'glance, then dispatch, then the desk');
  assert.match(page, /statusOf=\{\(item\) => journeyFor\(records\.data\?\.journeys/);
  assert.match(read('components/ItemList.jsx'), /\{status && <ModelStatusStrip row=\{status\} \/>\}/);
  assert.match(read('components/ModelStatus.jsx'), /Where each model is/);
});
