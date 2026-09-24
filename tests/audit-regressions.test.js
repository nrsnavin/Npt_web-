/**
 * Regressions found by the audit of 24 Sept 2026, each pinned where it was fixed.
 *
 * Source-level, like the rest of this suite — there is no JSX loader here — so each assertion
 * names the one line of behaviour whose loss would bring the bug back. The browser drives that
 * found them are in the audit report; these are what keep them found.
 *
 *   node --test tests/audit-regressions.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('a failed session check does not sign the person out — only a 401 does', () => {
  /*
   * The check used to clear the token on any failure: a timeout, a 500, a 429, a phone losing
   * signal. Reopening the app during a network blip signed people out. The client interceptor
   * clears on a real 401; this must not clear on anything else.
   */
  const auth = source('context/AuthContext.jsx');
  assert.ok(!/\.catch\(\(\) => clearToken\(\)\)/.test(auth), 'no blanket clear on failure');
  assert.match(auth, /failure\?\.response\?\.status === 401/);
  assert.match(source('App.jsx'), /Could not reach the server/, 'and the screen offers a retry');
});

test('the dock never throws out of its loader, and one failed panel does not blank the rest', () => {
  /*
   * It runs on every screen. `Promise.all` in a try with no catch turned any single failed
   * call into an uncaught error on every page and discarded the panels that had loaded.
   */
  const dock = source('components/dock/WorkspaceContext.jsx');
  assert.match(dock, /Promise\.allSettled\(/);
  assert.ok(!/await Promise\.all\(\[\s*workspace\.todos\.list/.test(dock));
});

test('a customer shared through a query is not offered for editing', () => {
  /*
   * A query shares a buyer so a participant can read them. Offering Edit ended in
   * "Customer not found" on save, with the customer on the screen.
   */
  assert.match(
    source('pages/CustomerDetail.jsx'),
    /const mayWrite = canWrite\('customers'\) && ownsRecord\(user, customer\)/
  );
});

test('converting a lead judges the enquiry by its items', () => {
  /*
   * The check read `mould` and `isNewDevelopment` after that state moved onto each item, and
   * threw a ReferenceError on every conversion with an enquiry — the press did nothing and said
   * nothing. CI now runs ESLint for undefined names; this pins the rule it was replaced with.
   */
  const lead = source('pages/LeadDetail.jsx');
  assert.match(lead, /const described = items\.filter\(filledItem\)/);
  assert.ok(!/!mould &&/.test(lead));
});
