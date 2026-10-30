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

test('Record location waits for a precise fix and sends it to the task, with a note if given', () => {
  assert.match(visits, /export const VISIT_KINDS = \['sample_request', 'team_payment_followup', 'my_payment_followup', 'prt_recovery'\]/);
  assert.match(visits, /const location = usePreciseLocation\(\);/, 'the precise fix, not the first one');
  assert.match(visits, /if \(status !== 'ready' \|\| !fix \|\| saving\) return;/, 'sent only once the fix is good enough — or accepted as it is');
  assert.match(visits, /workspace\.todos\.visit\(\{ id: taskId, \.\.\.fix, \.\.\.\(note\?\.trim\(\) \? \{ note: note\.trim\(\) \} : \{\}\) \}\)/);
  assert.match(visits, /\{best \? `\$\{accuracyLabel\(best\.accuracyM\)\} so far — waiting for under \$\{targetM\} m…` : 'Waiting for the satellites…'\}/, 'the accuracy shown live');
  assert.match(visits, /onClick=\{locate\}>Try again<\/button>/);
  assert.match(visits, /onClick=\{accept\}>Record anyway \(\{accuracyLabel\(fix\.accuracyM\)\}\)<\/button>/, 'the person chooses when the phone cannot get closer');
  assert.match(visits, /\['denied', 'unsupported', 'failed'\]\.includes\(status\)/, 'a refused or failed fix is explained');
  assert.match(visits, /\{mayWork && !todo\.completed && <RecordVisitButton todo=\{todo\} onRecorded=\{recorded\} \/>\}/, 'only whoever works the open task');
  assert.match(visits, /setVisits\(task\?\.visits\?\.length \? task\.visits : \[\.\.\.visits, visit\]\.filter\(Boolean\)\);/, 'the panel shows the visit at once, whatever copy of the task it holds');
});

test('the precise fix: watched, never cached, stopped at 10 m or after the window, the best one kept', () => {
  const hook = readFileSync(new URL('../src/hooks/usePreciseLocation.js', import.meta.url), 'utf8');
  assert.match(hook, /export const TARGET_ACCURACY_M = 10;/);
  assert.match(hook, /\{ enableHighAccuracy: true, maximumAge: 0, timeout: windowMs \}/);
  assert.match(hook, /navigator\.geolocation\.watchPosition\(/);
  assert.match(hook, /if \(!best\.current \|\| fix\.accuracyM < best\.current\.accuracyM\) best\.current = fix;/);
  assert.match(hook, /if \(best\.current\.accuracyM <= targetM\) \{\s*stop\(\);\s*setState\(\{ status: 'ready', fix: best\.current \}\);/);
  assert.match(hook, /if \(best\.current\) setState\(\{ status: 'rough', fix: best\.current,/);
  assert.match(hook, /useEffect\(\(\) => stop, \[stop\]\);/, 'the watch ends with the screen');
  assert.match(visits, /\{isPrecise\(visit\) \? 'Precise' : 'Approximate'\}/, 'each visit says whether it was within 10 m');
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

test('Record location in one press on the Sampling queue’s rows and cards, the PRT desk row and the PRT case card', () => {
  assert.match(visits, /export function QuickVisitButton\(\{ taskId, summary, onRecorded, className = '' \}\)/);
  assert.match(visits, /const recorder = useVisitRecorder\(taskId, \{ onRecorded: recorded \}\);/);
  assert.match(visits, /onClick=\{recorder\.locate\}/, 'one press — no form');
  assert.match(visits, /\{visitLine\(shown\)\}/, 'the last visit said under the button');
  const queue = read('components/SamplingWorkQueue.jsx');
  assert.equal((queue.match(/\{row\.visit\?\.task && <QuickVisitButton taskId=\{row\.visit\.task\} summary=\{row\.visit\} \/>\}/g) || []).length, 2, 'the table row and the phone card');
  assert.match(read('components/DeskTables.jsx'), /\{mayWork && <QuickVisitButton taskId=\{task\._id\} summary=\{summaryOf\(task\)\} className="mt-1\.5" \/>\}/);
  const home = read('pages/PaymentsHome.jsx');
  assert.match(home, /const mayVisit = row\.kind === 'prt_recovery' && \(isAdmin \|\| departments\.includes\(row\.department \|\| 'payment_recovery'\) \|\| \(row\.user && String\(row\.user\) === me\)\);/);
  assert.match(home, /\{mayVisit && <QuickVisitButton taskId=\{row\._id\} summary=\{row\.visit\} className="mt-2" \/>\}/);
});

test('on every desk card of a Sampling, Payment Collection or PRT task — the PRT home’s Cards view included', () => {
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /\{VISIT_KINDS\.includes\(task\.kind\) && <QuickVisitButton taskId=\{task\._id\} summary=\{summaryOf\(task\)\} \/>\}/);
});
