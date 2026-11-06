/**
 * Queries on tasks and enquiries [components/TaskQueries.jsx, pages/TaskQueriesPage.jsx;
 * server: services/taskQuery.service.js]: asked by the team working a task, answered by whoever
 * raised it, the answer back on the task.
 *
 *   node --test tests/task-queries.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const queries = read('components/TaskQueries.jsx');
const endpoints = read('api/endpoints.js');

test('the endpoints: ask on a task or an enquiry, reply, close, Got it, the board', () => {
  assert.match(endpoints, /onTask: \(id\) => api\.get\(`\/workspace\/todos\/\$\{id\}\/queries`\)/);
  assert.match(endpoints, /askOnTask: \(\{ id, question \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/queries`, \{ question \}\)/);
  assert.match(endpoints, /askOnEnquiry: \(\{ id, question \}\) => api\.post\(`\/enquiries\/\$\{id\}\/queries`, \{ question \}\)/);
  assert.match(endpoints, /reply: \(\{ id, body \}\) => api\.post\(`\/task-queries\/\$\{id\}\/reply`, \{ body \}\)/);
  assert.match(endpoints, /close: \(\{ id, reason \}\) => api\.post\(`\/task-queries\/\$\{id\}\/close`/);
  assert.match(endpoints, /board: \(params\) => api\.get\('\/task-queries', \{ params \}\)/);
});

test('a query card answers for whoever was asked, follows up for the team that asked, and says who it went to', () => {
  assert.match(queries, /query\.to\?\.name \|\| 'Admin'/);
  assert.match(queries, /'Send answer' : 'Follow up'/);
  assert.match(queries, /taskQueries\.reply\(\{ id: query\._id, body: text \}\)/);
  assert.match(queries, /taskQueries\.seen\(query\._id\)/);
  assert.match(queries, /No longer needed — close/);
});

test('on the task panel and the enquiry page, with Ask a query', () => {
  assert.match(read('components/TaskPanel.jsx'), /<TaskQueries todo=\{task\} onChanged=\{onChanged\} \/>/);
  assert.match(read('pages/EnquiryDetail.jsx'), /<EnquiryQueries enquiry=\{enquiry\} \/>/);
  assert.match(queries, /Ask a query/);
  assert.match(queries, /taskQueries\.askOnTask\(\{ id: todo\._id, question \}\)/);
  /* The old clarifications list leaves out the ones a query shows. */
  assert.match(read('components/EnquiryClarifications.jsx'), /pair\.answer && !pair\.query/);
});

test('Needs your action: queries for you, answered there; answers to yours; and the page of them all', () => {
  const panel = read('components/AttentionPanel.jsx');
  assert.match(panel, /Queries for you/);
  assert.match(panel, /Answers to your queries/);
  assert.match(panel, /<Link to="\/task-queries"/);
  assert.match(read('App.jsx'), /<Route path="task-queries" element=\{<TaskQueriesPage \/>\} \/>/);
  assert.match(read('config/topBar.js'), /\{ to: '\/task-queries', label: 'Task queries' \}/);
  assert.match(read('components/InboxBell.jsx'), /task_query: \{ mark: '\?'/);
  const page = read('pages/TaskQueriesPage.jsx');
  assert.match(page, /'For me'/);
  assert.match(page, /'We asked'/);
  assert.match(page, /'All open', empty: 'No query is waiting for an answer\.', admin: true/);
});

test('Needs Clarification is a query: the comment dialog says where it goes', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /step\.opensQuery \? 'Send query'/);
  assert.match(workflow, /Opened as a query to whoever raised this task/);
  assert.match(read('components/SoDesk.jsx'), /title="Ask a query"/);
});
