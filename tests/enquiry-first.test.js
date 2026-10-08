/**
 * Everything is an enquiry, on screen [server: services/enquiryLink.service.js,
 * services/handoff.service.js].
 *
 * The server refuses a sample, costing, quotation or order without an enquiry, and moves an
 * enquiry on only for whoever holds it. These checks keep the screens from offering what the
 * server will refuse: a create form that can be sent with no enquiry, a Move on with nowhere to
 * go, or stage buttons drawn for someone who may not press them.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/enquiry-first.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('every create form picks an enquiry and sends it', () => {
  for (const [file, call] of [
    ['components/SampleRequestForm.jsx', /fields = editing \? \{\} : \{ enquiry \}/],
    ['pages/Pricings.jsx', /pricingsApi\.create\(\{\s*enquiry,/],
    ['pages/Quotations.jsx', /quotationsApi\.create\(\{ enquiry, \.\.\.payload \}\)/],
    ['components/OrderForm.jsx', /ordersApi\.create\(\{ customer, enquiry, \.\.\.payload \}\)/],
  ]) {
    const source = read(file);
    assert.match(source, /<EnquirySelect/, `${file} has no enquiry picker`);
    assert.match(source, call, `${file} does not send the enquiry`);
  }
});

test('no create form offers a standalone record any more', () => {
  assert.doesNotMatch(read('components/SampleRequestForm.jsx'), /standaloneReason|internal trial/);
  assert.doesNotMatch(read('pages/Pricings.jsx'), /No enquiry needed/);
  assert.doesNotMatch(read('components/pickers.jsx'), /standalone request/);
});

test('an order can be raised on a won enquiry, which the open-only picker would hide', () => {
  assert.match(read('components/OrderForm.jsx'), /<EnquirySelect[^>]*\bwon\b/);
});

test('moving on asks where it goes next, and an update does not move it', () => {
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /Where it goes next/);
  assert.match(actions, /mode === 'done' && holds && !next/, 'Move on cannot be sent without a next step');
  assert.match(actions, /workspace\.todos\.progress\(/, 'an update goes to its own endpoint');
});

test('the stage buttons are drawn only for whoever may move the enquiry', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /history\?\.mayMove/);
  assert.match(desk, /\{mayMove \? \(/);
  assert.match(desk, /button\.hidden/, 'the hidden first task is never a button');
});

test('a choice the server checks (Quality\'s Passed / Failed) is picked from its options, not typed', () => {
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /record\.type === 'choice'/);
  assert.match(actions, /record\.options\.map/);
});
