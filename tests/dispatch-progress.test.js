/**
 * The enquiry and SO pages show what has gone, model by model [components/DispatchProgress.jsx,
 * components/OrderDispatchDetails.jsx; server: records.service `modelsSent`, request `loads`]:
 * a bar a model (ordered against dispatched, in words beside it), each load under its request.
 *
 *   node --test tests/dispatch-progress.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a bar a model: the track is what was ordered, the fill what went — said in words too, its loads on hover or focus', () => {
  const chart = read('components/DispatchProgress.jsx');
  assert.match(chart, /const share = row\.ordered > 0 \? Math\.min\(1, row\.sent \/ row\.ordered\)/);
  assert.match(chart, /`\$\{formatNumber\(row\.sent\)\} of \$\{formatNumber\(row\.ordered\)\} pcs`/);
  assert.match(chart, /\$\{formatNumber\(row\.left\)\} to go/);
  assert.match(chart, /tabIndex=\{0\}\s+role="img"\s+aria-label=\{`\$\{row\.model\}: \$\{words\} dispatched, \$\{state\}`\}/);
  assert.match(chart, /group-hover:block group-focus-within:block/);
  assert.match(chart, /\{row\.model\} — loads/);
});

test('the dispatch details lead with the chart and list every load with its proof', () => {
  const body = read('components/OrderDispatchDetails.jsx');
  assert.match(body, /\{data\.models\?\.length > 0 && <DispatchProgress models=\{data\.models\} \/>\}/);
  assert.match(body, /aria-label="Loads sent"/);
  assert.match(body, /load\.lines\.map\(\(line\) => `\$\{line\.model\} \$\{formatNumber\(line\.quantity\)\} pcs`\)/);
  assert.match(body, /<TaskPdfLink file=\{load\.proof\} \/>/);
  assert.match(read('components/EnquiryRecords.jsx'), /<DispatchBody data=\{data\.dispatch\}/, 'on the enquiry page');
});
