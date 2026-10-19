/**
 * A task's history read as a timeline, not as sentences [utils/taskHistory.js,
 * components/TaskHistory.jsx]: an update in its parts — the step, the date, the person's words —
 * on new data and on the one-line notes written before the parts were kept.
 *
 *   node --test tests/task-history.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readUpdate, timelineOf } from '../src/utils/taskHistory.js';
import { briefEntries } from '../src/utils/taskForm.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(`src/${path}`, root), 'utf8');

const STATUSES = [{ key: 'started', label: 'Started' }, { key: 'ready_dispatch', label: 'Ready for Dispatch' }, { key: 'closed', label: 'Task Closed' }];

test('an update kept in its parts is read as it was written', () => {
  const line = readUpdate({ kind: 'status', status: 'started', statusLabel: 'Started', date: '2026-10-17', dateLabel: 'EDD / ERD / Ready date', text: 'On M3', note: 'Started · EDD / ERD / Ready date 2026-10-17: On M3', at: '2026-10-12T08:49:00Z' }, STATUSES);
  assert.deepEqual([line.kind, line.statusLabel, line.date, line.dateLabel, line.text], ['status', 'Started', '2026-10-17', 'EDD / ERD / Ready date', 'On M3']);
});

test('a one-line note from before is taken apart by its shape', () => {
  const moved = readUpdate({ note: 'Ready for Dispatch · ERD / Ready date 2026-10-15: Hzhdbdh' }, STATUSES);
  assert.deepEqual([moved.kind, moved.statusLabel, moved.dateLabel, moved.date, moved.text], ['status', 'Ready for Dispatch', 'ERD / Ready date', '2026-10-15', 'Hzhdbdh']);
  const plainMove = readUpdate({ note: 'Task Closed: all packed' }, STATUSES);
  assert.deepEqual([plainMove.kind, plainMove.statusLabel, plainMove.text], ['status', 'Task Closed', 'all packed']);
  const bare = readUpdate({ note: 'Started' }, STATUSES);
  assert.deepEqual([bare.kind, bare.statusLabel, bare.text], ['status', 'Started', undefined]);
  const again = readUpdate({ note: 'Navin R asked again: Please hurry — Contact person: 9840011111' }, STATUSES);
  assert.deepEqual([again.kind, again.text], ['asked_again', 'Please hurry — Contact person: 9840011111']);
  const words = readUpdate({ note: 'Clips fitted on 4,000 pieces' }, STATUSES);
  assert.deepEqual([words.kind, words.text], ['note', 'Clips fitted on 4,000 pieces']);
  const notAStatus = readUpdate({ note: 'Mould: re-polished' }, STATUSES);
  assert.equal(notAStatus.kind, 'note', 'a colon alone does not make a step');
});

test('the timeline is everything that happened, oldest first, dates in words', () => {
  const task = {
    createdAt: '2026-10-12T05:00:00Z', createdBy: { name: 'Navin R' }, notes: 'SO Prepared by SO',
    updates: [
      { kind: 'status', statusLabel: 'Ready for Dispatch', date: '2026-10-15', dateLabel: 'Ready date', text: 'Packed', by: { name: 'Siva' }, at: '2026-10-12T09:00:00Z' },
      { kind: 'note', text: 'Lorry booked', by: { name: 'Ravi' }, at: '2026-10-12T07:00:00Z' },
    ],
    reschedules: [{ to: '2026-10-20T18:29:59Z', reason: 'Press down', by: { name: 'Siva' }, at: '2026-10-12T08:00:00Z' }],
    outcome: { result: 'done', note: 'Gone with VRL', by: { name: 'Ravi' }, at: '2026-10-12T10:00:00Z', fields: { lr: 'VRL 4471' }, next: 'lr_copy' },
  };
  const button = { form: { statuses: STATUSES }, records: [{ key: 'lr', label: 'LR number' }] };
  const lines = timelineOf(task, button, { labelOf: () => 'LR Copy' });
  assert.deepEqual(lines.map((line) => line.statusLabel), ['Raised', 'Update', 'Date moved to 20 Oct 2026', 'Ready for Dispatch', 'Done'].map((label, i) => (i === 1 ? undefined : label)));
  assert.equal(lines[0].text, 'SO Prepared by SO');
  assert.equal(lines[3].date, '15 Oct 2026');
  assert.deepEqual(lines[4].facts, [{ key: 'lr', label: 'LR number', value: 'VRL 4471' }]);
  assert.equal(lines[4].next, 'LR Copy');
});

test('what was asked becomes label / value rows, a table row under its table’s label', () => {
  const button = { asks: [{ key: 'contact', label: 'Contact person / WhatsApp' }, { key: 'vigorous', label: 'Vigorous follow-up required', type: 'check' }, { key: 'items', label: 'Items', columns: [{ key: 'model' }, { key: 'colour' }, { key: 'quantity' }] }] };
  const rows = briefEntries(button, { contact: '+917550005370', vigorous: true, callOn: '', quantity: '10000', items: [{ model: 'NH-400', colour: 'Black', quantity: 500 }] });
  assert.deepEqual(rows.map((row) => [row.label, row.value]), [
    ['Contact person / WhatsApp', '+917550005370'], ['Vigorous follow-up required', 'Yes'], ['Quantity', '10,000'], ['Items', 'NH-400 · Black · 500 pcs'],
  ]);
});

test('a quotation request reads a line per model; one from before the rows still reads in words', () => {
  const button = { asks: [{ key: 'items', label: 'Models to quote', columns: [{ key: 'model' }, { key: 'material' }, { key: 'hook' }, { key: 'quantity' }, { key: 'targetPrice' }] }] };
  const rows = briefEntries(button, { items: [
    { model: 'CRF-40', material: 'PP Black', hook: 'Chrome 3 mm', quantity: '5000', targetPrice: '4.5' },
    { model: '4028-24 CM', material: 'PP Natural', quantity: '2000' },
  ] });
  assert.deepEqual(rows.map((row) => row.value), ['CRF-40 · PP Black · Chrome 3 mm · 5000 pcs · target ₹4.5 / pc', '4028-24 CM · PP Natural · 2000 pcs']);
  assert.deepEqual(briefEntries(button, { models: 'CRF-40', targetPrice: '4.5' }).map((row) => row.label), ['Hanger model(s)', 'Buyer’s target price (₹ per piece)']);
});

test('the enquiry’s task cards, the task panel and the desk lists draw the same facts and timeline', () => {
  const card = read('components/TaskCard.jsx');
  assert.match(card, /<TaskFacts button=\{button\} task=\{task\} \/>/);
  assert.match(card, /<TaskTimeline task=\{task\} button=\{button\} \/>/);
  assert.doesNotMatch(card, /Update · \{update\.by/, 'no more one-sentence update lines');
  assert.match(card, /Raised by <span className="text-steel-300">\{task\.createdBy\.name\}<\/span>/);
  assert.match(read('components/DepartmentDesk.jsx'), /<TaskCard\s+key=\{task\._id\}\s+task=\{task\}\s+mayAct=\{mayAct\(task\)\}/);
  const panel = read('components/TaskPanel.jsx');
  assert.match(panel, /<TaskFacts button=\{button\} task=\{task\} \/>/);
  assert.match(panel, /<TaskTimeline task=\{task\} button=\{button\} \/>/);
  assert.match(read('components/HandoffTaskList.jsx'), /<TaskTimeline task=\{task\} button=\{buttonFor\(catalogue, task\.kind\)\} compact/);
  const history = read('components/TaskHistory.jsx');
  assert.match(history, /title=\{formatDateTime\(entry\.at\)\}/, 'the exact time of day on hover, on every line');
  assert.match(history, /formatRelative\(entry\.at\)/, 'how long ago, as read');
  assert.match(history, /<dl className=\{`grid grid-cols-\[auto_1fr\]/, 'facts as a table');
  assert.match(read('utils/format.js'), /export const formatDateTime/);
});
