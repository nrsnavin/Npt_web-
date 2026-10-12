/**
 * A picker's list is never cut off by the card it sits in [components/Combobox.jsx].
 *
 * Reported from the plant: in a new enquiry, the Printing picker at the foot of the model card
 * opened to a sliver — the card hid everything below its own edge, so there was nothing to pick.
 * The list is drawn on the page itself now, beside the box, and the card no longer clips.
 *
 *   node --test tests/dropdown-clipping.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the list is drawn on the page, above dialogs, placed beside its box', () => {
  const combobox = read('components/Combobox.jsx');
  assert.match(combobox, /\{open && place && createPortal\(/);
  assert.match(combobox, /document\.body,\s*\)\}/);
  assert.match(combobox, /className="fixed z-\[60\] overflow-y-auto/);
  assert.match(combobox, /window\.addEventListener\('scroll', measure, true\)/, 'follows a scrolling dialog');
  assert.match(combobox, /const upward = below < 220 && above > below;/, 'opens upward when there is no room below');
  /* A click in the list is not a click elsewhere, though it is outside the wrapper now. */
  assert.match(combobox, /!wrapper\.current\?\.contains\(event\.target\) && !list\.current\?\.contains\(event\.target\)/);
});

test('an enquiry’s model card does not clip what opens inside it', () => {
  assert.doesNotMatch(read('components/ItemCards.jsx'), /<li className="overflow-hidden rounded-xl/);
});
