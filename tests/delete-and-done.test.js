/**
 * Admin deleting an enquiry, a task or a team job [components/DeleteRecord.jsx; server:
 * deletion.service], and the done half of every task list read only when it is opened, a page at
 * a time [components/dock/WorkspaceContext.jsx `loadDone`, pages/TeamJobs.jsx "Load more"].
 *
 *   node --test tests/delete-and-done.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the delete dialog reads what goes and what stops it, and asks for the number typed', () => {
  const dialog = read('components/DeleteRecord.jsx');
  assert.match(dialog, /asked\.current\(\)\.then\(\(data\) => live && setPlan\(data\)\)/, 'the preview first');
  assert.match(dialog, /plan\.blockers\.map\(\(line\) => <li key=\{line\}>\{line\}<\/li>\)/, 'what stops it, in words');
  assert.match(dialog, /typed\.trim\(\)\.toUpperCase\(\) === String\(confirmWord\)\.toUpperCase\(\)/, 'typed to confirm');
  assert.match(dialog, /\{!blocked && <button type="button" className="btn-danger" disabled=\{!ready\}/, 'no delete button while blocked');
});

test('Admin deletes an enquiry, a team job or a task from where they read it', () => {
  const enquiry = read('pages/EnquiryDetail.jsx');
  assert.match(enquiry, /\{isAdmin && \(\s*<DeleteRecord\s+label="Delete enquiry"/);
  assert.match(enquiry, /confirmWord=\{enquiry\.number\}/);
  assert.match(enquiry, /remove=\{\(reason\) => enquiriesApi\.remove\(\{ id: enquiry\._id, reason \}\)\}/);
  const job = read('pages/TeamJobDetail.jsx');
  assert.match(job, /actions=\{isAdmin \? \(/);
  assert.match(job, /label="Delete job"/);
  const panel = read('components/TaskPanel.jsx');
  assert.match(panel, /\{isManagement && \(/);
  assert.match(panel, /preview=\{\(\) => workspace\.todos\.deletion\(task\._id\)\}/);
  const api = read('api/endpoints.js');
  assert.match(api, /deletion: \(id\) => api\.get\(`\/enquiries\/\$\{id\}\/deletion`\)/);
  assert.match(api, /remove: \(\{ id, reason \}\) => api\.delete\(`\/enquiries\/\$\{id\}`/);
  assert.match(api, /destroy: \(\{ id, reason \}\) => api\.delete\(`\/workspace\/todos\/\$\{id\}`/);
});

test('task lists load what is open; Done is read when opened, with Load more', () => {
  const context = read('components/dock/WorkspaceContext.jsx');
  assert.match(context, /workspace\.todos\.list\(\{ scope, status: 'open' \}\)/);
  assert.match(context, /workspace\.todos\.list\(\{ scope, status: 'done', page, limit: 30 \}\)/);
  for (const file of ['components/dock/TodoPanel.jsx', 'components/TodoBoard.jsx']) {
    const list = read(file);
    assert.match(list, /onClick=\{openDone\}/, file);
    assert.match(list, /if \(!doneLoaded\) loadDone\(\);/, file);
    assert.match(list, /loadDone\(\{ more: true \}\)/, file);
  }
  assert.match(read('components/DepartmentTasks.jsx'), /workspace\.todos\.list\(\{ scope: 'department', status: 'open' \}\)/);
  const jobs = read('pages/TeamJobs.jsx');
  assert.match(jobs, /workspace\.todos\.teamJobs\(\{ state, page: page \+ 1 \}\)/);
  assert.match(jobs, />Load more done jobs<\/button>/);
});

test('Admin closes an enquiry, a task or a team job where it stands — with a reason; nothing is deleted', () => {
  const dialog = read('components/CloseRecord.jsx');
  assert.match(dialog, /reason\.trim\(\)\.length >= 5/, 'a reason first');
  assert.match(dialog, /plan\.tasks\.map\(\(row\) => <li key=\{row\._id\}>\{row\.title\}<\/li>\)/, 'what closes with it');
  assert.match(dialog, /Kept open until the money is in/);
  const enquiry = read('pages/EnquiryDetail.jsx');
  assert.match(enquiry, /\{isAdmin && enquiry\.stage !== 'closed' && \(\s*<CloseRecord\s+label="Close enquiry"/);
  assert.match(enquiry, /close=\{\(reason\) => handoffsApi\.send\(\{ id: enquiry\._id, kind: 'task_closed', note: reason \}\)\}/);
  const panel = read('components/TaskPanel.jsx');
  assert.match(panel, /\{!task\.completed && task\.kind && !task\.holds && \(\s*<CloseRecord\s+label="Close task"/);
  assert.match(panel, /workspace\.todos\.adminClose\(\{ id: task\._id, reason \}\)/);
  const job = read('pages/TeamJobDetail.jsx');
  assert.match(job, /\{!job\.now\.done && \(\s*<CloseRecord\s+label="Close job"/);
  assert.match(job, /workspace\.todos\.closeJob\(\{ id: job\._id, reason \}\)/);
  const api = read('api/endpoints.js');
  assert.match(api, /closing: \(id\) => api\.get\(`\/enquiries\/\$\{id\}\/closing`\)/);
  assert.match(api, /closeJob: \(\{ id, reason \}\) => api\.post\(`\/workspace\/team-jobs\/\$\{id\}\/close`, \{ reason \}/);
});
