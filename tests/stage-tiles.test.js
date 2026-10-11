/**
 * The department tiles on the enquiry are buttons: clicking one raises that department's task
 * [components/DepartmentDesk.jsx; server: config/handoffs.js TILE_KIND].
 *
 *   node --test tests/stage-tiles.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const desk = readFileSync(new URL('../src/components/DepartmentDesk.jsx', import.meta.url), 'utf8');

test('a tile raises the department’s task, through the same dialog as the buttons below', () => {
  assert.match(desk, /catalogue\.buttons\.find\(\(button\) => button\.key === item\.kind\)/);
  assert.match(desk, /onClick=\{\(\) => setSending\(\{ \.\.\.sends, heading: `\$\{item\.number\}\. \$\{item\.label\} — \$\{sends\.label\}` \}\)\}/);
  assert.match(desk, /title=\{button\.heading \|\| button\.label\}/);
  assert.match(desk, /The enquiry stays with \$\{owner\}/);
});

test('the dialog asks the task’s questions, filled from the enquiry, and will not send unanswered', async () => {
  assert.match(desk, /\{asks\.length > 0 && \(/);
  assert.match(desk, /handoffsApi\.send\(\{ id: enquiry\._id, kind: button\.key, note, \.\.\.\(asks\.length \? \{ brief \} : \{\}\) \}\)/);
  assert.match(desk, /disabled=\{busy \|\| unanswered/);
});

test('a closed enquiry, or someone who may not raise tasks, gets plain tiles; open tasks show on their tile', () => {
  assert.match(desk, /const sends = !closed && mayMove && catalogue\.buttons\.find/);
  assert.match(desk, /\{open === 1 \? 'Task open' : `\$\{open\} tasks open`\}/);
});
