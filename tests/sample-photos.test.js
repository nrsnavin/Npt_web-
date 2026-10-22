/**
 * The two pictures on each model row of a sample [components/SamplePhotos.jsx,
 * SampleReadyForm.jsx; server: Sample items `photo`, `referencePhoto`]: the buyer's reference
 * beside the finished piece; Sample Ready asks for the photos first and takes No photo with a
 * reason; the finished pieces show on the queue, the enquiry and the order's approved sample.
 *
 *   node --test tests/sample-photos.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the API client reaches each row’s two photo slots', () => {
  const api = read('api/endpoints.js');
  for (const route of ['/items/${itemId}/photo', '/items/${itemId}/reference-photo']) {
    assert.ok(api.includes(`api.put(\`/samples/\${id}${route}\`, form)`), `PUT ${route}`);
    assert.ok(api.includes(`api.delete(\`/samples/\${id}${route}\`)`), `DELETE ${route}`);
  }
});

test('the sample page shows reference beside finished piece per row; the bench retakes, marketing adds the reference', () => {
  const photos = read('components/SamplePhotos.jsx');
  assert.match(photos, /label="Buyer's reference"/);
  assert.match(photos, /label="Finished piece"/);
  assert.match(photos, /mayEdit=\{mayReference\}/);
  assert.match(photos, /mayEdit=\{mayBench\}/);
  assert.match(photos, /capture="environment"/, 'the bench phone opens its camera');
  assert.match(photos, /shrinkImage\(file\)/, 'phone photos are shrunk before upload');
  assert.match(photos, /samplesApi\.setItemPhoto\(/);
  assert.match(photos, /samplesApi\.setItemReferencePhoto\(/);
  assert.match(photos, /sample\.readyWithoutPhoto\?\.reason/, 'says when it went ready without a photo');

  const detail = read('pages/SampleDetail.jsx');
  assert.match(detail, /<SamplePhotos\s+sample=\{sample\}/);
  assert.match(detail, /mayReference=\{\(maySample \|\| canWrite\('enquiries'\)\) && !closed\}/);
});

test('Sample Ready opens the photo step from the page and the queue; No photo needs a reason', () => {
  const form = read('components/SampleReadyForm.jsx');
  assert.match(form, /const missing = rows\.filter\(\(row\) => !row\.photo\?\.key\);/);
  assert.match(form, /const blocked = \(missing\.length > 0 && \(!noPhoto \|\| reasonShort\)\)/);
  assert.match(form, /status: 'sample_ready'/);
  assert.match(form, /noPhoto: true, noPhotoReason: reason\.trim\(\)/);
  assert.match(form, /samplesApi\.get\(sampleId\)/, 'the queue hands it only the id');

  const detail = read('pages/SampleDetail.jsx');
  assert.match(detail, /if \(to === 'dispatched' \|\| to === 'sample_ready'\) \{/);
  assert.match(detail, /movingStage === 'sample_ready' && \(\s*<SampleReadyForm sample=\{sample\}/);

  const queue = read('components/SamplingWorkQueue.jsx');
  assert.match(queue, /if \(to === 'ready'\) return setReadying\(row\);/);
  assert.match(queue, /<SampleReadyForm sampleId=\{readying\._id\}/);
});

test('the finished pieces travel: queue thumbnails, the enquiry’s samples, the order’s approved sample', () => {
  const queue = read('components/SamplingWorkQueue.jsx');
  assert.match(queue, /row\.models\.filter\(\(item\) => item\.photo\)\.map/);
  assert.match(queue, /Ready without a photo of every piece/);

  const enquiry = read('pages/EnquiryDetail.jsx');
  assert.match(enquiry, /sample\.items\.filter\(\(row\) => row\.photo\?\.key\)\.map/);

  const order = read('pages/OrderDetail.jsx');
  assert.match(order, /function ApprovedSampleCard\(\{ approvedSample \}\)/);
  assert.match(order, /<ApprovedSampleCard approvedSample=\{data\.approvedSample\} \/>/);
  assert.match(order, /Section title="Approved sample"/);
});
