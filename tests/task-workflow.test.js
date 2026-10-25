/**
 * A department's own workflow on its task [components/TaskWorkflow.jsx; server:
 * config/departmentTaskForms.js `statuses`] — the SO team's statuses, contact details and PDF.
 *
 *   node --test tests/task-workflow.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const workflow = read('components/TaskWorkflow.jsx');

test('the statuses come from the server; a comment status asks, the PDF status uploads', () => {
  assert.match(workflow, /const statuses = statusesFor\(todo, button\?\.form\?\.statuses \|\| \[\]\);/);
  assert.match(workflow, /if \(step\.pdf\) return setUploading\(true\);/);
  assert.match(workflow, /if \(step\.comment && !step\.fields\?\.length\) return setAsking\(step\);/);
  assert.match(workflow, /workspace\.todos\.status\(\{ id: todo\._id, status: asking\.key, note \}\)/);
  assert.match(workflow, /workspace\.todos\.result\(\{ id: todo\._id, file, note \}\)/);
  assert.match(workflow, /Edit contact details/);
  assert.match(workflow, /const editable = \(button\.asks \|\| \[\]\)\.filter\(\(field\) => field\.editable\);/);
});

test('it is on the dashboard card and the enquiry; the PDF task has no plain Done', () => {
  assert.match(read('pages/DepartmentDashboard.jsx'), /<TaskWorkflow todo=\{task\} onChanged=\{onChanged\} \/>/);
  assert.match(read('components/TaskCard.jsx'), /<TaskWorkflow todo=\{task\} onChanged=\{onChanged\} \/>/);
  assert.match(read('components/HandoffTaskActions.jsx'), /\{!byUpload && allows\('done'\) && <button type="button" className="row-action" onClick=\{\(\) => setMode\('done'\)\}>/);
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /api\.post\(`\/workspace\/todos\/\$\{id\}\/status`, payload\)/);
  assert.match(endpoints, /api\.post\(`\/workspace\/todos\/\$\{id\}\/result`, form, \{ feedback: false \}\)/);
});

test('an uploaded sales order shows at the top of the enquiry’s departments, with who and when', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const results = tasks\.filter\(\(task\) => task\.resultFile\?\.key\);/);
  assert.match(desk, /\{button\?\.form\?\.resultTitle \|\| button\?\.label \|\| 'Document'\} uploaded/);
  assert.match(desk, /<TaskPdfLink file=\{task\.resultFile\} className="text-sm" \/>/);
});

test('an enquiry may be handed to marketing, to an Admin, or taken by the reader', () => {
  const delegate = read('components/DelegateEnquiry.jsx');
  assert.match(delegate, /<optgroup label="Marketing">/);
  assert.match(delegate, /<optgroup label="Admin">/);
  assert.match(delegate, /person\.self \? ' \(you\)' : ''/);
});

test('the departments panel reloads when the enquiry is handed to someone else', () => {
  assert.match(read('components/DepartmentDesk.jsx'), /\}, \[enquiry\._id, owner\]\);/);
});

test('only Admin is offered "Hand to someone" on the enquiry', () => {
  assert.match(read('pages/EnquiryDetail.jsx'), /\{isAdmin && <DelegateEnquiry enquiry=\{enquiry\} onDone=\{afterHandover\} \/>\}/);
});

test('the enquiry shows marketing’s EDD, the plant’s completion beside it, and the delivery risk', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const inProduction = \['production_edd', 'assembling'\]\.includes\(stage\) \|\| Boolean\(production\?\.asked\);/);
  assert.match(desk, /<EddLine edd=\{\{ date: production\.edd\.edd, department: production\.edd\.department/);
  assert.match(desk, /EDD not set yet/);
  assert.match(desk, /set the date the buyer is promised — the production queue runs by it/);
  /* The plant's dates beside it, and whether the order is in danger [DeliveryReading]. */
  assert.match(desk, /Plant’s completion \{formatDate\(production\.completion\.date\)\}/);
  assert.match(desk, /<DeliveryReading risk=\{history\?\.risk\} className="mt-2" \/>/);
  assert.match(desk, /plant expects \$\{formatDate\(line\.expectedCompletion\)\}/);
});

