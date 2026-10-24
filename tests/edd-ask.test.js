/**
 * The EDD asked for wherever queue work starts [server: services/eddAsk.service.js]: on the form
 * of a Production / Printing / Assembly / Dispatch task, on the task itself, and on the enquiry.
 *
 *   node --test tests/edd-ask.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDD_ASK_KINDS } from '../src/utils/edd.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the queue tasks are Production’s, Printing’s, Assembly’s and Dispatch’s', () => {
  assert.deepEqual(EDD_ASK_KINDS, ['ask_edd', 'ask_printing', 'ask_assembling_edd', 'invoice_dispatch']);
});

test('the raise form asks marketing or Admin for the EDD — filled from the enquiry, required when there is none', () => {
  const dialog = read('components/DepartmentTaskDialog.jsx');
  assert.match(dialog, /const asksEdd = EDD_ASK_KINDS\.includes\(kind\) && !fromTask && \(isAdmin \|\| departments\.includes\('marketing'\)\);/);
  assert.match(dialog, /const eddMissing = asksEdd && !edd;/);
  assert.match(dialog, /setEdd\(\(current\) => current \|\| data\?\.edd \|\| ''\)/, 'the enquiry’s EDD filled in');
  assert.match(dialog, /\.\.\.\(asksEdd && edd && edd !== \(prefill\?\.edd \|\| ''\) \? \{ edd \} : \{\}\)/, 'sent when given or changed');
  assert.match(dialog, /label="EDD — the date the buyer is promised"/);
  assert.match(dialog, /Needed: Production, Printing, Assembly and Dispatch queue the work by it/);
});

test('the enquiry says EDD needed while queue tasks are open without one; the task asks for it too', () => {
  const desk = read('components/DepartmentDesk.jsx');
  assert.match(desk, /const eddNeeded = !production\?\.edd && queueTasks\.length > 0;/);
  assert.match(desk, /\{eddNeeded \? 'EDD needed' : 'EDD not set yet'\}/);
  assert.match(read('components/TaskEdd.jsx'), /<EddReadOnly todo=\{todo\} onChanged=\{onChanged\} \/>/, 'a team that hands on is asked too');
  assert.match(read('api/endpoints.js'), /jobEdd: \(\{ id, \.\.\.payload \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/job-edd`/);
});
