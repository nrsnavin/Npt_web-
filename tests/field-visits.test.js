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
import { barItems } from '../src/config/topBar.js';

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
  assert.match(button, /field\.checkIn\(\{ id: visitId, fix: sent \|\| null, \.\.\.\(why\?\.trim\(\) \? \{ reason: why\.trim\(\) \} : \{\}\), device: navigator\.userAgent\?\.slice\(0, 120\) \}\)/, 'the fix, why when it is rough or missing, and the phone');
  assert.match(button, /\{mine && <CheckInButton visitId=\{current\._id\}/, 'Check in only for the person it is planned for');
  assert.match(button, /check out on My field day/, 'checked in, the row points to the day');
  assert.match(button, /if \(!\(marks\.mayAssign \|\| marks\.maySelfPlan \|\| user\?\.role === 'admin'\)\) return null;/, 'Needs visit for whoever may plan');
  const queue = read('components/SamplingWorkQueue.jsx');
  assert.equal((queue.match(/<NeedsVisitButton taskId=\{row\.visit\.task\} fieldVisit=\{row\.fieldVisit\} \/>/g) || []).length, 2, 'the table row and the phone card');
  assert.match(read('pages/PaymentsHome.jsx'), /\{row\.kind === 'prt_recovery' && <NeedsVisitButton taskId=\{row\._id\} fieldVisit=\{row\.fieldVisit\} className="mt-2" \/>\}/);
  assert.match(read('components/TaskPanel.jsx'), /<TaskFieldVisits todo=\{task\} \/>/, 'and on the task’s panel');
  assert.match(read('api/endpoints.js'), /ping: \(\{ id, fix, recheck \}\) => api\.post\(`\/field\/visits\/\$\{id\}\/ping`, \{ fix, \.\.\.\(recheck \? \{ recheck: true \} : \{\}\) \}, \{ feedback: false \}\)\.then\(unwrap\)/);
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

test('the plan and the outcome read on the enquiry, the team job and the task panel; the check-out says what each outcome does to the task', () => {
  const list = read('components/FieldVisitList.jsx');
  assert.match(list, /outcome\?\.receivable\?\.number \? `\$\{outcome\.receivable\.number\} for Accounts` : null,/);
  assert.match(read('components/EnquiryRecords.jsx'), /<Section title=\{`Field visits \(\$\{fieldVisits\.length\}\)`\}>\s*<FieldVisitList visits=\{fieldVisits\} showTask \/>/);
  assert.match(read('pages/TeamJobDetail.jsx'), /<FieldVisitList visits=\{job\.fieldVisits\} showTask \/>/);
  assert.match(read('components/TaskFieldVisits.jsx'), /<FieldVisitList visits=\{visits\} className="mb-2" \/>/);
  assert.match(day, /The money is logged on the buyer’s task for Accounts to confirm; a cheque reads Cheque Collected, cash or a transfer reads Payment Received\./);
  assert.match(day, /The sample is recorded as handed over and the Sample Request closes\./);
  assert.match(day, /the next follow-up moves to the day you give\./);
});

test('My field day on every header bar, right after Dashboard — the office’s punch, the field’s visits — with Field today beside it for Admin and the assigners', () => {
  const dashboard = [{ key: 'dashboard', label: 'Dashboard', features: [{ to: '/departments/mine', label: 'Dashboard' }] }];
  const field = [{ key: 'field_visits', label: 'Field visits', features: [{ to: '/field', label: 'My field day' }, { to: '/field/team', label: 'Field today' }] }];
  const office = barItems(dashboard, ['dashboard'], { short: true, fieldDay: true });
  assert.deepEqual(office.map((item) => item.label).slice(0, 2), ['My work', 'My field day'], 'everyone, on the short bar too');
  assert.deepEqual(office[1].features.map((row) => row.to), ['/field'], 'the office sees its own day only');
  const assigner = barItems([...dashboard, ...field], [], { fieldDay: true, fieldTeam: true });
  assert.deepEqual(assigner[1].features.map((row) => row.label), ['My field day', 'Field today']);
  assert.ok(!assigner.some((item) => item.key === 'more'), 'the module’s screens are on the bar, not repeated under More');
  assert.ok(!barItems(dashboard).some((item) => item.key === 'field'), 'off unless asked, as the tests of the bar expect');
  const layout = read('components/Layout.jsx');
  assert.match(layout, /fieldDay: Boolean\(user\), fieldTeam: isAdmin \|\| Boolean\(user\?\.fieldVisit\?\.mayAssign\)/);
});

test('a fix that strays: the person is told and re-checks the GPS on the spot; at the limit Admin and the planner see it on Field today and under Needs your action', () => {
  assert.match(day, /warn\?\.\('Your location looks off', `\$\{answer\.discrepancy\.detail\} — strike \$\{answer\.discrepancy\.strikes\} of \$\{answer\.discrepancy\.limit\}\. If you are still at the place, re-check the GPS now\.`\);/);
  assert.match(day, /field\.ping\(\{ id: visit\._id, fix, recheck: true \}\)/, 'a precise fix, sent as a re-check');
  assert.match(day, /onClick=\{recheck\} disabled=\{rechecking\}>\{rechecking \? 'Checking the GPS…' : 'Re-check GPS now'\}<\/button>/);
  assert.match(day, /Admin and whoever planned this visit have been told something is wrong with it\./);
  assert.match(read('api/endpoints.js'), /ping: \(\{ id, fix, recheck \}\) => api\.post\(`\/field\/visits\/\$\{id\}\/ping`, \{ fix, \.\.\.\(recheck \? \{ recheck: true \} : \{\}\) \}/);
  assert.match(team, /Something wrong in a field visit — look at these:/);
  assert.match(team, /the GPS strayed \{visit\.strikes\} times/);
  assert.match(team, /<Badge tone="danger">Something wrong · \{row\.suspects\.length\}<\/Badge>/);
  assert.match(read('components/AttentionPanel.jsx'), /<Link to=\{notice\.link\} onClick=\{opened\} className="text-accent hover:underline">Open<\/Link>/, 'the notice opens Field today');
});

test('when the phone cannot get under 10 m: within 50 m is approximate and quiet; rougher asks why; no GPS checks in with why; a later good fix verifies it; poor fixes are never strikes', () => {
  assert.match(button, /export const GPS_TIERS = \{ preciseM: 10, acceptableM: 50 \};/);
  assert.match(button, /if \(checkIn\.verifiedLaterAt\) return `GPS verified later \(\$\{timeOf\(checkIn\.verifiedLaterAt\)\}\)`;/);
  assert.match(button, /if \(checkIn\.grade === 'approximate'\) return `GPS approximate \(±\$\{checkIn\.accuracyM\} m\)`;/);
  assert.match(button, /send\(fix, fix\.accuracyM > GPS_TIERS\.acceptableM \? reason : ''\);/, 'a rough fix carries why');
  assert.match(button, /near \? `The closest the phone got was \$\{accuracyLabel\(fix\.accuracyM\)\} — near enough: it is kept as approximate\.` : message/);
  assert.match(button, /disabled=\{saving \|\| \(!near && reason\.trim\(\)\.length < 3\)\}/, 'rougher than 50 m needs why');
  assert.match(button, /onClick=\{\(\) => withoutGps\(reason\)\} disabled=\{saving \|\| reason\.trim\(\)\.length < 3\}>Check in without GPS<\/button>/);
  assert.match(button, /A good fix while you are there verifies the check-in by itself\./);
  assert.match(day, /setPoor\(answer\.poor \? answer\.message : null\);/);
  assert.match(day, /if \(answer\.verifiedLater\) warn\?\.\('GPS verified', 'A good fix at the place verified your check-in\.', 'ok'\);/);
  assert.match(day, /if \(answer\.inconclusive\) \{ warn\?\.\('Not close enough to tell', answer\.message\); return; \}/);
  for (const file of ['components/FieldVisitList.jsx', 'pages/FieldTeam.jsx', 'pages/FieldDay.jsx']) assert.match(read(file), /\$\{gpsWords\(visit\.checkIn\)\}/, `${file} says how the GPS read`);
  assert.match(team, /fixes too poor to judge/);
});

test('Plan a visit on the PRT desk row and the department task card too — the card asks for the open visit itself — and a clock runs from the check-in', () => {
  assert.match(button, /field\.ofTask\(taskId\)\.then\(\(rows\) => \{ if \(live\) setCurrent\(summaryOfVisit\(rows\.find\(\(row\) => \['planned', 'checked_in'\]\.includes\(row\.status\)\)\)\); \}\)/, 'a card not handed the visit asks for it');
  assert.match(button, />\s*Plan a visit\s*<\/button>/);
  assert.match(button, /const timer = setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\);/, 'ticking every second');
  assert.match(button, /\{current\.checkInAt \? <> · <CheckedInTimer since=\{current\.checkInAt\} className="font-semibold" \/><\/> : null\}/, 'the clock on the card while checked in');
  assert.match(read('components/DeskTables.jsx'), /<NeedsVisitButton taskId=\{task\._id\} className="mt-1\.5" \/>/);
  assert.match(read('pages/DepartmentDashboard.jsx'), /\{FIELD_TASK_KINDS\.includes\(task\.kind\) && <NeedsVisitButton taskId=\{task\._id\} \/>\}/);
  assert.match(day, /Since \{time\(checkedIn\.checkIn\?\.at\)\} · <CheckedInTimer since=\{checkedIn\.checkIn\?\.at\} className="font-semibold text-steel-100" \/>/, 'and on My field day');
  assert.match(button, /return `\$\{h \? `\$\{h\}h ` : ''\}\$\{String\(m\)\.padStart\(2, '0'\)\}m \$\{String\(s\)\.padStart\(2, '0'\)\}s`;/, 'hours, minutes, seconds');
});
