/**
 * Asking for a sample for a lead raises that lead's first enquiry [BLUEPRINT §5].
 *
 * An enquiry needs a customer, so raising one for a lead *is* converting that lead — a customer
 * and an enquiry come into being from a button that says "Request a sample". That is the right
 * behaviour and it is more than the button says, which puts two obligations on the screen and
 * this file exists to hold it to both:
 *
 * **Said before.** The form states what raising it will do, so the consequence is a decision
 * rather than a discovery.
 *
 * **Said after, by name.** The customer and the enquiry are named and linked in the answer. A
 * screen that reports "the lead was converted" leaves somebody hunting for what it became, and
 * those two records are the whole of what there is to check.
 *
 * The third thing here is a sequencing trap that cost a working feature once already: the lead
 * page is drawn from a record that shows a spinner while it reloads, so reloading it at the
 * moment of success takes the confirmation panel down before anybody has read it. The reload
 * belongs on the dismissal.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/lead-sample-enquiry.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const FORM = read('components/SampleRequestForm.jsx');
const LEAD = read('pages/LeadDetail.jsx');
const ENDPOINTS = read('api/endpoints.js');

test('the lead path reads the whole answer, not just the sample', () => {
  /*
   * `unwrap` throws everything but `data`, and what happened to the lead is beside it. Reusing
   * `create` here would leave the screen holding a sample and no way to know a customer had
   * been made — the exact shape of a consequence nobody is told about.
   */
  assert.match(ENDPOINTS, /createForLead: \(payload\) => api\.post\('\/samples', payload\)\.then\(\(response\) => response\.data\)/);
  assert.match(FORM, /samplesApi\.createForLead\(payload\)/);

  /* And only for a lead. Every other request is a sample and nothing else. */
  assert.match(FORM, /if \(!editing && forLead\) \{/);
  assert.match(FORM, /await samplesApi\.create\(payload\)/, 'the ordinary path is unchanged');
});

test('the form says what raising it will do, before it is raised', () => {
  const promise = FORM.match(/Raising this makes them a customer[^<]*/);
  assert.ok(promise, 'the lead notice states the conversion');
  assert.match(promise[0], /first enquiry/);
  /* And the attach case, which is the commonest surprise of the two: a company already on the
     master gets the enquiry on the record that exists, not a second one. */
  assert.match(FORM, /already on the customer list, the enquiry goes there/);
});

test('what came into being is named and linked afterwards', () => {
  assert.match(FORM, /setMade\(answer\.converted\)/);
  assert.match(FORM, /is now a customer/);
  /* Both records, as links — a number somebody has to go and search for is not a report. */
  assert.match(FORM, /to=\{`\/customers\/\$\{made\.customer\.id\}`\}/);
  assert.match(FORM, /to=\{`\/enquiries\/\$\{made\.enquiry\.id\}`\}/);
  assert.match(FORM, /made\.customer\.code/);
  assert.match(FORM, /made\.enquiry\.number/);
  /* Honest about which of the two happened. */
  assert.match(FORM, /made\.attached \?/);
});

test('the lead is reloaded on the way out, not at the moment of success', () => {
  /*
   * The trap. `LeadDetail` returns a spinner while its record reloads, which unmounts this
   * dialog — so calling `onConverted` on success made the confirmation flash and vanish, and
   * the feature looked like it had silently done nothing. Asserted as an absence as well as a
   * presence, because the working version and the broken one differ by one line's position.
   */
  assert.match(FORM, /onClick=\{\(\) => \{ onClose\(\); onConverted\?\.\(made\); \}\}/);
  assert.doesNotMatch(
    FORM,
    /onConverted\?\.\(answer\.converted\)/,
    'not while the dialog it would unmount is still the thing being read'
  );
});

test('the lead page hands the reload down and offers the button only while it is a lead', () => {
  assert.match(LEAD, /<LeadSamples lead=\{lead\} mayWrite=\{mayWrite\} onLeadChanged=\{reload\} \/>/);
  assert.match(LEAD, /function LeadSamples\(\{ lead, mayWrite, onLeadChanged \}\)/);
  assert.match(LEAD, /onConverted=\{onLeadChanged\}/);

  /* Already there and still load-bearing: a converted lead's work has moved to the customer,
     and the server refuses a second request against it. */
  assert.match(LEAD, /const open = !\['converted', 'disqualified'\]\.includes\(lead\.status\)/);
  assert.match(LEAD, /mayWrite && open \?/);
});
