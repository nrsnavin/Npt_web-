/**
 * The sampling department's work queue and the enquiry's buyer panel
 * [components/SamplingWorkQueue.jsx, utils/samplingQueue.js, components/EnquiryContactPanel.jsx].
 *
 *   node --test tests/sampling-queue.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHIPS, QUEUE_ORDER, TILE_FILTERS, filterFor, needsReason, optionsFor } from '../src/utils/samplingQueue.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const row = (queueStatus, extra = {}) => ({ queueStatus, closed: queueStatus === 'closed', ...extra });

test('the six statuses, in the team’s order', () => {
  assert.deepEqual(QUEUE_ORDER, ['received', 'not_available', 'under_process', 'ready', 'sent', 'closed']);
});

test('a reason is asked for exactly where the server needs one', () => {
  assert.equal(needsReason(row('received'), 'not_available'), true, 'not available goes to marketing with a reason');
  assert.equal(needsReason(row('ready'), 'under_process'), true, 'a step back');
  assert.equal(needsReason(row('under_process'), 'received'), true, 'a step back');
  assert.equal(needsReason(row('received'), 'closed'), true, 'closing an unsent one cancels it');
  assert.equal(needsReason(row('sent'), 'closed'), false, 'closing after it went is just closing');
  assert.equal(needsReason(row('received'), 'under_process'), false);
  assert.equal(needsReason(row('not_available'), 'under_process'), false, 'a correction, not a fall');
  assert.equal(needsReason(row('under_process'), 'ready'), false);
});

test('once it has gone, the dropdown offers only sent and closed', () => {
  assert.deepEqual(optionsFor(row('sent')), ['sent', 'closed']);
  assert.deepEqual(optionsFor(row('closed')), ['closed']);
  assert.equal(optionsFor(row('received')).length, 6);
});

test('the chips split the rows as designed', () => {
  const rows = [row('received'), row('under_process', { highlighted: true }), row('ready'), row('sent'), row('closed')];
  const count = (key) => rows.filter(CHIPS.find((chip) => chip.key === key).test).length;
  assert.deepEqual(CHIPS.map((chip) => chip.label), ['All', 'New Enquiry', 'Highlighted', 'Sampling', 'Dispatch', 'Task Closed']);
  assert.equal(count('all'), 4, 'closed tasks are off the main list');
  assert.equal(count('new'), 1);
  assert.equal(count('highlighted'), 1);
  assert.equal(count('sampling'), 2);
  assert.equal(count('dispatch'), 2);
  assert.equal(count('closed'), 1);
});

test('the tiles filter to exactly what they count, and a row is in at most one of them', () => {
  const rows = [
    row('received', { late: true }),
    row('under_process', { dueToday: true }),
    row('ready'),
    row('ready', { late: true }),
    row('not_available', { highlighted: true }),
    row('sent'),
    row('closed', { late: true }),
  ];
  const count = (key) => rows.filter(filterFor(key)).length;
  assert.deepEqual(Object.values(TILE_FILTERS).map((tile) => tile.label), ['Late', 'Due today', 'Ready to send']);
  assert.equal(count('late'), 2, 'late rows, closed ones excluded');
  assert.equal(count('today'), 1);
  assert.equal(count('ready'), 2, 'ready to send, late or not');
  assert.equal(count('all'), 6, 'chips still work through the same lookup');
  assert.equal(count('nonsense'), 7, 'an unknown key keeps everything');
  const page = read('components/SamplingWorkQueue.jsx');
  assert.match(page, /value=\{tiles\.late\}/);
  assert.match(page, /value=\{tiles\.readyToSend\}/);
  assert.doesNotMatch(page, /urgentDispatch/, 'the tile that counted three things is gone');
});

test('the handover form: direct or courier, either a contact or a phone, and it says who hears', () => {
  const page = read('components/SamplingWorkQueue.jsx');
  assert.match(page, /Sample handover details/);
  assert.match(page, /Direct handover/);
  assert.match(page, /Enter either a contact person or a phone number\./);
  assert.match(page, /AWB \/ Tracking number/);
  assert.match(page, /Courier copy/);
  assert.match(page, /Save & Mark Sample Sent/);
  assert.match(page, /status: 'dispatched',\s*deliveryMethod: values\.method/);
  assert.match(page, /tells the buyer on WhatsApp and email/);
  assert.match(page, /collection: 'samples'/, 'the courier copy is kept on the sample');
  /* Sample Sent closes the bench task in the same move: ticked by default, untick to keep the row. */
  assert.match(page, /const \[closeTask, setCloseTask\] = useState\(true\);/, 'ticked by default');
  assert.match(page, /checked=\{closeTask\} onChange=\{\(event\) => setCloseTask\(event\.target\.checked\)\}/);
  assert.match(page, /Close the task on the bench/);
  assert.match(page, /dispatchedColour: values\.colour\.trim\(\) \|\| undefined,\s*closeTask,/, 'sent with the move');
});

test('sampling’s desk opens on the work queue', () => {
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /const opening = firstDashboardTab\(figures\.department, \{ isAdmin: everyone, seesEnquiries \}\);/);
  assert.match(desk, /const tab = TABS\.some\(\(entry\) => entry\.key === chosenTab\) \? chosenTab : TABS\.some\(\(entry\) => entry\.key === fallback\) \? fallback : 'tasks';/);
  assert.match(desk, /\{tab === 'queue' && <SamplingWorkQueue \/>\}/);
});

test('the enquiry panel: status, company WhatsApp, company email, conversation for the owner, folding timeline', () => {
  const panel = read('components/EnquiryContactPanel.jsx');
  assert.match(panel, /Current Marketing Status/);
  assert.match(panel, /Send from company WhatsApp/);
  assert.match(panel, /Send Email & Record Activity/);
  assert.match(panel, /Only the assigned user can see the conversation\. Admin sees CRM activity only\./);
  assert.match(panel, /const mayMessage = isOwner && canWrite;/);
  assert.match(panel, /title="Activity timeline"/);
  assert.match(panel, /aria-expanded=\{open\}/);
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /<EnquiryContactPanel/);
  assert.doesNotMatch(page, /Stage history \(/, 'stage moves are on the timeline now');
});

test('the customer on a work queue row opens the sample page — photos, buyer’s reference, the log — and the enquiry is a small link beside the number', () => {
  const queue = read('components/SamplingWorkQueue.jsx');
  assert.match(queue, /<Link to=\{row\.link\} className="font-semibold text-steel-50 hover:text-accent">\s*\{row\.customer\?\.name \|\| 'No buyer named'\}/);
  assert.doesNotMatch(queue, /<Link to=\{`\/enquiries\/\$\{row\.enquiry\._id\}`\} className="font-semibold/);
  assert.match(queue, /\{row\.enquiry && <> · <Link to=\{`\/enquiries\/\$\{row\.enquiry\._id\}`\} className="hover:text-accent">\{row\.enquiry\.number\}<\/Link><\/>\}/);
});