test('raising a task the department already has adds to it, and says so', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /addToOpen: true/);
  assert.match(dialog, /if \(sent\.addedTo\) \{/);
  assert.match(dialog, /open task`/);
});

test('a workflow whose moves need a remark asks for it, with the ready date, before the move', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /if \(button\.form\.remarkRequired \|\| button\.form\.statusDate \|\| step\.fields\?\.length \|\| step\.tellBuyer \|\| movesByModel\(todo\)\) return setMoving/);
  assert.match(workflow, /: \(date && dated && \(date !== given \|\| step\.date\) \? \{ date \} : \{\}\)\)/);
  assert.match(workflow, /step\.date === 'tomorrow' \? tomorrowInIndia\(\) : fresh\(given\) \|\| \(handing \? handOverDefault\(todo/);
  /* Several models: a date each, or one for all; a hand-over starts five days before the EDD. */
  assert.match(workflow, /\{ dates: dateModels\.filter\(\(model\) => perModel\[model\]\)\.map\(\(model\) => \(\{ model, date: perModel\[model\] \}\)\) \}/);
  assert.match(workflow, /— each model, or one for all/);
  assert.match(read('components/TaskEdd.jsx'), /initialOf=\{\(model\) => \(\/\^Hand-over\/\.test\(dateLabelFor\(todo, 'Completion date', model\)\) \? handOverDefault\(todo, model, undefined, plantLead\(\)\) : ''\)\}/);
  assert.match(workflow, /disabled=\{busy \|\| dateNeeded \|\| remarkNeeded \|\| noModel \|\| Boolean\(fieldMissing\) \|\| \(unrouted && Boolean\(step\.date\)\)\}/);
});

test('department moves on an enquiry show under "Needs your action": read, then dismiss', () => {
  const panel = read('components/AttentionPanel.jsx');
  assert.match(panel, /Updates on your enquiries/);
  assert.match(panel, /act\(workspace\.notices\.read\)\}>Mark as read/);
  assert.match(panel, /read \? \(\s*<>\s*<button[^>]*act\(workspace\.notices\.dismiss\)\}>Dismiss/);
  assert.match(panel, /clears itself a day after reading/);
  assert.match(read('api/endpoints.js'), /dismiss: \(id\) => api\.delete\(`\/workspace\/notices\/\$\{id\}`/);
});

test('the enquiry shows where Production has its task', () => {
  assert.match(read('components/DepartmentDesk.jsx'), /Production status: .*\{production\.asked\.status\}/);
});

test('marketing’s enquiry list shows the stage, the mould’s ERD, Production’s EDD and the open issues', () => {
  const list = read('pages/Enquiries.jsx');
  assert.match(list, /<th className="px-1.5 py-3">Stage<\/th>/);
  /* Value, Next action and the reassign tick boxes are off the list, so every column fits on screen. */
  assert.doesNotMatch(list, /label="Value"|label="Next action"|RowCheckbox|BulkBar/);
  assert.doesNotMatch(list, /max-w-6xl/, 'the list takes the full width');
  assert.match(list, /catalogue\?\.stages\?\.find\(\(stage\) => stage\.key === enquiry\.stage\)\?\.label/);
  assert.match(list, /formatDate\(enquiry\.progress\.erd\.date\)/);
  assert.match(list, /formatDate\(enquiry\.progress\.edd\.date\)/);
  assert.match(list, /\{departmentLabel\(issue\.department\)\}: \{issue\.label\}/);
});

test('a task’s own asks (Dispatch’s Ask Production) open that department’s form and ask from the task', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /\(button\.form\.actions \|\| \[\]\)\.map\(\(action\) =>/);
  assert.match(workflow, /fromTask=\{todo\}/);
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /fromTask\s*\? await workspace\.todos\.ask\(\{ id: fromTask\._id, \.\.\.payload \}\)/);
  assert.match(dialog, /\{fromTask\s+\? <input className=\"input\" value=\{form\.team \|\| button\?\.label \|\| ''\} readOnly aria-label=\"Department asked\" \/>/, 'the department asked is fixed — shown, not picked');
  assert.match(dialog, /\(noteNeeded\(button, answers\) \|\| Boolean\(fromTask\)\) && note\.trim\(\)\.length < 3/);
  assert.match(read('api/endpoints.js'), /ask: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/ask`/);
});

