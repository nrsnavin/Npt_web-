/**
 * Questions and answers between departments at the top of the dashboard
 * [components/AttentionPanel.jsx; server: handoff.service `attentionFor`].
 *
 *   node --test tests/attention-panel.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const panel = read('components/AttentionPanel.jsx');

test('a question is answered right there, and the answer goes back as the task done', () => {
  assert.match(panel, /Questions for you/);
  assert.match(panel, /workspace\.todos\.done\(\{ id: task\._id, note: reply \}\)/);
  assert.match(panel, /disabled=\{busy \|\| reply\.trim\(\)\.length < 2\}/);
});

test('a reply shows with the task’s status beside it, and "Got it" clears it', () => {
  assert.match(panel, /Replies to your department/);
  assert.match(panel, /<TaskWorkflow todo=\{task\} onChanged=\{onChanged\} \/>/);
  assert.match(panel, /workspace\.todos\.seen\(task\._id\)/);
});

test('at the top of every dashboard, above the tabs, on every tab', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /<AttentionPanel attention=\{data\.attention\} onChanged=\{reload\} \/>/);
  assert.ok(page.indexOf('<AttentionPanel') < page.indexOf('role="tablist"'), 'above the tabs');
  assert.ok(!/tab === '[a-z]+' && <AttentionPanel/.test(page), 'not tied to one tab');
});
