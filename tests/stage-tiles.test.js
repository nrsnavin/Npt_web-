/**
 * The department tiles on the enquiry are buttons: clicking one forwards the enquiry there
 * [components/DepartmentDesk.jsx; server: config/handoffs.js TILE_KIND].
 *
 *   node --test tests/stage-tiles.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');

test('a tile sends the stage’s own button, through the same dialog as the buttons below', () => {
  assert.match(desk, /catalogue\.buttons\.find\(\(button\) => button\.key === item\.kind\)/);
  assert.match(desk, /onClick=\{\(\) => setSending\(\{ \.\.\.sends, heading: `Send to \$\{item\.number\}\. \$\{item\.label\}` \}\)\}/);
  assert.match(desk, /title=\{button\.heading \|\| button\.label\}/);
});

test('the stage it is at, a closed enquiry, and moves the person may not make are not clickable', () => {
  assert.match(desk, /const sends = !closed && !here && catalogue\.buttons\.find/);
  assert.match(desk, /const clickable = Boolean\(sends && \(sends\.moves \? mayMove : true\)\);/);
  assert.match(desk, /<div key=\{item\.key\} aria-current=\{here \? 'step' : undefined\} className=\{look\}>/);
});
