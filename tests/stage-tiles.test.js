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
  assert.match(dialog, /<Field label="Attach PDF or photo" hint="Optional — a PDF up to 1 MB, or a photo \(JPEG, PNG, HEIC\) up to 5 MB\. The department sees it on the task\."/);
  assert.match(dialog, /accept="application\/pdf,image\/\*,\.heic,\.heif"/, 'photos as well as PDFs');
  assert.match(dialog, /const tooBig = file && file\.size > \(photo \? PHOTO_LIMIT : PDF_LIMIT\);/);
  assert.match(read('components/TaskPdfLink.jsx'), /<AuthedImage attachmentKey=\{file\.key\} alt=\{`Photo sent with the task: \$\{file\.filename \|\| 'photo'\}`\}/, 'a photo shows as a picture on the task');
  assert.match(dialog, /const PDF_LIMIT = 1024 \* 1024;/);
  assert.match(dialog, /handoffsApi\.attach\(\{ id: enquiry\._id, taskId: sent\.task\._id, file \}\)/);
  assert.match(dialog, /disabled=\{busy \|\| blocked\}/);
  assert.match(dialog, /const blocked = !prefill \|\| Boolean\(missing\) \|\| mustExplain \|\| tooBig \|\| notPdf \|\| eddMissing \|\| \(orders\.length > 1 && !order && !fromTask && !team\) \|\| \(running && !stopOk\) \|\| \(bare\.length > 0 && !bareOk\);/);
});

test('a closed enquiry, or someone who may not raise tasks, gets plain tiles; open tasks show on their tile', () => {
  assert.match(desk, /const sends = !closed && mayMove && catalogue\.buttons\.find/);
  assert.match(desk, /\{open === 1 \? 'Task open' : `\$\{open\} tasks open`\}/);
});
