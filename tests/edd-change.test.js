/**
 * EDD change requests on screen [components/EddChanges.jsx; server: services/eddChange.service.js].
 *
 *   node --test tests/edd-change.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const ui = read('components/EddChanges.jsx');

test('the endpoints: ask from the task, the enquiry’s EDD track, reply, agree, keep, withdraw', () => {
  const api = read('api/endpoints.js');
  assert.match(api, /api\.post\(`\/workspace\/todos\/\$\{id\}\/edd-changes`, \{ date, reason/);
  assert.match(api, /api\.get\(`\/enquiries\/\$\{enquiryId\}\/edd-track`\)/);
  for (const action of ['reply', 'agree', 'keep', 'withdraw']) assert.match(api, new RegExp(`/edd-changes/\\$\\{id\\}/${action}`));
});

test('the team asks with a date and why, for a model or all; the office agrees, replies or keeps the EDD', () => {
  assert.match(ui, /Request EDD change/);
  assert.match(ui, /Why the date has to move/);
  assert.match(ui, /All models — the enquiry’s EDD/);
  assert.match(ui, /Agree — move the EDD/);
  assert.match(ui, /Keep the EDD/);
  assert.match(ui, /A question, or another date you can offer/);
  assert.match(ui, /Your answer — with a new date if you have one/);
});

test('on the Production, Printing and Assembly tasks, at the top of the enquiry, and under Needs your action', () => {
  assert.match(read('components/TaskPanel.jsx'), /\['ask_edd', 'ask_printing', 'ask_assembling_edd'\]\.includes\(task\.kind\) && <TaskEddChanges/);
  const page = read('pages/EnquiryDetail.jsx');
  assert.ok(page.indexOf('<EnquiryEddTrack') < page.indexOf("enquiry.status === 'lost'"), 'at the top of the enquiry');
  assert.match(ui, /First promised/);
  const panel = read('components/AttentionPanel.jsx');
  assert.match(panel, /EDD change requests/);
  assert.match(panel, /EDD changes — replies for your team/);
});
