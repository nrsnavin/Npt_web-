/**
 * Team jobs [pages/TeamJobs.jsx, pages/TeamJobDetail.jsx; server: teamJobs.service] and the home
 * page's board reading only the tasks assigned to the reader [components/DepartmentTasksBoard.jsx].
 *
 *   node --test tests/team-jobs.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barItems } from '../src/config/topBar.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Team jobs sits under Enquiries, with its list and job page', () => {
  const layout = read('components/Layout.jsx');
  assert.match(layout, /\{ to: '\/team-jobs', label: 'Team jobs', module: 'enquiries' \}/);
  const dashboard = [{ key: 'dashboard', label: 'Dashboard', features: [{ to: '/departments/mine', label: 'Dashboard' }, { to: '/enquiries', label: 'All enquiries' }, { to: '/team-jobs', label: 'Team jobs' }] }];
  const enquiries = barItems(dashboard).find((item) => item.key === 'enquiries');
  assert.deepEqual(enquiries.features.map((feature) => feature.to), ['/enquiries', '/team-jobs']);
  const app = read('App.jsx');
  assert.match(app, /<Route path="team-jobs" element=\{<TeamJobs \/>\} \/>/);
  assert.match(app, /<Route path="team-jobs\/:id" element=\{<TeamJobDetail \/>\} \/>/);
});

test('the list: job, buyer, what was asked, where it is now — and the job page plain: now, what you asked, steps, what was done', () => {
  const list = read('pages/TeamJobs.jsx');
  for (const head of ['Job', 'Buyer', 'What was asked', 'Where it is now', 'EDD', 'Given by']) assert.ok(list.includes(`>${head}</th>`), head);
  assert.match(list, /workspace\.todos\.teamJobs\(\{ state, \.\.\.\(search \? \{ search \} : \{\}\) \}\)/);
  const page = read('pages/TeamJobDetail.jsx');
  for (const title of ['What you asked', 'What was done', 'Payments', 'Each model']) assert.ok(page.includes(`title="${title}"`), title);
  assert.match(page, /title=\{`Steps \(\$\{job\.steps\.length\}\)`\}/);
  assert.match(page, />Where it is now<\/p>/);
  assert.match(page, /\{job\.payments\?\.length > 0 && \(/, 'money only where there is some');
});

test('home: "Tasks you gave" and "My tasks" — only what is assigned to the reader, Admin too', () => {
  const home = read('pages/OverviewDashboard.jsx');
  assert.match(home, /<TeamJobsCard \/>/);
  assert.match(home, /<DepartmentTasksBoard\s+assignedToMe\s+title="My tasks"/);
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /\.\.\.\(assignedToMe \? \{ assigned: 'me' \} : \{\}\)/);
  assert.match(board, /\{isAdmin && !assignedToMe && \(/, 'no department picker on the home board');
  assert.match(read('pages/DepartmentTasks.jsx'), /<DepartmentTasksBoard headingAs="h1" department=\{department\} state=\{state\} onFilter=\{onFilter\} \/>/, 'Department Tasks reads every department');
});

test('the job page: a linked job points at its enquiry; a job with no buyer has the buyer named here — or sent as it is', () => {
  const page = read('pages/TeamJobDetail.jsx');
  assert.match(page, /\{job\.linked && <p[^>]*>It follows the enquiry from here — <Link to=\{`\/enquiries\/\$\{job\.linked\._id\}`\}/);
  assert.match(page, /\{job\.mayNameBuyer && <NameBuyer job=\{job\} onNamed=\{setJob\} \/>\}/);
  assert.match(page, /workspace\.todos\.nameJobBuyer\(\{ id: job\._id, \.\.\.body \}\)/);
  assert.match(page, /\{waiting && <button[^>]*onClick=\{\(\) => send\(\{ noBuyer: true \}\)\}>No buyer — send as it is<\/button>\}/, 'only while the goods wait for one');
  assert.match(read('api/endpoints.js'), /nameJobBuyer: \(\{ id, customer, noBuyer \}\) => api\.post\(`\/workspace\/team-jobs\/\$\{id\}\/buyer`, noBuyer \? \{ noBuyer: true \} : \{ customer \}/);
});

test('raising the same ask twice: the open job is offered, and a second raised only when asked to', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /failure\.details\?\.code === 'DUPLICATE_JOB'\) setDuplicate\(/);
  assert.match(dialog, /navigate\(`\/team-jobs\/\$\{duplicate\._id\}`\)/);
  assert.match(dialog, /onClick=\{\(\) => submit\(null, \{ anyway: true \}\)\}>Raise another anyway<\/button>/);
  assert.match(dialog, /\.\.\.\(anyway \? \{ allowDuplicate: true \} : \{\}\)/);
});
