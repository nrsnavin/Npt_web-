/**
 * Printing's and Assembly's queues [pages/FinishingQueue.jsx; components/FinishingQueueList.jsx;
 * server: controllers/finishingQueue.controller.js]: one line per open task in EDD order, with
 * where the goods are model by model — on their own pages and as the Printing and Assembly desks.
 *
 *   node --test tests/finishing-queue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEPARTMENT_WORKSPACES } from '../src/config/departments.js';
import { finishingCsv } from '../src/utils/productionQueue.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const page = read('pages/FinishingQueue.jsx');
const list = read('components/FinishingQueueList.jsx');

test('the queue is one line per task: the date the team works to, whose it is, the goods, each model, Update and Workflow →', () => {
  assert.match(list, /productionApi\.teamQueue\(team\)/);
  assert.match(list, /setInterval\(load, REFRESH_MS\)/, 'it keeps itself fresh');
  assert.match(list, /\{row\.edd \? dueWords\(row\.edd\.date\) : 'give the date'\}/);
  assert.match(list, /row\.edd\.source === 'team' \? `Your \$\{row\.edd\.label\.toLowerCase\(\)\}` : 'Enquiry EDD'/, 'whose date it is');
  assert.match(list, /\{row\.summary\}/);
  assert.match(list, /<ModelLine key=\{entry\.model\} entry=\{entry\} \/>/, 'each model with where its goods are');
  assert.match(list, /with \{entry\.fromLabel\}\{entry\.expected \? ` · due \$\{formatDate\(entry\.expected\)\}` : ' · no date'\}/);
  assert.match(list, /`Received from \$\{entry\.fromLabel\} \$\{formatDate\(came\)\} — add to work queue`/, 'goods received, not yet taken on');
  assert.match(list, /`In work queue · from \$\{entry\.fromLabel\} \$\{formatDate\(came\)\}`/);
  assert.match(list, /\{mayWork\(row\.task\) \? 'Update' : 'Open'\}/);
  assert.match(list, /\{row\.link && <Link to=\{row\.link\}[^>]*>Workflow →<\/Link>\}/);
  assert.match(list, /<TaskPanel/, 'the task is worked from the queue');
  assert.doesNotMatch(list, /<select/, 'no status is changed on the line itself');
});

test('the goods filter: Goods received, Work queue, Still to come, All — opens on All and says when a kept choice hides tasks', () => {
  assert.match(list, /\{ key: 'received', label: 'Goods received', count: \(meta\) => meta\?\.goods\?\.received \}/);
  assert.match(list, /\{ key: 'in_queue', label: 'Work queue', count: \(meta\) => meta\?\.goods\?\.inQueue \}/);
  assert.match(list, /\{ key: 'to_come', label: 'Still to come', count: \(meta\) => meta\?\.goods\?\.toCome \}/);
  assert.match(list, /if \(stage !== 'all' && row\.goods\?\.stage !== stage\) return false;/);
  assert.match(list, /return 'all';/, 'Both until a choice is made');
  assert.match(list, /npt\.finishingStage\.\$\{team\}/, 'kept per team');
  assert.match(list, /not shown by this filter/);
  assert.match(list, /EDD_BANDS\.map\(\(entry\) => \(\{ key: entry\.key, label: BAND_TONE\[entry\.key\]/);
  assert.match(list, /\{ key: 'problems', label: 'Problems', count: meta\?\.issues \|\| 0 \}/);
});

test('each team has its page, with Print and CSV, and the other queues one tap away', () => {
  assert.match(page, /useParams\(\)/);
  assert.match(page, /if \(!words\) return <Navigate to="\/production\/queue" replace \/>;/, 'only Printing and Assembly');
  assert.match(page, /<FinishingQueueList key=\{team\} team=\{team\} onRows=\{onRows\} \/>/);
  assert.match(page, /onClick=\{\(\) => window\.print\(\)\}>Print</);
  assert.match(page, /finishingCsv\(rows\)/);
  assert.match(page, /<Link to="\/production\/queue" className="btn-secondary">Production queue<\/Link>/);
  const app = read('App.jsx');
  assert.match(app, /path="production\/queue\/:team"/);
  assert.match(read('pages/ProductionQueue.jsx'), /to="\/production\/queue\/printing"/);
  assert.match(read('pages/ProductionQueue.jsx'), /to="\/production\/queue\/assembling"/);
  assert.match(read('api/endpoints.js'), /teamQueue: \(team\) => api\.get\(`\/production\/queue\/\$\{team\}`\)/);
});

test('the Printing and Assembly desks are their queues; Quality keeps its list; the links are on the workspaces', () => {
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /const queueTeam = deskTab && TEAM_WORDS\[deskTab\] \? deskTab : null;/);
  assert.match(desk, /\{tab === 'enquiries' && queueTeam && <FinishingQueueList key=\{queueTeam\} team=\{queueTeam\} compact onChanged=\{reload\} \/>\}/);
  assert.match(desk, /queueTeam \? TEAM_WORDS\[queueTeam\]\.queue : 'Department tasks'/, 'the tab is named for the queue');
  assert.match(desk, /\{tab === 'enquiries' && !isProduction && !isSoTeam && !queueTeam && \(/, 'the other desks keep their lists');
  for (const key of ['printing', 'assembling', 'quality', 'production']) {
    const pages = DEPARTMENT_WORKSPACES[key].pages.map((entry) => entry.to);
    assert.ok(pages.includes('/production/queue/printing'), `${key} links the Printing queue`);
    assert.ok(pages.includes('/production/queue/assembling'), `${key} links the Assembly queue`);
  }
  assert.equal(DEPARTMENT_WORKSPACES.printing.pages[0].to, '/production/queue/printing', 'Printing’s own queue first');
  assert.equal(DEPARTMENT_WORKSPACES.assembling.pages[0].to, '/production/queue/assembling', 'Assembly’s own queue first');
});

test('the CSV says where each model’s goods are', () => {
  const csv = finishingCsv([{
    edd: { date: '2026-10-24' }, enquiry: { number: 'ENQ-1', customer: { name: 'Aruna Knits' } }, order: { number: 'SO-9' },
    models: [{ model: 'NPT-410V', fromLabel: 'Production', received: '2026-10-20' }, { model: 'NPT-400S', fromLabel: 'Printing', received: null, expected: '2026-10-22' }],
    summary: 'NPT-400S still with Printing, due 22 Oct',
  }], new Date('2026-10-22T06:00:00Z'));
  const [header, line] = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(header, 'Date,Due,Enquiry,Buyer,Models,SO,Goods,Status');
  assert.match(line, /^2026-10-24,in 2 days,ENQ-1,Aruna Knits,"NPT-410V, NPT-400S",SO-9,/);
  assert.match(line, /NPT-410V: from Production 2026-10-20; NPT-400S: with Printing due 2026-10-22/);
});

test('goods received are added to the work queue from the row, in one tap [server: handoff.service `addToWorkQueue`]', () => {
  assert.match(list, /workspace\.todos\.workQueue\(\{ id: row\.task\._id, models: row\.goods\?\.toQueue \|\| \[\] \}\)/);
  assert.match(list, /\{mayWork\(row\.task\) && goods\.toQueue\?\.length > 0 && \(/, 'only for whoever works the task, and only with goods to take on');
  assert.match(list, /`Add to work queue\$\{goods\.toQueue\.length > 1 \? ` \(\$\{goods\.toQueue\.length\}\)` : ''\}`/);
  assert.match(read('api/endpoints.js'), /workQueue: \(\{ id, models, note \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/work-queue`/);
});
