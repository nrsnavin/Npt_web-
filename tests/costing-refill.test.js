/**
 * What refills on the costing sheet, and when [BLUEPRINT §39].
 *
 * The sheet copies figures out of two registers: the mould gives the grammage and its own cost
 * lines, the material gives the resin rate and the grammage uplift over PP. Copying them on the
 * screen rather than only on save is deliberate — a cavity is a fixed volume, so the same tool
 * throws an 18% heavier part in HIPS, and somebody who picks HIPS and watches the weight stay at
 * its PP figure is reading a total that is 18% light on the number they are about to decide on.
 *
 * The bug this file exists for: the refill was guarded by "skip the first effect run", which is
 * counting invocations. React runs effects twice on mount under StrictMode precisely to catch
 * code that relies on that count, and this app runs in StrictMode. Measured in the browser,
 * simply pressing "Re-cost" on a saved sheet fired six register fetches and rewrote every
 * derived figure — so a grammage typed for one particular job was replaced by the tool's own,
 * and the sheet opened showing the weight for the resin the *mould* is set up for rather than
 * the one the sheet was saved with. After the fix the same measurement is zero.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/costing-refill.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHEET = readFileSync(new URL('../src/components/CostingSheetForm.jsx', import.meta.url), 'utf8');

/** The refill effect, on its own, so an assertion cannot accidentally match the rest of the form. */
const REFILL = SHEET.slice(SHEET.indexOf('const applied = useRef('), SHEET.indexOf('const loadMoulds'));

test('it asks whether the selection moved, not whether the effect has run before', () => {
  /*
   * The property that makes it idempotent: any number of runs with an unchanged selection does
   * nothing, so opening a sheet — however many times React mounts the component — cannot disturb
   * the figures it was saved with.
   */
  assert.match(SHEET, /const applied = useRef\(\{ mould, materialRef, hookRef, clipRef, printRef \}\)/,
    'the baseline is what the sheet was opened with');
  assert.match(REFILL, /selection\[key\] !== applied\.current\[key\]/, 'and a refill is a difference');
  assert.match(REFILL, /if \(!moved\.size\) return;/);

  /* The invocation-counting guard is gone, and must not come back. */
  assert.ok(!/settled/.test(SHEET), 'no first-render flag');
  assert.ok(
    !/if \(!\w+\.current\) \{\s*\n\s*\w+\.current = true;\s*\n\s*return;/.test(SHEET),
    'nothing counts renders'
  );
});

test('the applied selection is recorded before the fetch, not after it', () => {
  /*
   * Otherwise two runs for the same change both get past the check and both fetch — which is the
   * original bug with an extra step, since StrictMode's second run would arrive before the first
   * one's promise resolved.
   */
  const marked = REFILL.indexOf('applied.current = selection;');
  const fetched = REFILL.indexOf('Promise.all(');
  assert.ok(marked > -1 && fetched > -1);
  assert.ok(marked < fetched, 'the selection is marked applied before anything is requested');
});

test('the grammage refills when either the tool or the resin moves', () => {
  /* It is the tool's measured figure converted into the chosen resin, so it depends on both —
     picking HIPS against an unchanged mould has to recompute it. */
  assert.match(REFILL, /const partMoved = moved\.has\('mould'\) \|\| moved\.has\('materialRef'\);/);
  assert.match(REFILL, /mould && partMoved \? mouldsApi\.get\(mould\) : null/);
  assert.match(REFILL, /materialRef && partMoved \? materialsApi\.get\(materialRef\) : null/);
  assert.match(REFILL, /grammageFactorPercent \|\| 0\) \/ 100/, 'and the uplift is applied over PP');
});

test('each other line refills only from its own register', () => {
  /*
   * Changing the hook used to re-derive the grammage and the job-work lines from the mould, which
   * is the same overwrite arriving through a different door: a typed grammage lost because
   * somebody corrected the hook price.
   */
  assert.match(REFILL, /hookRef && moved\.has\('hookRef'\) \? componentsApi\.get\(hookRef\) : null/);
  assert.match(REFILL, /clipRef && moved\.has\('clipRef'\) \? componentsApi\.get\(clipRef\) : null/);
  assert.match(REFILL, /printRef && moved\.has\('printRef'\) \? componentsApi\.get\(printRef\) : null/);

  /* The tool's own cost lines are gated on the tool, not merely on having fetched it. */
  assert.match(REFILL, /\.\.\.\(moved\.has\('mould'\)\s*\n?\s*\?\s*\{\s*\n?\s*jobWorkCost:/);
  assert.match(REFILL, /resin && moved\.has\('materialRef'\) \? \{ rawMaterialRate/);
});

test('the parts registers still win over the mould\'s own figures', () => {
  /*
   * The ordering is load-bearing and easy to lose in a rewrite. The mould says *this part takes
   * a hook* — a fact about the piece. The register says *a swivel hook costs ₹0.70 this week* —
   * a purchase fact that moves. When both have an opinion the priced one is newer.
   */
  const mouldLines = REFILL.indexOf('jobWorkCost:');
  const hookLine = REFILL.indexOf('hook.ratePerPiece');
  assert.ok(mouldLines > -1 && hookLine > -1);
  assert.ok(mouldLines < hookLine, 'the hook register is applied after the mould');
});
