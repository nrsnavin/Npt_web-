/**
 * The Reception, Payment Collection, PRT and Accounts desks as tables [components/DeskTables.jsx]:
 * Reception's two (samples, LR copies), one for each of the others, every action on the row — the
 * status picked from it opening a small pop-up for the remark, date or amount — the due date red
 * when late, and the cards a toggle away, remembered per desk.
 *
 *   node --test tests/desk-tables.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const tables = read('components/DeskTables.jsx');
const headersOf = (label) => {
  const at = tables.indexOf(`label="${label}"`);
  assert.ok(at > 0, `${label} table`);
  const [, list] = tables.slice(at).match(/headers=\{\[([^\]]+)\]\}/);
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
};

test('Reception has two tables: the samples the buyer collects, and the LR copies', () => {
  assert.deepEqual(headersOf('Samples the buyer collects'), ['Customer', 'Sample & models', 'Buyer contact', 'Enquiry & marketing', 'Status', 'Hand-over', 'Due']);
  assert.deepEqual(headersOf('LR copies'), ['Customer', 'Enquiry / SO', 'Invoice & LR no.', 'Transporter & vehicle', 'Dispatched & qty', 'Delivery contact', 'Status', 'LR copy', 'Due']);
  assert.match(tables, /reception: \['sample_collect', 'lr_copy'\]/);
});

test('the sample row hands over and takes the slip photo; the LR row edits its numbers, uploads the LR and says whether it reached the buyer', () => {
  assert.match(tables, /onClick=\{\(\) => move\.choose\(handStep\.key\)\}>Hand over<\/button>/);
  assert.match(tables, /<UploadPaper task=\{task\} kind="handover_photo" label="Photo \/ slip"/);
  assert.match(tables, /<FileLink file=\{photo\}>Hand-over photo<\/FileLink>/);
  assert.match(tables, /onClick=\{move\.edit\}>Edit<\/button>/);
  assert.match(tables, /\{task\.resultFile \? 'Upload again' : 'Upload LR'\}/);
  assert.match(tables, /\{sent \? 'Sent to buyer' : notSent \?/);
  assert.match(tables, /href=\{`tel:\$\{digits\(phone\)\}`\}/);
  assert.match(tables, /href=\{`https:\/\/wa\.me\/\$\{waNumber\(whatsapp \|\| phone\)\}`\}/);
});

test('Payment Collection, PRT and Accounts: one table each, with the columns the desks asked for', () => {
  assert.deepEqual(headersOf('Payment follow-ups'), ['Customer', 'Amount due', 'Promise & next call', 'Contact', 'Status', 'Due']);
  assert.deepEqual(headersOf('PRT cases'), ['Customer', 'Visitor & visit', 'Due / collected', 'Promised', 'Status', 'Due']);
  assert.deepEqual(headersOf('A/C Clarify'), ['Customer', 'Enquiry / SO & amount', 'Asked by & question', 'Payment reference', 'Credit & outstanding', 'Status', 'Due']);
  assert.match(tables, /const logStep = move\.statuses\.find\(\(entry\) => entry\.confirmsInward\);/);
  assert.match(tables, />Log payment<\/button>/);
  assert.match(tables, /`\$\{money\.overdueDays\} day\$\{money\.overdueDays === 1 \? '' : 's'\} overdue`/);
  assert.match(tables, /Collected \{formatCurrency\(money\.collected\)\}/);
  assert.match(tables, /\{paid\.confirmed \? 'Confirmed' : 'Not confirmed yet'\}/);
});

test('a status picked on the row opens the small pop-up when the move needs a remark, date, amount or file', () => {
  assert.match(tables, /if \(step\.pdf\) \{ setUploading\(true\); return; \}/);
  assert.match(tables, /if \(step\.comment\) \{ setAsking\(step\); return; \}/);
  assert.match(tables, /if \(form\.remarkRequired \|\| form\.statusDate \|\| step\.fields\?\.length \|\| step\.tellBuyer \|\| step\.date\) \{ setMoving\(step\); return; \}/);
  assert.match(tables, /<Modal open title=\{moving\.label\}[\s\S]*?>\s*<MoveForm/);
  assert.match(tables, /onChange=\{\(event\) => move\.choose\(event\.target\.value\)\}/);
  const workflow = read('components/TaskWorkflow.jsx');
  for (const name of ['MoveForm', 'CommentDialog', 'UploadDialog', 'ContactDialog']) assert.match(workflow, new RegExp(`export function ${name}\\(`));
});

test('the due date is red when late, on every table', () => {
  assert.match(tables, /if \(row\.late\) return <span className="whitespace-nowrap text-xs font-bold text-danger-400">\{formatDate\(due\)\} · Late<\/span>;/);
  assert.equal((tables.match(/<td className=\{td\}><DueCell row=\{row\} \/><\/td>/g) || []).length, 5, 'one Due cell on each of the five rows');
});

test('the desks open on the tables, the cards a toggle away, other kinds of task still cards', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /const TABLE_DESKS = \['despatch', \.\.\.Object\.keys\(DESK_TABLE_KINDS\)\];/);
  assert.match(dashboard, /DESK_TABLE_KINDS\[figures\.department\] && viewOf\(figures\.department\) === 'table'/);
  assert.match(dashboard, /<DeskTables department=\{figures\.department\} rows=\{shown\.filter\(\(row\) => takesTable\(figures\.department, row\)\)\}/);
  assert.match(dashboard, /shown\.filter\(\(row\) => !takesTable\(figures\.department, row\)\)\.map/);
});
