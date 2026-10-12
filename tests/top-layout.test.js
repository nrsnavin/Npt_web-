/**
 * The plant's own layout [config/topBar.js, components/Layout.jsx, pages/OverviewDashboard.jsx,
 * components/DepartmentTasksBoard.jsx]: the dark bar with Dashboard · Enquiries · Department
 * Tasks · Quotations · Masters & Access, the account bar, no sidebar, and the overview for Admin
 * and marketing.
 *
 *   node --test tests/top-layout.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barItems, litItem } from '../src/config/topBar.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/* What an Admin may open, in the shape Layout's `readable` has. */
const ADMIN = [
  { key: 'dashboard', label: 'Dashboard', features: [
    { to: '/departments/mine', label: 'Dashboard' },
    { to: '/enquiries', label: 'All enquiries', end: true, children: [{ to: '/enquiries/drafts', label: 'Draft enquiries' }] },
    { to: '/dashboard/marketing', label: 'My figures' },
    { to: '/departments', label: 'All departments', end: true },
  ] },
  { key: 'queries', label: 'Queries', features: [{ to: '/queries', label: 'Questions & answers' }] },
  { key: 'pricing', label: 'Pricing', features: [{ to: '/quotations', label: 'Quotations', end: true }, { to: '/quotations/sent', label: 'Sent quotations' }] },
  { key: 'production', label: 'Production', features: [{ to: '/production', label: 'Production status' }] },
  { key: 'customers', label: 'Customers', features: [{ to: '/customers', label: 'All customers' }] },
  { key: 'catalogue', label: 'Catalogue', features: [{ to: '/moulds', label: 'Models & moulds' }] },
  { key: 'admin', label: 'Administration', features: [{ to: '/users', label: 'Users and access' }] },
];

test('the bar is the five in the plant’s words, then More', () => {
  const items = barItems(ADMIN);
  assert.deepEqual(items.map((item) => item.label), ['Dashboard', 'Enquiries', 'Department Tasks', 'Quotations', 'Masters & Access', 'More']);
  const by = Object.fromEntries(items.map((item) => [item.key, item.features.map((feature) => feature.to)]));
  assert.deepEqual(by.dashboard, ['/departments/mine']);
  assert.deepEqual(by.enquiries, ['/enquiries', '/dashboard/marketing']);
  assert.deepEqual(by.tasks, ['/tasks', '/departments']);
  assert.deepEqual(by.quotations, ['/quotations', '/quotations/sent']);
  assert.deepEqual(by.masters, ['/customers', '/moulds', '/users']);
  assert.deepEqual(by.more, ['/production'], 'the rest is under More');
  assert.equal(items.some((item) => item.features.some((feature) => feature.to === '/queries')), false, 'Queries live in the panel, not on the bar');
});

test('a department keeps its own screen on the bar, beside the five', () => {
  const production = ADMIN
    .filter((entry) => ['dashboard', 'queries', 'production'].includes(entry.key))
    .map((entry) => (entry.key === 'dashboard' ? { ...entry, features: entry.features.filter((feature) => feature.to === '/departments/mine') } : entry));
  const items = barItems(production, ['dashboard', 'production', 'queries']);
  assert.deepEqual(items.map((item) => item.label), ['Dashboard', 'Department Tasks', 'Production']);
  assert.equal(items.some((item) => item.key === 'more'), false);
});

test('the lit item is the longest match', () => {
  const items = barItems(ADMIN);
  assert.equal(litItem('/departments/mine', items), 'dashboard', 'not Department Tasks’ /departments');
  assert.equal(litItem('/departments/production', items), 'tasks');
  assert.equal(litItem('/enquiries/drafts', items), 'enquiries');
  assert.equal(litItem('/quotations/6aa2', items), 'quotations');
  assert.equal(litItem('/moulds/1', items), 'masters');
  assert.equal(litItem('/production', items), 'more');
  assert.equal(litItem('/profile', items), undefined, 'a screen on no item lights nothing');
});