test('the LR copy uploads as a PDF or photo and says per channel whether it reached the buyer', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /const types = form\.resultTypes \|\| \['application\/pdf'\];/);
  assert.match(workflow, /accept=\{types\.join\(','\)\}/);
  assert.match(workflow, /sends the \$\{what\} to the buyer by email and WhatsApp/);
  assert.match(workflow, /'Upload and send to buyer'/);
  assert.match(workflow, /sent to the buyer`, went\.map/);
  assert.match(workflow, /not sent`, missed\.map/);
});

test('Admin and marketing raise a team task with no enquiry; the desk shows it without enquiry links', () => {
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /\(isAdmin \|\| departments\?\.includes\('marketing'\)\) && firstTask &&/);
  assert.match(dashboard, /<DepartmentTaskDialog enquiry=\{null\}/);
  /* No enquiry links — only the quotation a customer's Create Quotation task raised [tests/quotation-task-models.test.js]. */
  assert.match(dashboard, /: enquiry\s+\? deskActionsFor\(department, row\)\s+: row\.records\?\.quotation \?/);
  assert.match(dashboard, /<p className="text-base font-bold text-steel-50">Team task<\/p>/);
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /const team = !enquiry;/);
  assert.match(dialog, /\? await workspace\.teamTasks\.create\(\{ \.\.\.payload, \.\.\.\(customer \? \{ customer \} : \{\}\) \}\)/);
  assert.match(dialog, /if \(team\) await workspace\.teamTasks\.attach\(\{ id: sent\.task\._id, file \}\);/);
  assert.match(read('api/endpoints.js'), /create: \(payload\) => api\.post\('\/workspace\/team-tasks', payload, \{ feedback: false \}\)/);
  assert.match(read('components/AttentionPanel.jsx'), /<span className="font-normal text-steel-300">Team task<\/span>/);
});

