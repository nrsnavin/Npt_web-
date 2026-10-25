/**
 * The department tiles on the enquiry are buttons: clicking one raises that department's task
 * [components/DepartmentDesk.jsx; server: config/handoffs.js TILE_KIND].
 *
 *   node --test tests/stage-tiles.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const desk = read('components/DepartmentDesk.jsx');

test('a tile opens that department’s task form; the record-only buttons keep the short dialog', () => {
  assert.match(desk, /catalogue\.buttons\.find\(\(button\) => button\.key === item\.kind\)/);
  assert.match(desk, /onClick=\{\(\) => setSending\(\{ \.\.\.sends, heading: `\$\{item\.number\}\. \$\{item\.label\} — \$\{sends\.label\}` \}\)\}/);
  assert.match(desk, /sending\.department \? \(\s*<DepartmentTaskDialog enquiry=\{enquiry\} catalogue=\{catalogue\} kind=\{sending\.key\}/);
  assert.match(desk, /<SendDialog button=\{sending\}/);
});

test('the task form: department list, filled from the enquiry, the common fields, and no sending unanswered', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /handoffsApi\.prefill\(enquiry\._id\)/);
  assert.match(dialog, /const fresh = startingAnswers\(button, prefill\);/);
  assert.match(dialog, /setAnswers\(fresh\);/);
  assert.match(dialog, /<Field label="Workflow \/ Department">/);
  assert.match(dialog, /<Field label="Attach PDF" hint="Optional, 1 MB at most"/);
  assert.match(dialog, /const PDF_LIMIT = 1024 \* 1024;/);
  assert.match(dialog, /handoffsApi\.attach\(\{ id: enquiry\._id, taskId: sent\.task\._id, file \}\)/);
  assert.match(dialog, /disabled=\{busy \|\| blocked\}/);
  assert.match(dialog, /const blocked = !prefill \|\| Boolean\(missing\) \|\| mustExplain \|\| tooBig \|\| notPdf \|\| eddMissing \|\| \(orders\.length > 1 && !order && !fromTask && !team\) \|\| \(running && !stopOk\);/);
});

test('a closed enquiry, or someone who may not raise tasks, gets plain tiles; open tasks show on their tile', () => {
  assert.match(desk, /const sends = !closed && mayMove && catalogue\.buttons\.find/);
  assert.match(desk, /\{open === 1 \? 'Task open' : `\$\{open\} tasks open`\}/);
});