test('the layout: the bar, account bar with email · role and initials, no sidebar', () => {
  const layout = read('components/Layout.jsx');
  assert.match(layout, /<header className="[^"]*bg-ink-850/, "the bar keeps the app’s own theme");
  assert.match(layout, /<BarItem key=\{item\.key\} item=\{item\} lit=\{lit === item\.key\} \/>/);
  assert.match(layout, /<AccountBar/);
  assert.match(layout, /\{who\}\{roleLabel \? ` · \$\{roleLabel\}` : ''\}/);
  assert.match(layout, /initialsOf\(user\?\.name, who\)/);
  assert.doesNotMatch(layout, /<aside/, 'no left sidebar');
  assert.doesNotMatch(layout, /ModuleTabs/);
  /* The reference is for the layout only: no colour of its own, the theme is the app's. */
  assert.doesNotMatch(layout, /#17383d|bg-white\/|text-white\/80/i);
});

test('Admin and marketing open on the overview; every other department on its desk', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  /* Admin as the server means it — the role or the Management department [AuthContext isManagement]. */
  assert.match(dashboard, /if \(key === 'mine' && \(isManagement \|\| departments\.includes\('marketing'\)\)\) return <OverviewDashboard \/>;/);
  assert.match(read('context/AuthContext.jsx'), /isManagement: user\?\.role === 'admin' \|\| \(user\?\.departments \|\| \[user\?\.department\]\)\.includes\('management'\)/);
  assert.match(read('pages/OverviewDashboard.jsx'), /isManagement: isAdmin/);
  const page = read('pages/OverviewDashboard.jsx');
  for (const text of ['Company activity overview', '+ Add Party', '+ New Enquiry', 'My customers', 'Due today', 'Active enquiries', 'Quotations', 'Edit / Verify enquiry →', 'Customer / Party Master', 'No activity 7+ days']) {
    assert.ok(page.includes(text), text);
  }
  assert.match(page, /overview\.parties\(\{ filter, page, search/);
  assert.match(page, /to="\/enquiries\?marketingStatus=enquiry_received"/);
  assert.match(read('App.jsx'), /<Route path="tasks" element=\{<DepartmentTasks \/>\} \/>/);
});

test('Department Tasks: a status list only for whoever works the task, and the move opens with its remark', () => {
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /const \{ isManagement: isAdmin, departments = \[\], user \} = useAuth\(\);/);
  /* The server's rule: Admin, the person it is assigned to, or its department. */
  assert.match(board, /const mayWork = \(task\) => isAdmin \|\| \(me && String\(task\.user\?\._id \|\| task\.user \|\| ''\) === me\) \|\| departments\.includes\(task\.department\);/);
  assert.match(board, /if \(!statuses\.length \|\| !mayWork \|\|/);
  assert.match(board, /<TaskWorkflow\s+todo=\{moving\.task\}\s+startWith=\{moving\.status\}/);
  assert.match(read('components/TaskWorkflow.jsx'), /todo\?\.completed \|\| startWith === todo\?\.status\) return;\s+started\.current = true;\s+choose\(startWith\);/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /tasks: \(params\) => api\.get\('\/dashboard\/tasks', \{ params \}\)/);
  assert.match(endpoints, /parties: \(params\) => api\.get\('\/dashboard\/parties', \{ params \}\)/);
});

