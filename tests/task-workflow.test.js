/**
 * A department's own workflow on its task [components/TaskWorkflow.jsx; server:
 * config/departmentTaskForms.js `statuses`] — the SO team's statuses, contact details and PDF.
 *
 *   node --test tests/task-workflow.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const workflow = read('components/TaskWorkflow.jsx');

test('the statuses come from the server; a comment status asks, the PDF status uploads', () => {
  assert.match(workflow, /const statuses = button\?\.form\?\.statuses \|\| \[\];/);
  assert.match(workflow, /if \(step\.pdf\) return setUploading\(true\);/);
  assert.match(workflow, /if \(step\.comment\) return setAsking\(step\);/);
  assert.match(workflow, /workspace\.todos\.status\(\{ id: todo\._id, status: asking\.key, note \}\)/);
  assert.match(workflow, /workspace\.todos\.result\(\{ id: todo\._id, file, note \}\)/);
  assert.match(workflow, /Edit contact details/);
  assert.match(workflow, /const editable = \(button\.asks \|\| \[\]\)\.filter\(\(field\) => field\.editable\);/);
});

test('it is on the dashboard card and the enquiry; the PDF task has no plain Done', () => {
  assert.match(read('pages/DepartmentDashboard.jsx'), /<TaskWorkflow todo=\{task\} onChanged=\{onChanged\} \/>/);
  assert.match(read('components/DepartmentDesk.jsx'), /<TaskWorkflow todo=\{task\} onChanged=\{refresh\} \/>/);
  assert.match(read('components/HandoffTaskActions.jsx'), /\{!byUpload && <button type="button" className="row-action" onClick=\{\(\) => setMode\('done'\)\}>/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /api\.post\(`\/workspace\/todos\/\$\{id\}\/status`, payload\)/);
  assert.match(endpoints, /api\.post\(`\/workspace\/todos\/\$\{id\}\/result`, form, \{ feedback: false \}\)/);
});

test('an uploaded sales order shows at the top of the enquiry’s departments, with who and when', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const results = tasks\.filter\(\(task\) => task\.resultFile\?\.key\);/);
  assert.match(desk, /\{button\?\.form\?\.resultTitle \|\| button\?\.label \|\| 'Document'\} uploaded/);
  assert.match(desk, /<TaskPdfLink file=\{task\.resultFile\} className="text-sm" \/>/);
});

test('an enquiry may be handed to marketing, to an Admin, or taken by the reader', () => {
  const delegate = read('components/DelegateEnquiry.jsx');
  assert.match(delegate, /<optgroup label="Marketing">/);
  assert.match(delegate, /<optgroup label="Admin">/);
  assert.match(delegate, /person\.self \? ' \(you\)' : ''/);
});

test('the departments panel reloads when the enquiry is handed to someone else', () => {
  assert.match(read('components/DepartmentDesk.jsx'), /\}, \[enquiry\._id, owner\]\);/);
});

test('only Admin is offered "Hand to someone" on the enquiry', () => {
  assert.match(read('pages/EnquiryDetail.jsx'), /\{isAdmin && <DelegateEnquiry enquiry=\{enquiry\} onDone=\{afterHandover\} \/>\}/);
});

test('in Production the enquiry shows the EDD, or that it was asked and not given', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const inProduction = \['production_edd', 'assembling'\]\.includes\(stage\) \|\| Boolean\(production\?\.asked\);/);
  assert.match(desk, /EDD \{formatDate\(production\.edd\.edd\)\}/);
  assert.match(desk, /EDD not given yet/);
  assert.match(desk, /plant expects \$\{formatDate\(line\.expectedCompletion\)\}/);
});

test('raising a task the department already has adds to it, and says so', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /addToOpen: true/);
  assert.match(dialog, /if \(sent\.addedTo\) \{/);
  assert.match(dialog, /open task`/);
});
