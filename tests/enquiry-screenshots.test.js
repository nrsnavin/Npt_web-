/**
 * The screenshots an enquiry was made from: a Screenshots column at the top right of the enquiry,
 * small pictures that open big; a tick on the task forms forwards them; a forwarded task shows them
 * on its card, and the task's panel offers Forward the screenshots when the form did not.
 *
 *   node --test tests/enquiry-screenshots.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextStepOf } from '../src/utils/buyerCards.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the enquiry shows its screenshots at the top of the right column, and at the top on a phone', () => {
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /<EnquiryScreenshots enquiryId=\{enquiry\._id\} className="hidden lg:block" \/>\s*\{\/\* Who to talk to/);
  assert.match(page, /<EnquiryScreenshots enquiryId=\{enquiry\._id\} className="lg:hidden" \/>/);
});

test('a small picture opens big, with previous / next through the rest', () => {
  const shots = read('components/Screenshots.jsx');
  assert.match(shots, /onClick=\{\(\) => setViewing\(n\)\}/);
  assert.match(shots, /<ShotViewer urls=\{urls\} start=\{viewing\}/);
  assert.match(shots, /‹ Previous/);
  assert.match(shots, /Next ›/);
  assert.match(shots, /Open full size/);
  assert.match(shots, /event\.key === 'ArrowRight'/);
});

test('the task form forwards the screenshots when the tick stays on', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /const \[forwardShots, setForwardShots\] = useState\(true\);/);
  assert.match(dialog, /Forward the screenshots to this task/);
  assert.match(dialog, /\.\.\.\(shots && forwardShots && !fromTask && !team \? \{ forwardShots: true \} : \{\}\)/);
});

test('a forwarded task shows them on its card; the panel can forward them later', () => {
  assert.match(read('components/TaskCard.jsx'), /<TaskScreenshots task=\{task\} onChanged=\{onChanged\} \/>/);
  assert.match(read('components/TaskPanel.jsx'), /<TaskScreenshots task=\{task\} withForward onChanged=\{onChanged\} \/>/);
  const shots = read('components/Screenshots.jsx');
  assert.match(shots, /const wanted = Boolean\(task\?\.enquiry\) && \(task\.shotsForwarded \|\| withForward\);/);
  assert.match(shots, /Forward the screenshots/);
});

test('the draft’s first task takes the screenshots unless unticked', () => {
  const models = [{ mould: 'm1', code: 'NH-420', quantity: '5000' }];
  const quote = { nextStep: 'quote', stepTargetPrice: '4.5' };
  const on = nextStepOf(quote, models);
  assert.equal(on.task.forwardShots, true);
  const off = nextStepOf({ ...quote, stepForwardShots: false }, models);
  assert.equal(off.task.forwardShots, false);
  assert.match(read('pages/BuyerCards.jsx'), /Forward the screenshots to \{fields\.nextStep === 'sample' \? 'Sampling' : 'Quotation'\}/);
});
