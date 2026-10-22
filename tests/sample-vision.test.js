/**
 * The model's readings of a sample's pictures on the screens, suggest only [the sampling audit,
 * items 3, 4 and 9]: the courier copy read into the handover form, the buyer's photo matched to
 * the register with a tap to fill, the finished piece's check under its photo and stepped past
 * out loud at Sample Ready.
 *
 *   node --test tests/sample-vision.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the courier copy is read into the handover form — offered where the fields are empty, never over what was typed', () => {
  const queue = read('components/SamplingWorkQueue.jsx');
  assert.match(queue, /const read = await samplesApi\.readCourierCopy\(file\);/);
  assert.match(queue, /courier: current\.courier \|\| \(SAMPLE_COURIERS\.includes\(read\.courier\) \? read\.courier : read\.courier \? 'Other' : ''\)/);
  assert.match(queue, /awbNumber: current\.awbNumber\.trim\(\) \|\| read\.awbNumber/);
  assert.match(queue, /check it against the receipt before saving/);
  assert.match(read('api/endpoints.js'), /api\.post\('\/samples\/read-courier-copy', form\)/);
});

test('the buyer’s photo is matched to the register on the row: three candidates with a confidence, unsure ones marked, a tap fills the model', () => {
  const photos = read('components/SamplePhotos.jsx');
  assert.match(photos, /function MatchPanel\(\{ sample, row, mayPick, onSaved \}\)/);
  assert.match(photos, /samplesApi\.matchItemPhoto\(\{ id: sample\._id, itemId: row\._id, fresh: Boolean\(match\) \}\)/);
  assert.match(photos, /samplesApi\.pickMatchedModel\(\{ id: sample\._id, itemId: row\._id, ref: candidate\.ref \}\)/);
  assert.match(photos, /\{candidate\.code\} · \{Math\.round\(candidate\.confidence \* 100\)\}%\{candidate\.sure \? '' : ' · unsure'\}/);
  assert.match(photos, /Not clearly one of ours/);
  assert.match(photos, /disabled=\{busy \|\| !mayPick \|\| candidate\.kind !== 'mould'\}/, 'only a person with the grant picks, and only a mould');
});

test('the check sits under the finished piece; a difference is stepped past out loud at Sample Ready', () => {
  const photos = read('components/SamplePhotos.jsx');
  assert.match(photos, /export function CheckLine\(\{ row \}\)/);
  assert.match(photos, /'Checked: matches the reference' : check\.verdict === 'differs' \? 'Checked: a difference' : 'Checked: unsure'/);
  assert.match(photos, /row\.checkAccepted\?\.reason && <p/);

  const form = read('components/SampleReadyForm.jsx');
  assert.match(form, /const flagged = rows\.filter\(\(row\) => row\.check\?\.verdict === 'differs' && !row\.checkAccepted\?\.reason\);/);
  assert.match(form, /\(flagged\.length > 0 && \(!checked \|\| checkShort\)\)/, 'held until the tick and the reason');
  assert.match(form, /checkOverride: true, checkOverrideReason: checkReason\.trim\(\)/);
  assert.match(form, /<CheckLine row=\{row\} \/>/);
});
