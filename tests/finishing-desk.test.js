/**
 * The Quality · Printing · Assembly desk as lines [components/FinishingDeskList.jsx; server:
 * deskSummary.service]: enquiry, buyer, EDD, the state in 20–30 words (marked AI when the model
 * wrote it), Update and the Production workflow page.
 *
 *   node --test tests/finishing-desk.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('one line a task: EDD, enquiry, buyer, summary, Update and Workflow →', () => {
  const list = read('components/FinishingDeskList.jsx');
  assert.match(list, /byEdd\(rows\)/, 'in EDD order');
  assert.match(list, /\{row\.summary \|\| row\.task\.title\}/);
  assert.match(list, /row\.summaryBy === 'model' && <span[^>]*>AI<\/span>/);
  assert.match(list, /\{row\.workflow && <Link to=\{row\.workflow\} className="btn-primary[^"]*">Workflow →<\/Link>\}/);
  assert.match(list, /<TaskPanel/);
  const desk = read('pages/DepartmentDashboard.jsx');
  assert.match(desk, /\{deskList && shown\.length > 0 \? \(\s*<FinishingDeskList rows=\{shown\} onChanged=\{reload\} \/>/);
});