test('Admin filters Department Tasks by any department, and open / done / all', () => {
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /\{isAdmin && \(\s*<select\s+aria-label="Department"/);
  assert.match(board, /\{DEPARTMENTS\.map\(\(entry\) => <option key=\{entry\.key\} value=\{entry\.key\}>\{entry\.label\}<\/option>\)\}/, 'every department listed, even with nothing open');
  assert.match(board, /aria-label="Open or done"/);
  /* A department chip picked on Open may have nothing under Done: the chips start over. */
  assert.match(board, /setFilter\(\{ state: event\.target\.value \}\); setChip\('all'\);/);
  assert.match(board, /overview\.tasks\(\{ \.\.\.\(department \? \{ department \} : \{\}\), state \}\)/);
  assert.match(board, /if \(!statuses\.length \|\| !mayWork \|\| task\.completed\)/, 'a finished task is read, not moved');
  assert.match(board, /const isLate = \(task\) => Boolean\(!task\.completed &&/);
  assert.match(read('api/endpoints.js'), /tasks: \(params\) => api\.get\('\/dashboard\/tasks', \{ params \}\)/);
  const page = read('pages/DepartmentTasks.jsx');
  assert.match(page, /params\.get\('department'\)/);
  assert.match(page, /params\.get\('state'\) \|\| 'open'/);
  assert.match(read('pages/DepartmentsOverview.jsx'), /to=\{`\/tasks\?department=\$\{row\.department\}`\}/);
});

test('draft enquiries sit, highlighted, inside New Enquiries — not a menu item of their own', () => {
  assert.doesNotMatch(read('components/Layout.jsx'), /label: 'Draft enquiries'/);
  const page = read('pages/OverviewDashboard.jsx');
  assert.match(page, /buyerCardsApi\.list\(\)/);
  assert.match(page, /New Enquiries \(\{newEnquiries\.total \+ draftRows\.length\}\)/);
  assert.match(page, /data-draft className="rounded-xl border-2 border-warn-500\/50 bg-warn-500\/\[0\.08\] p-3"/);
  assert.match(page, /to=\{`\/enquiries\/drafts\?card=\$\{card\._id\}`\}/);
});

test('papers go with a message to the buyer; Dispatch and Reception upload theirs on the task', () => {
  const panel = read('components/EnquiryContactPanel.jsx');
  assert.match(panel, /<AttachPicker documents=\{documents\} picked=\{picked\.whatsapp\}/);
  assert.match(panel, /<AttachPicker documents=\{documents\} picked=\{picked\.email\}/);
  assert.match(panel, /enquiriesApi\.attachables\(enquiry\._id\)/);
  assert.match(panel, /channel, body: whatsapp\.trim\(\), attachments \}/);
  assert.match(read('components/TaskWorkflow.jsx'), /<TaskDocuments todo=\{todo\} kinds=\{button\.form\.documents\} \/>/);
  assert.match(read('api/endpoints.js'), /api\.post\(`\/workspace\/todos\/\$\{id\}\/documents`, form, \{ feedback: false \}\)/);
});

test('Queries: a panel at the bottom right with its unread count and an alert for new ones', () => {
  const rail = read('components/dock/WorkspaceRail.jsx');
  assert.match(rail, /const inbox = useQueryInbox\(\{ enabled: seesQueries/);
  assert.match(rail, /aria-label=\{`Queries\$\{unreadQueries \? `, \$\{unreadQueries\} unread` : ''\}`\}/, 'the badge is said to a screen reader too');
  assert.match(rail, /\? <QueriesPanel inbox=\{inbox\} openId=\{queryId\} onOpen=\{setQueryId\} \/>/, 'drawn directly, so a typed reply survives each poll');
  assert.match(rail, /fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 sm:hidden/, 'its own corner button on a phone');
  const hook = read('hooks/useQueryInbox.js');
  assert.match(hook, /const POLL_MS = 30000;/);
  assert.match(hook, /toast\(title, body\);/);
  assert.match(hook, /new Notification\(title, \{ body, tag: 'npt-queries'/);
  assert.match(hook, /document\.title = count \?/);
  const panel = read('components/dock/QueriesPanel.jsx');
  assert.match(panel, /queriesApi\.read\(id\)/, 'opening a thread marks it read');
  assert.match(panel, /queriesApi\.say\(\{ id, kind: 'reply', body: text \}\)/);
  assert.match(read('api/endpoints.js'), /unread: \(\) => api\.get\('\/queries\/unread'/);
});
