/**
 * PDFs on department tasks, shown with the records they are about [components/TaskPdfs.jsx;
 * server: taskPdfs.service] — the sample, the quotation, the sales order, the production job —
 * on the detail pages and the lists.
 *
 *   node --test tests/task-pdfs.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('one call for a page’s records, one component for a detail page and one for a list row', () => {
  assert.match(read('api/endpoints.js'), /taskPdfs: \(\{ enquiries = \[\], tasks = \[\], kinds = \[\] \} = \{\}\) => api\.get\('\/workspace\/task-pdfs'/);
  const component = read('components/TaskPdfs.jsx');
  assert.match(component, /export function useTaskPdfs\(/);
  assert.match(component, /export function TaskPdfList\(/);
  assert.match(component, /export function TaskPdfChips\(/);
  assert.match(component, /const without = \(files, skip = \[\]\) =>/, 'a file the page already shows is not repeated');
});

test('each record shows the PDFs of its own task, detail and list', () => {
  const pages = [
    ['pages/SampleDetail.jsx', "kinds: ['sample_request']", 'TaskPdfList'],
    ['pages/Samples.jsx', "kinds: ['sample_request']", 'TaskPdfChips'],
    ['pages/QuotationDetail.jsx', "kinds: ['create_quotation', 'price_negotiation']", 'TaskPdfList'],
    ['pages/Quotations.jsx', "kinds: ['create_quotation', 'price_negotiation']", 'TaskPdfChips'],
    ['pages/OrderDetail.jsx', "kinds: ['po_so']", 'TaskPdfList'],
    ['pages/Orders.jsx', "kinds: ['po_so']", 'TaskPdfChips'],
    ['pages/ProductionWorkflow.jsx', "kinds: ['ask_edd']", 'TaskPdfList'],
    ['components/ProductionQueueList.jsx', "kinds: ['ask_edd']", 'TaskPdfChips'],
  ];
  for (const [page, kinds, shows] of pages) {
    const source = read(page);
    assert.ok(source.includes(kinds), `${page} asks for ${kinds}`);
    assert.ok(source.includes(`<${shows} `), `${page} shows them with ${shows}`);
  }
  assert.match(read('pages/OrderDetail.jsx'), /skip=\{\[file\?\.key\]\}/, 'the SO PDF already shown is not listed twice');
});

test('the PDF sent with a task shows wherever what was asked shows', () => {
  const facts = read('components/TaskHistory.jsx');
  assert.match(facts, /export function TaskFacts\(\{ button, task, className = '', withPdf = true \}\)/);
  assert.match(facts, /const pdf = withPdf && task\.attachment\?\.key \? task\.attachment : null;/);
  assert.match(facts, /\{pdf && <TaskPdfLink file=\{pdf\} className="block" \/>\}/);
  /* Where TaskFacts shows the asking, it is not linked a second time beside it. */
  /* The task card: under the marketer's instruction on the folded card, so not again inside it. */
  const card = read('components/TaskCard.jsx');
  assert.match(card, /\{task\.attachment\?\.key && \(\s*<p className="-mt-1\.5 pb-2 pl-14 pr-3 text-xs">\s*<TaskPdfLink file=\{task\.attachment\} \/>/);
  assert.match(card, /<TaskFacts button=\{button\} task=\{task\} withPdf=\{false\} \/>/);
  for (const page of ['components/TaskPanel.jsx', 'pages/DepartmentDashboard.jsx', 'components/SoDesk.jsx']) {
    assert.doesNotMatch(read(page), /<TaskPdfLink file=\{task\.attachment\}/, `${page}: once, inside what was asked`);
  }
  assert.match(read('components/HandoffTaskActions.jsx'), /\(todo\.notes \|\| todo\.brief \|\| todo\.attachment\?\.key\)/, 'the Update, Done and Send back pop-ups');
  assert.match(read('components/HandoffTaskList.jsx'), /<TaskPdfLink file=\{task\.attachment\}/, 'the enquiry’s list of tasks');
  for (const page of ['components/DeskTables.jsx', 'components/FinishingDeskList.jsx', 'components/SamplingWorkQueue.jsx']) {
    assert.match(read(page), /<TaskPdfChips files=\{[^}]+\} role="sent" \/>/, `${page}: on each row`);
  }
});
