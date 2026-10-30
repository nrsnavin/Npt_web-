/**
 * Visits to the buyer's place, recorded from the phone on Sampling's and the payment teams' tasks
 * [components/TaskVisits.jsx; server: taskVisit.service]: one button for the fix, the visits
 * listed with their time, place, map link and satellite picture — on the task and the enquiry.
 *
 *   node --test tests/task-visits.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const visits = read('components/TaskVisits.jsx');

test('Record location takes the phone’s fix on a press and sends it to the task, with a note if given', () => {
  assert.match(visits, /export const VISIT_KINDS = \['sample_request', 'team_payment_followup', 'my_payment_followup', 'prt_recovery'\]/);
  assert.match(visits, /const location = useCurrentLocation\(\);/, 'the same one-press fix the queries use');
  assert.match(visits, /const press = \(\) => \{ setAsking\(true\); location\.locate\(\); \};/);
  assert.match(visits, /workspace\.todos\.visit\(\{ id: todo\._id, \.\.\.location\.fix, \.\.\.\(note\.trim\(\) \? \{ note: note\.trim\(\) \} : \{\}\) \}\)/);
  assert.match(visits, /\['denied', 'unsupported', 'failed'\]\.includes\(location\.status\) && <Notice tone="warn">\{location\.message\}<\/Notice>/, 'a refused or failed fix is explained');
  assert.match(visits, /\{mayWork && !todo\.completed && <RecordVisitButton todo=\{todo\} onRecorded=\{recorded\} \/>\}/, 'only whoever works the open task');
  assert.match(visits, /setVisits\(task\?\.visits\?\.length \? task\.visits : \[\.\.\.visits, visit\]\.filter\(Boolean\)\);/, 'the panel shows the visit at once, whatever copy of the task it holds');
});

test('every visit shows its time, the nearest town, the fix’s accuracy, a map link and the satellite picture', () => {
  assert.match(visits, /Visited \{when\(visit\.capturedAt \|\| visit\.at\)\}/);
  assert.match(visits, /\{visitPlace\(visit\)\}/);
  assert.match(visits, /accuracyLabel\(visit\.accuracyM\)/);
  assert.match(visits, /<a href=\{mapsUrl\(visit\)\} target="_blank" rel="noreferrer" className="text-accent hover:underline">Open in Maps<\/a>/);
  assert.match(visits, /<AuthedImage attachmentKey=\{visit\.image\.key\} alt=\{`Satellite view of the visit near \$\{visitPlace\(visit\)\}`\}/);
  assert.match(visits, /\{visit\.imageProblem \? ` · \$\{visit\.imageProblem\}` : ''\}/, 'and why there is no picture, when there is none');
});

test('on the task panel for those tasks, and on the enquiry for Admin and its marketing person', () => {
  const panel = read('components/TaskPanel.jsx');
  assert.match(panel, /<TaskVisits todo=\{task\} mayWork=\{mayWork\} \/>/, 'the panel stays open with the visit on it');
  const records = read('components/EnquiryRecords.jsx');
  assert.match(records, /<Section title=\{`Visits to the buyer \(\$\{visits\.length\}\)`\}>/);
  assert.match(records, /<VisitList visits=\{visits\} showTask \/>/);
  assert.match(records, /&& !visits\.length\) return null;/, 'an enquiry with only visits still shows them');
  assert.match(read('api/endpoints.js'), /visit: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/visit`, payload\)/);
});
