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
  assert.deepEqual(by.enquiries, ['/enquiries']);
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

test('the layout: the bar, account bar with name · role and initials, no sidebar', () => {
  const layout = read('components/Layout.jsx');
  assert.match(layout, /<header className="[^"]*bg-ink-850/, "the bar keeps the app’s own theme");
  assert.match(layout, /<BarItem key=\{item\.key\} item=\{item\} lit=\{lit === item\.key\} \/>/);
  assert.match(layout, /<AccountBar/);
  assert.match(layout, /\{user\?\.name \|\| who\}\{roleLabel \? ` · \$\{roleLabel\}` : ''\}/, 'the name the person knows, then the role');
  assert.match(layout, /\{user\?\.email \? <span className="block">\{user\.email\}<\/span> : null\}/, 'the email in the menu');
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
  for (const text of ['Company activity overview', '+ Add Party', '+ New Enquiry', 'label="Customers"', 'Due today', 'Active enquiries', 'Quotations', 'Edit / Verify enquiry →', 'Customer / Party Master', 'No activity 7+ days']) {
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
  assert.match(board, /<TaskPanel\s+task=\{opened\.task\}\s+startWith=\{opened\.status\}\s+mayWork=\{mayWork\(opened\.task\)\}/);
  assert.match(read('components/TaskPanel.jsx'), /<TaskWorkflow todo=\{task\} startWith=\{startWith\} onChanged=\{onChanged\} \/>/);
  assert.match(read('components/TaskWorkflow.jsx'), /todo\?\.completed \|\| startWith === todo\?\.status\) return;\s+started\.current = true;\s+choose\(startWith\);/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /tasks: \(params\) => api\.get\('\/dashboard\/tasks', \{ params \}\)/);
  assert.match(endpoints, /parties: \(params\) => api\.get\('\/dashboard\/parties', \{ params \}\)/);
});

