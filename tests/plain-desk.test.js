/**
 * The department desks in plain words, for people new to computers [config/topBar.js,
 * context/AuthContext.jsx, pages/DepartmentDashboard.jsx, components/ProductionQueueList.jsx,
 * components/FinishingQueueList.jsx]: a short bar, the person's own team first, counts on the
 * filter chips instead of tiles, cards on a phone, and the less-used filters folded away.
 *
 *   node --test tests/plain-desk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barItems, usesShortBar } from '../src/config/topBar.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const PRINTING = [
  { key: 'dashboard', label: 'Dashboard', features: [
    { to: '/departments/mine', label: 'Dashboard' },
    { to: '/departments', label: 'All departments', end: true },
  ] },
  { key: 'pricing', label: 'Pricing', features: [{ to: '/quotations', label: 'Quotations', end: true }] },
  { key: 'production', label: 'Production', features: [{ to: '/production', label: 'Production status' }] },
  { key: 'customers', label: 'Customers', features: [{ to: '/customers', label: 'All customers' }] },
];

test('the shop-floor and office teams keep a short bar; marketing and Admin the full one', () => {
  assert.equal(usesShortBar(['printing', 'quality']), true);
  assert.equal(usesShortBar(['despatch']), true);
  assert.equal(usesShortBar(['marketing']), false);
  assert.equal(usesShortBar(['production', 'management']), false);
  assert.equal(usesShortBar(['production'], { isAdmin: true }), false);
  assert.equal(usesShortBar([]), false);
});

test('a short bar: My work, Quotations where readable, the team’s own screen, and the rest under More', () => {
  const items = barItems(PRINTING, ['dashboard', 'production'], { short: true });
  assert.deepEqual(items.map((item) => item.label), ['My work', 'Quotations', 'Production', 'More']);
  const more = items.find((item) => item.key === 'more').features.map((feature) => feature.to);
  assert.ok(more.includes('/tasks'), 'Department Tasks is under More, not gone');
  assert.ok(more.includes('/departments'));
  assert.ok(more.includes('/customers'), 'Masters & Access is under More');
  assert.deepEqual(barItems(PRINTING, ['dashboard', 'production']).map((item) => item.label).slice(0, 2), ['Dashboard', 'Department Tasks'], 'the full bar is unchanged');
});

test('the person’s main department comes first, so a shared desk opens on their own team', () => {
  assert.match(read('context/AuthContext.jsx'), /\[user\.department, \.\.\.\(user\.departments \|\| \[\]\)\.filter\(\(key\) => key !== user\.department\)\]/);
});

test('the desk: counts on the filter chips, plain names, the team as the title, help folded', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.doesNotMatch(page, /function Tile\(/, 'no tiles repeating the chips');
  assert.match(page, /const filterCounts = \{ all: enquiries\.length, late, today, unclaimed, mine \};/);
  assert.match(page, /\{ key: 'unclaimed', label: 'Not assigned' \}/);
  assert.match(page, /\{ key: 'mine', label: 'My jobs' \}/);
  assert.match(page, /title=\{seesEnquiries \? `\$\{figures\.label\} dashboard` : deskLabel\}/);
  assert.match(page, /const helpFolded = !everyone && !enquiryDesk;/);
  assert.match(page, /<summary className="[^"]*">Help and links<\/summary>/);
  assert.match(page, />\s*Take this job\s*</);
});

test('a phone opens a table desk on cards; a kept choice still wins', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /window\.matchMedia\('\(min-width: 768px\)'\)\.matches/);
  assert.match(page, /if \(kept\) return kept === 'cards' \? 'cards' : 'table';\s*return wideScreen\(\) \? 'table' : 'cards';/);
});

test('the queues: the date chips and search in view, the rest under More filters, Open job to work one', () => {
  const production = read('components/ProductionQueueList.jsx');
  assert.match(production, /\{showMore \? 'Fewer filters' : 'More filters'\}\{moreOn \? ` \(\$\{moreOn\} on\)` : ''\}/);
  assert.match(production, /\{showMore && \(\s*<div className="space-y-3">\s*<div [^>]*aria-label="Taken for production">/);
  assert.match(production, />Open job →<\/Link>/);
  const finishing = read('components/FinishingQueueList.jsx');
  assert.match(finishing, /\{showMore && <RiskChips value=\{risk\} onChange=\{setRisk\} counts=\{meta\?\.risk\} \/>\}/);
  assert.match(finishing, />Open job →<\/Link>/);
  assert.doesNotMatch(read('components/FinishingDeskList.jsx'), /Workflow →/);
});

test('a shared desk opens on the person’s main team, not the first tab', () => {
  assert.match(read('components/DeskTabs.jsx'), /departments\.find\(\(key\) => desk\.includes\(key\)\) \|\| desk\[0\]/);
});

test('a card has one main button: the next step, when the task has steps', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /const hasSteps = !query && Boolean\(button\?\.form\?\.statuses\?\.length\);/);
  assert.equal((page.match(/action\.primary && !hasSteps \? 'btn-primary' : 'btn-secondary'/g) || []).length, 2, 'links and raise buttons alike');
});

test('a desk with only its Tasks shows no tab bar; each group under To do carries its count', () => {
  const page = read('pages/DepartmentDashboard.jsx');
  assert.match(page, /\$\{TABS\.length === 1 \? 'hidden' : ''\}`\} role="tablist"/);
  assert.match(page, /<TaskGroup title="Other teams ask: when will it be ready\?" count=\{queries\.length\}/);
});

test('phones: team names whole on the shared desk, small number boxes on Sampling and the SO desk', () => {
  assert.doesNotMatch(read('components/DeskTabs.jsx'), /className="truncate">\{departmentLabel\(key\)\}/);
  const sampling = read('components/SamplingWorkQueue.jsx');
  assert.match(sampling, /grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-5/);
  assert.match(sampling, /to="\/queries" hideOnPhone \/>/);
  assert.match(sampling, /card hidden flex-wrap items-start justify-between gap-3 p-5 sm:flex/, 'the heading only on a wider screen');
  assert.doesNotMatch(sampling, /Only assigned or tagged tasks are visible/, 'plain words');
  assert.match(read('components/SoDesk.jsx'), /grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5/);
});
