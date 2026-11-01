/**
 * Field visits [pages/FieldDay.jsx, FieldTeam.jsx; components/FieldVisitButton.jsx,
 * AttendanceCard.jsx, TaskFieldVisits.jsx; server: services/fieldVisit.service.js]: the day's
 * attendance on every home, My field day for the people who go out, Needs visit on the Sampling
 * queue and the PRT card, Field today for Admin and the assigners, and Admin's marks on the Users
 * page.
 *
 *   node --test tests/field-visits.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const day = read('pages/FieldDay.jsx');
const team = read('pages/FieldTeam.jsx');
const button = read('components/FieldVisitButton.jsx');
const attendance = read('components/AttendanceCard.jsx');

test('the day’s attendance on every home: Punch in / out in the office, Field duty with lunch for the people who go out — one attendance a day', () => {
  assert.match(read('pages/Home.jsx'), /<div className="mx-auto mb-4 max-w-7xl"><AttendanceCard compact \/><\/div>/);
  assert.match(attendance, /return \[\{ action: 'punch_in', label: 'Punch in', primary: !allowed \}, \.\.\.\(allowed \? \[\{ action: 'duty_start', label: 'Start field duty', primary: true \}\] : \[\]\)\];/, 'the office punch for everyone, field duty for the marked');
  assert.match(attendance, /if \(has\('lunchStart'\) && !has\('lunchEnd'\)\) return \[\{ action: 'lunch_end', label: 'End lunch', primary: true \}\];/);
  assert.match(attendance, /return \[\{ action: 'duty_end', label: 'End field duty', primary: true \}, \.\.\.\(!has\('lunchStart'\) \? \[\{ action: 'lunch_start', label: 'Start lunch' \}\] : \[\]\)\];/);
  assert.match(attendance, /const day = await field\.act\(\{ action, fix: withFix \|\| null \}\);/, 'each press carries the phone’s fix when it gives one');
  assert.match(attendance, /else if \(\['denied', 'unsupported', 'failed'\]\.includes\(status\)\) send\(pending, null\);/, 'and goes without it rather than waiting');
  assert.match(attendance, /day\.flags\.map\(\(entry\) => <Badge key=\{entry\.key\} tone="warn">\{entry\.label\}<\/Badge>\)/, 'the day’s flags, in words');
});

test('My field day: the visit checked into with a fix every five minutes while the page is open; check-out asks the category’s outcome before it lets go', () => {
  assert.match(read('App.jsx'), /<Route path="field" element=\{<FieldDay \/>\} \/>/);
  assert.match(read('App.jsx'), /<Route path="field\/team" element=\{<FieldTeam \/>\} \/>/);
  assert.match(day, /const timer = setInterval\(send, everyMs \|\| 5 \* 60_000\);/, 'every five minutes');
  assert.match(day, /document\.addEventListener\('visibilitychange', onShow\);/, 'and when the page comes back to the front');
  assert.match(day, /field\.ping\(\{ id: visit\._id, fix: \{ lat: position\.coords\.latitude, lng: position\.coords\.longitude, accuracyM: position\.coords\.accuracy/);
  assert.match(day, /the phone sends your location every 5 minutes while this page is open/);
  assert.match(day, /const outcomes = config\.outcomes\?\.\[visit\.category\] \|\| \[\];/, 'the outcomes the category asks for');
  assert.match(day, /\{chosen\?\.fields\.map\(\(name\) => \{/, 'and the details each outcome needs');
  assert.match(day, /\{chosen && !chosen\.completes && \(/, 'put off to another day only when it did not complete');
  assert.match(day, /\[\['met', 'Who did you meet\?'\], \['happened', 'What happened\?'\], \['response', 'What did they say\?'\]\]/, 'the words, written up for Admin and marketing');
  assert.match(day, /fix \? `Location at check-out: \$\{accuracyLabel\(fix\.accuracyM\)\}` : 'No location from the phone — the check-out is kept as not GPS verified\.'/);
  assert.match(day, /\[\['rescheduled', 'Put off to another day'\], \['not_completed', 'Not completed'\], \['cancelled', 'Cancel it'\]\]/, 'a visit not made is closed with why');
  assert.match(day, /<button type="button" className="btn-secondary py-1\.5" onClick=\{\(\) => setDialog\(\{ kind: 'late' \}\)\}>Add a visit I made<\/button>/);
  assert.match(day, /Entered later: the visit is kept without GPS verification and Admin is told\./);
  assert.match(day, /Field duty ends only once every visit of the day is checked out, marked not completed or put off\./);
});

test('Needs visit on the Sampling queue row and card and on the PRT card: planned in two taps; then Check in for the person it is for', () => {
  assert.match(button, /export const FIELD_TASK_KINDS = \['sample_request', 'prt_recovery', 'request_prt_visit', 'team_payment_followup', 'my_payment_followup'\];/);
  assert.match(button, /const visit = await field\.plan\(\{ task: taskId, assignee, date, time: time \|\| undefined, note: note\.trim\(\) \|\| undefined \}\);/);
  assert.match(button, /field\.checkIn\(\{ id: visitId, fix, device: navigator\.userAgent\?\.slice\(0, 120\) \}\)/, 'the precise fix and the phone');
  assert.match(button, /\{mine && <CheckInButton visitId=\{current\._id\}/, 'Check in only for the person it is planned for');
  assert.match(button, /check out on My field day/, 'checked in, the row points to the day');
  assert.match(button, /if \(!\(marks\.mayAssign \|\| marks\.maySelfPlan \|\| user\?\.role === 'admin'\)\) return null;/, 'Needs visit for whoever may plan');
  const queue = read('components/SamplingWorkQueue.jsx');
  assert.equal((queue.match(/<NeedsVisitButton taskId=\{row\.visit\.task\} fieldVisit=\{row\.fieldVisit\} \/>/g) || []).length, 2, 'the table row and the phone card');
  assert.match(read('pages/PaymentsHome.jsx'), /\{row\.kind === 'prt_recovery' && <NeedsVisitButton taskId=\{row\._id\} fieldVisit=\{row\.fieldVisit\} className="mt-2" \/>\}/);
  assert.match(read('components/TaskPanel.jsx'), /<TaskFieldVisits todo=\{task\} \/>/, 'and on the task’s panel');
  assert.match(read('api/endpoints.js'), /ping: \(\{ id, fix \}\) => api\.post\(`\/field\/visits\/\$\{id\}\/ping`, \{ fix \}, \{ feedback: false \}\)\.then\(unwrap\)/);
});

test('Field today for Admin and the assigners: one row a person with the day’s numbers and flags; Admin corrects times with why', () => {
  assert.match(team, /\{s\.planned\} planned · \{s\.completed\} completed · \{s\.notCompleted\} not completed · \{s\.rescheduled\} put off/);
  assert.match(team, /on duty \$\{hours\(s\.dutyMinutes\)\} · at visits \$\{hours\(s\.visitMinutes\)\} · travel \$\{hours\(s\.travelMinutes\)\}\$\{s\.unrecordedMinutes \? ` · unrecorded \$\{hours\(s\.unrecordedMinutes\)\}` : ''\}/);
  assert.match(team, /\{` · \$\{\(visit\.pings \|\| \[\]\)\.length\} fixes while there`\}/);
  assert.match(team, /\{isAdmin && visit\.checkIn\?\.at && <button type="button" className="text-xs text-steel-400 hover:text-accent hover:underline" onClick=\{\(\) => onEdit\(visit\)\}>Correct times<\/button>\}/);
  assert.match(team, /Corrected times are marked “edited by Admin” and read as not GPS verified; the history keeps what they were\./);
  assert.match(team, /a gap in fixes is said as a gap, not as leaving/);
  const layout = read('components/Layout.jsx');
  assert.match(layout, /\{ to: '\/field', label: 'My field day' \},\s*\{ to: '\/field\/team', label: 'Field today', assigner: true \},/);
  assert.match(layout, /if \(feature\.assigner && !isAdmin && !user\?\.fieldVisit\?\.mayAssign\) return false;/);
});

test('Admin’s marks on the Users page: goes out, plans their own, assigns to others — and to whom, from the people who go out', () => {
  const users = read('pages/Users.jsx');
  assert.match(users, /Goes out on field visits/);
  assert.match(users, /May plan their own visits/);
  assert.match(users, /May assign visits to others/);
  assert.match(users, /const goers = \(people \|\| \[\]\)\.filter\(\(row\) => row\.id !== user\.id && row\.fieldVisit\?\.allowed\);/);
  assert.match(users, /const updated = await usersApi\.update\(\{ id: user\.id, fieldVisit: next \}\);/, 'saved as it is ticked');
  assert.match(users, /Their account then works on one device at a time\./);
  assert.match(users, /\{row\.fieldVisit\?\.allowed && <> <Badge tone="neutral">Field<\/Badge><\/>\}/);
});