test('Admin filters Department Tasks by any department, and open / done / all', () => {
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /\{isAdmin && !assignedToMe && \(\s*<select\s+aria-label="Department"/, 'on Department Tasks — the home board reads only the tasks assigned to the reader');
  assert.match(board, /\{DEPARTMENT_CHOICES\.map\(\(entry\) => <option key=\{entry\.key\} value=\{entry\.key\}>\{entry\.label\}<\/option>\)\}/, 'every department listed, even with nothing open — a shared desk as one');
  assert.match(board, /aria-label="Open or done"/);
  /* A department chip picked on Open may have nothing under Done: the chips start over. */
  assert.match(board, /setFilter\(\{ state: event\.target\.value \}\); setChip\('all'\);/);
  assert.match(board, /overview\.tasks\(\{ \.\.\.\(department \? \{ department \} : \{\}\), state, \.\.\.\(assignedToMe \? \{ assigned: 'me' \} : \{\}\) \}\)/);
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
  assert.match(hook, /new window\.Notification\(title, \{ body, tag: 'npt-queries'/);
  assert.match(hook, /document\.title = count \?/);
  const panel = read('components/dock/QueriesPanel.jsx');
  assert.match(panel, /queriesApi\.read\(id\)/, 'opening a thread marks it read');
  assert.match(panel, /queriesApi\.say\(\{ id, kind: 'reply', body: text \}\)/);
  assert.match(read('api/endpoints.js'), /unread: \(\) => api\.get\('\/queries\/unread'/);
});

test('every task on the board opens into its panel: Admin works any department’s task from there', () => {
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /onClick=\{\(\) => setOpened\(\{ task \}\)\}>\{mayWork\(task\) && !task\.completed \? 'Open \/ update' : 'Open'\}<\/button>/);
  assert.doesNotMatch(board, /\bModal\b/, 'the panel owns its dialog');
  const panel = read('components/TaskPanel.jsx');
  assert.match(panel, /<HandoffTaskActions todo=\{task\} onChanged=\{onChanged\} \/>/, 'Update / Done / Send back / Change date');
  assert.match(panel, /\{!holder && <button type="button" className="row-action" onClick=\{claim\}>I’ll take it<\/button>\}/);
  assert.match(panel, /mayWork && !task\.completed \?/);
  assert.match(panel, /Read-only — this task is on the \{departmentLabel\(task\.department\)\} queue\./);
  /* What was asked and what happened are drawn by the shared facts table and timeline [TaskHistory]. */
  assert.match(panel, /<TaskFacts button=\{button\} task=\{task\} \/>/);
  assert.match(panel, /<TaskTimeline task=\{task\} button=\{button\} \/>/);
});

test('Quality, Printing and Assembly are one desk: one choice on the board, each team a tab across the top; marketing’s figures are gone', () => {
  const pipeline = read('utils/pipeline.js');
  assert.match(pipeline, /\{ key: 'printing', label: 'Printing' \}/);
  assert.match(pipeline, /key: 'finishing', label: 'Quality · Printing · Assembling', departments: \['quality', 'printing', 'assembling'\]/);
  assert.match(pipeline, /export const DEPARTMENT_CHOICES = DEPARTMENTS\.flatMap/);
  const tabs = read('components/DeskTabs.jsx');
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"\s+aria-selected=\{active\}/);
  assert.match(tabs, /export const firstDeskTab = \(desk, departments = \[\]\) => departments\.find\(\(key\) => desk\.includes\(key\)\) \|\| desk\[0\];/, 'the person’s main team first — their departments are main-first');
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /const desk = department && deskOf\(department\)\?\.key === department \? deskOf\(department\) : null;/);
  assert.match(board, /<DeskTabs departments=\{desk\.departments\} counts=\{deskCounts\} value=\{deskTab\}/);
  assert.match(board, /everyTask\.filter\(\(task\) => task\.department === deskTab\)/, 'one team’s tasks on screen');
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /\{deskList && <DeskTabs departments=\{deskList\} counts=\{deskCounts\} value=\{deskTab\} onChange=\{setDeskChoice\} \/>\}/);
  assert.match(desk, /everyRow\.filter\(\(row\) => row\.task\.department === deskTab\)/);
  assert.match(desk, /everyRequest\.filter\(\(task\) => task\.department === deskTab\)/, 'requests follow the tab too');
  const overview = read('pages/OverviewDashboard.jsx');
  assert.match(overview, /\{isAdmin && \(\s*<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">\s*<FigureTile label="Customers"/, 'the figures are Admin’s only');
});

test('My Payment Follow-up is a chip on the board; the dashboard lists every open enquiry; the marketing figures screen is gone', () => {
  const board = read('components/DepartmentTasksBoard.jsx');
  assert.match(board, /\{ key: 'payment', label: 'My Payment Follow-up', count: tasks\.filter\(isPaymentFollowUp\)\.length \}/);
  assert.match(board, /if \(chip === 'payment' && !isPaymentFollowUp\(task\)\) return false;/);
  const overview = read('pages/OverviewDashboard.jsx');
  assert.match(overview, /aria-label="Open enquiries"/);
  assert.match(overview, /<Enquiries embedded \/>/, 'the same list, with its filters, scoped by the server');
  assert.match(read('App.jsx'), /<Route path="dashboard\/marketing" element=\{<Navigate to="\/departments\/mine" replace \/>\} \/>/);
  assert.doesNotMatch(read('components/Layout.jsx'), /My figures/);
});

test('the Production in charge has the floor on the bar, right after My work: planning board and the presses', () => {
  const production = ADMIN
    .filter((entry) => ['dashboard', 'queries', 'production'].includes(entry.key))
    .map((entry) => (entry.key === 'dashboard' ? { ...entry, features: entry.features.filter((feature) => feature.to === '/departments/mine') } : entry));
  const items = barItems(production, ['dashboard', 'production', 'queries'], { short: true, productionFloor: true });
  assert.deepEqual(items.map((item) => item.label).slice(0, 2), ['My work', 'Production floor']);
  assert.deepEqual(items.find((item) => item.key === 'floor').features.map((feature) => feature.to), ['/production/today', '/production/plan', '/floor']);
  assert.equal(litItem('/production/plan', items), 'floor');
  assert.equal(barItems(production, ['dashboard', 'production', 'queries'], { short: true }).some((item) => item.key === 'floor'), false, 'not for the rest of Production');
  const layout = readFileSync(new URL('../src/components/Layout.jsx', import.meta.url), 'utf8');
  assert.match(layout, /const productionFloor = user\?\.productionInCharge === true && canRead\('production'\) && floorPlanning;/, 'only while Admin has floor planning on');
  assert.match(layout, /onPlantChange\(\(plant\) => setFloorPlanning\(Boolean\(plant\?\.floorPlanning\)\)\)/, 'followed as Admin flips it');
  assert.match(readFileSync(new URL('../src/utils/plantSettings.js', import.meta.url), 'utf8'), /for \(const listener of listeners\) listener\(plant\);/);
});
