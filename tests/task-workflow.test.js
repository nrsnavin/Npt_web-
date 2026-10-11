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
