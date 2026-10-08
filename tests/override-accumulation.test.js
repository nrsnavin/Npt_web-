/**
 * Two soft gates on one press, and why the answers have to accumulate [§15, §19].
 *
 * One action can trip more than one soft gate. A consignment with no delivery address that
 * nobody inspected trips two, and each request to the server is atomic: an override assigned in
 * memory is lost when the next gate refuses. So an answer that is not *resent* is an answer that
 * was never given.
 *
 * The first version of the dialog sent only the field it had last been asked for. Measured
 * against the live API, pressing Dispatched on such a consignment went:
 *
 *     press 1                  → 409 addressOverrideReason
 *     press 2 (address only)   → 409 qualityOverrideReason
 *     press 3 (quality only)   → 409 addressOverrideReason
 *     press 4 (address only)   → 409 qualityOverrideReason
 *
 * — forever. Not a refusal anybody could read and act on: a circle, with the load already on the
 * lorry and the record unable to say so. The two gates were each behaving correctly and the
 * screen was throwing away the answer to whichever one it was not currently asking about.
 *
 * What this file guards is the shape rather than the strings: that a reason given is carried
 * into every later attempt for the same press, and thrown away when a new press starts. Read as
 * text because `node --test` here has no JSX loader.
 *
 *   node --test tests/override-accumulation.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../src/components/DispatchStatus.jsx', import.meta.url), 'utf8');

test('a reason given is carried into every later attempt for the same press', () => {
  /* The line the whole thing turns on. */
  assert.match(
    SOURCE,
    /const carried = \{ \.\.\.answers, \[override\.field\]: overrideReason \}/,
    'the override request must carry the answers already given, not just the latest'
  );
  assert.match(SOURCE, /setAnswers\(carried\)/, 'and remember them for the next round');
  assert.match(SOURCE, /\.\.\.carried,/, 'and actually send them');

  /* The regression, asserted as an absence: sending the one field is what made the circle. */
  assert.doesNotMatch(
    SOURCE,
    /\[override\.field\]: overrideReason,\s*\}\s*\)/,
    'sending only the field last asked for is the bug — two gates then ask for each other forever'
  );
});

test('a fresh press starts with no answers', () => {
  /*
   * The other half of meaning something. Reasons given for the last consignment, or for an
   * attempt somebody abandoned, are not evidence about this one — and silently reusing them
   * would put a sentence about a different lorry on this record, under this person's name.
   */
  assert.match(SOURCE, /const run = async \(action\) => \{[\s\S]{0,400}setAnswers\(\{\}\)/);
});

test('another refusal after an answer is another question, not an error', () => {
  /*
   * With the answers carried, the second gate's 409 is progress. Showing it as a red error in
   * the dialog would read as "your reason was rejected", which is the opposite of what
   * happened, and would leave the person with no way forward on a press that is one sentence
   * from done.
   */
  const sendOverride = SOURCE.slice(SOURCE.indexOf('const sendOverride'), SOURCE.indexOf('return {'));
  assert.match(sendOverride, /catch \(actError\) \{[\s\S]{0,200}ask\(actError/, 'it opens the next question');
  assert.doesNotMatch(
    sendOverride,
    /catch \(actError\) \{\s*setError\(actError\);\s*\}/,
    'a second gate is not a failure of the first answer'
  );
});

test('the person is told another question is coming', () => {
  /*
   * A second dialog appearing unannounced reads as the first one having failed. The server says
   * how many it still wants — `needsAll` — and the dialog says so before the next one opens,
   * rather than springing it.
   */
  assert.match(SOURCE, /remaining: \(actError\.details\.needsAll \|\| \[field\]\)\.length/);
  assert.match(SOURCE, /override\?\.remaining > 1/);
  assert.match(SOURCE, /One more thing to answer after this/);
});

test('every path that meets a refusal asks the same way', () => {
  /*
   * Three places can meet an answerable 409 — the one-press action, the small form that
   * collects a lorry number, and the override dialog itself. Three copies of "is this
   * answerable, and if so open the dialog" is three places for one of them to be forgotten,
   * which is exactly how the third case would have been missed.
   */
  assert.match(SOURCE, /const ask = \(actError, action, label\) => \{/);
  const calls = SOURCE.match(/\bask\(actError/g) || [];
  assert.equal(calls.length, 3, `every refusal path goes through it (found ${calls.length})`);
});
