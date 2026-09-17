/**
 * A refusal must never take the screen down with it.
 *
 * The server answers a refused save in two shapes. A validation failure sends `details` as a
 * **list** of `{field, message}`. Everything else sends it as an **object** naming the one thing
 * that would resolve it — `{ needs }` on a soft gate, `{ order }` on a reference the importer
 * already used, `{ customer }` on a buyer that already exists.
 *
 * Nineteen forms rendered `error.details?.map(...)` directly, which is right for the first and a
 * thrown TypeError for the second. A throw during render is not an error message: React unmounts
 * the tree, so the entire application went white with everything the person had typed still in
 * it — measured at zero characters of body text, no navigation, no message, nothing to do but
 * reload, which is also what guarantees the typing is lost.
 *
 * It was reachable, on the most useful refusal in the app: book an order whose outside reference
 * the importer has already brought in, and the server names the order it is on. That was the
 * screen that blanked.
 *
 *   node --test tests/refusal-rendering.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { fieldErrors } from '../src/api/failure.js';

/* ------------------------------ The rule itself ------------------------------ */

test('a list of field errors is a list of field errors', () => {
  const details = [{ field: 'quantity', message: 'must be at least 1' }];
  assert.deepEqual(fieldErrors(details), details);
});

test('an object naming what is needed is nothing to list, not a crash', () => {
  /* Each of these is a real refusal the server sends today. */
  for (const details of [
    { needs: 'noPodReason' },
    { needs: 'qualityOverrideReason', concern: 'Nobody has inspected this' },
    { order: { id: 'abc', number: 'SO-2026-0007', status: 'po_received' } },
    { customer: { _id: 'x', name: 'SCM Garments Pvt Ltd' } },
    { existing: 'RCV-2026-0002' },
  ]) {
    assert.deepEqual(fieldErrors(details), [], JSON.stringify(details));
  }
});

test('and neither is anything else that has ever come back', () => {
  for (const details of [undefined, null, '', 'nope', 0, 42, true]) {
    assert.deepEqual(fieldErrors(details), []);
  }
});

/* ------------------------- Nowhere renders it by hand ------------------------- */

const SRC = new URL('../src/', import.meta.url).pathname;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

test('no screen maps over details without asking whether it is a list', () => {
  /*
   * The guard, checked where the bug would come back. Read as text because `node --test` here
   * has no JSX loader — which is also why `fieldErrors` lives in a `.js` module it can import.
   *
   * `FormError` in `ui.jsx` is the one renderer, and the two screens that offer something better
   * than a list — a link to the order it clashed with, a button to attach to the customer that
   * already exists — are allowed their own handling as long as they check first.
   */
  const offenders = [];

  for (const path of walk(SRC).filter((p) => /\.jsx?$/.test(p))) {
    const source = readFileSync(path, 'utf8');
    for (const [index, line] of source.split('\n').entries()) {
      if (!/\bdetails\??\.map\b/.test(line)) continue;
      /* A comment describing the bug is not the bug. */
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
      /* Guarded on the line above, as `Array.isArray(error.details) && error.details.map(...)`. */
      const previous = source.split('\n')[index - 1] || '';
      if (/Array\.isArray/.test(line) || /Array\.isArray/.test(previous)) continue;
      offenders.push(`${path.replace(SRC, 'src/')}:${index + 1}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'these render `details.map` unguarded — an object `details` there blanks the app. ' +
      'Use <FormError error={error} /> from ui.jsx.'
  );
});

/* --------------------------- And something catches --------------------------- */

test('the routed screen is wrapped in an error boundary', () => {
  /*
   * The specific bug is fixed where it was; this is here because the next one has not been
   * written yet. Without a boundary, one component's throw costs the whole application —
   * measured: zero characters of body text, navigation gone.
   *
   * Inside the main column rather than around the app, so a screen that fails loses the screen
   * and not the sidebar: going somewhere else stays one press rather than a reload.
   */
  const layout = readFileSync(join(SRC, 'components/Layout.jsx'), 'utf8');
  assert.match(layout, /<ErrorBoundary[^>]*>\s*<Outlet \/>\s*<\/ErrorBoundary>/,
    'the Outlet must be inside an ErrorBoundary');
  assert.match(layout, /resetKey=\{location\.pathname\}/,
    'keyed on the route, or a screen that failed keeps apologising after you navigate away');

  const boundary = readFileSync(join(SRC, 'components/ErrorBoundary.jsx'), 'utf8');
  assert.match(boundary, /getDerivedStateFromError/, 'it has to actually catch');
  assert.match(boundary, /componentDidCatch/, 'and log, or the stack is lost');
  /* A message somebody can read down a phone: "it went white" is not a bug report. */
  assert.match(boundary, /failed\?\.message/);
});
