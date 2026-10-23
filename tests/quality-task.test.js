/**
 * A Quality task about several models [server: departmentTaskForms `qualityAsks`]: the desk list
 * shows each task's models with their pieces and complaint, and the complaint received; the
 * raise-a-task dialog gives the complaint column a full row.
 *
 *   node --test tests/quality-task.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the Quality desk lists each task’s models, pieces and complaints under the enquiry', () => {
  const list = read('components/FinishingDeskList.jsx');
  assert.match(list, /\{row\.models\?\.length > 0 && \(/);
  assert.match(list, /aria-label="Models"/);
  assert.match(list, /\{entry\.quantity \? ` \$\{entry\.quantity\.toLocaleString\('en-IN'\)\} pcs` : ''\}/);
  assert.match(list, /\{entry\.complaint \? <span className="text-danger-400"> — \{entry\.complaint\}<\/span> : null\}/);
  assert.match(list, /\{row\.complaint && <p className="text-xs font-semibold text-danger-400">Complaint: \{row\.complaint\}<\/p>\}/);
});

test('the raise-a-task dialog gives the complaint column a full row, like the model', () => {
  assert.match(read('components/DepartmentTaskDialog.jsx'), /\['model', 'complaint'\]\.includes\(column\.key\) \? 'col-span-2' : ''/);
});