test('customers carry area and landmark; Dispatch plans its trips from groups of the same place', () => {
  const quick = read('components/CustomerQuickCreate.jsx');
  for (const field of ['address', 'area', 'landmark', 'pincode']) assert.match(quick, new RegExp(`register\\('${field}'\\)`));
  assert.match(quick, /landmark: values\.landmark\?\.trim\(\) \|\| undefined/);
  const full = read('pages/Customers.jsx');
  assert.match(full, /register\('area'\)/);
  assert.match(full, /register\('landmark'\)/);
  const dashboard = read('pages/DepartmentDashboard.jsx');
  assert.match(dashboard, /\.\.\.\(data\.baskets \? \[\{ key: 'baskets', label: 'Plan trips'/);
  assert.match(dashboard, /<TripPlanner \/>/);
});

test('the enquiry shows each sample’s team log: its status trail, despatch and the notes and photos', () => {
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /if \(response\.data\?\.\[0\]\) setOpen\(new Set\(\[response\.data\[0\]\._id\]\)\);/);
  assert.match(page, /\{open\.has\(sample\._id\) \? 'Hide sample team log' : 'Sample team log'\}/);
  assert.match(page, /sample\.statusHistory\.map\(\(entry, index\) =>/);
  assert.match(page, /<SampleLog sampleId=\{sample\._id\} title=\{`Sample team notes & photos — \$\{sample\.number\}`\} \/>/);
  assert.match(read('components/SampleLog.jsx'), /export default function SampleLog\(\{ sampleId, title = 'Log' \}\)/);
});

test('Reception is a department of its own, with its desk, menu and the dispatch details to keep', () => {
  assert.match(read('utils/pipeline.js'), /\{ key: 'reception', label: 'Reception' \}/);
  assert.match(read('config/simpleNav.js'), /reception: \['dashboard', 'dispatch', 'queries'\]/);
  assert.match(read('config/departments.js'), /reception: \{\s*purpose: 'Once the goods have gone/);
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /\{button\.form\.editLabel \|\| 'Edit contact details'\}/);
  assert.match(workflow, /type=\{field\.type === 'date' \? 'date' : field\.type === 'number' \? 'number' : 'text'\}/);
});

test('a hand-over steps back from the EDD by the teams after it: printed and assembled, to Printing 10 days, to Assembly 5', async () => {
  const { handOverDefault, handOverWarning, teamsAfter, HANDOVER_LEAD_DAYS } = await import('../src/utils/edd.js');
  const production = {
    kind: 'ask_edd',
    enquiry: { edd: { date: '2026-11-20' }, eddByModel: [{ model: 'C', final: { date: '2026-11-30' } }] },
    routing: { handsTo: ['printing', 'assembling'], models: [{ model: 'A', printing: true, assembly: true }, { model: 'B', assembly: true }, { model: 'C', printing: true }] },
  };
  const printing = { kind: 'ask_printing', enquiry: { edd: { date: '2026-11-20' } }, routing: { handsTo: ['assembling'], incoming: { production: '2026-11-10' } } };
  assert.equal(HANDOVER_LEAD_DAYS, 5);
  assert.deepEqual([teamsAfter(production, 'A'), teamsAfter(production, 'B'), teamsAfter(printing, 'A')], [2, 1, 1]);
  assert.equal(handOverDefault(production, 'A', '2026-10-25'), '2026-11-10', 'printed and assembled: to Printing 10 days before');
  assert.equal(handOverDefault(printing, 'A', '2026-10-25'), '2026-11-15', 'then to Assembly 5 days before');
  assert.equal(handOverDefault(production, 'B', '2026-10-25'), '2026-11-15', 'assembled only: 5 days');
  assert.equal(handOverDefault(production, 'C', '2026-10-25'), '2026-11-25', 'its own EDD');
  assert.equal(handOverDefault(production, null, '2026-10-25'), '2026-11-10', 'every model at once: the earliest');
  assert.equal(handOverDefault(production, 'A', '2026-10-25', 6), '2026-11-08', 'the plant’s days, when changed');
  assert.equal(handOverDefault(production, 'A', '2026-11-18'), '2026-11-18', 'never before today');
  assert.equal(handOverDefault({ kind: 'ask_edd', enquiry: {} }, null, '2026-10-25'), '', 'no EDD, no default');
  assert.match(handOverWarning(production, 'A', '2026-11-13'), /Only 7 days before the EDD .* 10 is the usual \(5 for Printing, 5 for Assembly\)/);
  assert.match(handOverWarning(printing, 'A', '2026-11-13'), /Only 3 days for printing after Production hands over/);
  assert.match(handOverWarning(printing, 'A', '2026-11-20'), /On or after the EDD/);
  assert.equal(handOverWarning(printing, 'A', '2026-11-15'), null);
  const card = read('components/HandoverLeadCard.jsx');
  assert.match(card, /const mayEdit = mayPlanProduction \|\| departments\.includes\('marketing'\);/);
  assert.match(read('api/endpoints.js'), /setHandoverLead: \(days\) => api\.put\('\/settings\/handover-lead', \{ days \}\)/);
  assert.match(read('components/TaskWorkflow.jsx'), /handOverDefault\(todo, model, undefined, plantLead\(\)\)/);
});

test('a task form says which model details were changed from the enquiry and offers to change the enquiry too', async () => {
  const { changedDetails } = await import('../src/utils/taskForm.js');
  const started = { items: [{ model: 'CRF-35', material: 'HIPS : NATURAL', print: '3 COLOUR', quantity: '3' }, { model: 'CRF-44', hook: '' }] };
  const answers = { items: [{ model: 'CRF-35', material: 'hips : natural', print: '1 COLOUR', quantity: '6' }, { model: 'CRF-44', hook: 'Chrome hook' }, { model: 'NEW-1', print: 'x' }] };
  assert.deepEqual(changedDetails(started, answers), [
    { model: 'CRF-35', field: 'print', from: '3 COLOUR', to: '1 COLOUR' },
    { model: 'CRF-44', field: 'hook', from: '', to: 'Chrome hook' },
  ], 'case alone is no change; pieces are not a detail; a new row is not a change');
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /Also update the enquiry with these changes/);
  assert.match(dialog, /\.\.\.\(changes\.length && updateEnquiry \? \{ updateEnquiry: true \} : \{\}\)/);
});

test('dispatching a sample of several models: each model with its details, its photo and the pieces of it sent', () => {
  const page = read('pages/SampleDetail.jsx');
  assert.match(page, /aria-label="Models in the bag"/);
  assert.match(page, /\{ itemQuantities: rows\.map\(\(row\) => \(\{ item: row\._id, quantity: Number\(pieces\[row\._id\]\) \|\| 0 \}\)\) \}/);
  assert.match(page, /emptyText="Add the photo — camera or gallery"/);
  assert.match(page, /\{!several && \(\s*<Field label="Quantity sent" required>/, 'one total only for a single model');
  assert.match(read('components/SampleReadyForm.jsx'), /One slot per model row/, 'Sample Ready asks a photo of each');
});
