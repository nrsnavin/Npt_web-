/**
 * Escalate to Admin [components/HandoffTaskActions.jsx, AttentionPanel.jsx, TaskCard.jsx; server:
 * handoff.service `escalateToAdmin`]: any open task, with the issue; Admin alone sees it under
 * "Needs your action" and answers it there; the task shows "With Admin" until then.
 *
 *   node --test tests/escalate-task.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Escalate to Admin is on every open task — in the menu and the row — unless it is already with Admin', () => {
  const actions = read('components/HandoffTaskActions.jsx');
  assert.match(actions, /const withAdmin = Boolean\(todo\.adminEscalation\?\.at && !todo\.adminEscalation\.resolvedAt\);/);
  assert.match(actions, /\{ key: 'escalate', label: 'Escalate to Admin', hint: 'An issue only Admin can settle — Admin alone sees it', onSelect: \(\) => setMode\('escalate'\) \}/);
  assert.match(actions, /\.concat\(escalate, adminClose\)/, 'in the menu for everyone — whatever else the form allows — before Admin’s own');
  assert.match(actions, /: <button type="button" className="row-action" onClick=\{\(\) => setMode\('escalate'\)\}>Escalate to Admin<\/button>\}/);
  assert.match(actions, />With Admin<\/span>/);
  assert.match(actions, /escalate: `Escalate to Admin — \$\{name\}`/);
  assert.match(actions, /escalate: 'What the issue is'/);
  assert.match(actions, /Only Admin sees this, under their Needs your action/);
  assert.match(actions, /workspace\.todos\.escalateToAdmin\(\{ id: todo\._id, reason: note \}\)/);
  assert.match(actions, /\['admin', 'back', 'date', 'escalate'\]\.includes\(mode\) \? 5 : 2/, 'the issue in words');
  assert.match(read('api/endpoints.js'), /escalateToAdmin: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/escalate-admin`, payload\)/);
  assert.match(read('api/endpoints.js'), /resolveEscalation: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/escalate-admin\/resolve`, payload\)/);
});

test('Admin answers the escalation under Needs your action, and the task card says it is with Admin', () => {
  const panel = read('components/AttentionPanel.jsx');
  assert.match(panel, /filter\(\(notice\) => notice\.status === 'escalated'\)/);
  assert.match(panel, /<p className="eyebrow">Escalated to you<\/p>/);
  assert.match(panel, /\{departmentLabel\(notice\.department\)\} escalated to you/);
  assert.match(panel, /workspace\.todos\.resolveEscalation\(\{ id: notice\.task\?\._id \|\| notice\.task, note: answer \}\)/);
  assert.match(panel, /disabled=\{busy \|\| answer\.trim\(\)\.length < 2\}/);
  assert.match(panel, /unread = notices\.filter\(\(notice\) => !notice\.readAt\)\.length \+ escalations\.length/, 'counted in the badge');
  const card = read('components/TaskCard.jsx');
  assert.match(card, /task\.adminEscalation\?\.at && !task\.adminEscalation\.resolvedAt && !task\.completed/);
  assert.match(card, /title=\{task\.adminEscalation\.reason\}>With Admin<\/span>/);
});
