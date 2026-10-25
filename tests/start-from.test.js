/**
 * A Production task asked with only the buyer's name [components/StartFrom.jsx; server:
 * teamProduction.service]: link to the buyer's enquiry, or start each model from where it is.
 *
 *   node --test tests/start-from.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the in charge sees "Where does this order stand?" on a Production task with no enquiry, before it is routed', () => {
  const edd = read('components/TaskEdd.jsx');
  assert.match(edd, /\{!todo\.enquiry && !routed && plans && !todo\.completed\s*\? <StartFrom todo=\{todo\} onChanged=\{onChanged\} \/>\s*: <TaskRouting/);
  const api = read('api/endpoints.js');
  assert.match(api, /linkOptions: \(id\) => api\.get\(`\/workspace\/todos\/\$\{id\}\/link-options`\)/);
  assert.match(api, /linkEnquiry: \(\{ id, enquiry \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/link-enquiry`/);
  assert.match(api, /startFrom: \(\{ id, models \}\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/start-from`/);
});

test('each model: name, pieces, Printing / Assembly, where it is now — with the date and pieces where they are needed', () => {
  const panel = read('components/StartFrom.jsx');
  for (const label of ['Not started yet', 'Production started', 'Already handed to Printing', 'Already handed to Assembly', 'Ready — with Dispatch', 'Already dispatched']) assert.ok(panel.includes(`label: '${label}'`), label);
  assert.match(panel, /\{row\.at === 'dispatched' \? 'Dispatched on' : 'Handed over on'\}/);
  assert.match(panel, /<Field label="Pieces dispatched" required>/);
  assert.match(panel, /\+ Add a model/);
  assert.match(panel, /\{enquiry\.inProduction \? 'Same order — close onto it' : 'Link to this enquiry'\}/);
  assert.match(panel, /disabled=\{busy \|\| !named\.length \|\| Boolean\(missing\)\}/);
});
