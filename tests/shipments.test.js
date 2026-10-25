/**
 * Shipments [components/Shipments.jsx; server: handoff.service `shipmentsOf` `shipmentForLr`]:
 * one LR a dispatch load on Reception's LR Copy task, and a Shipments section on the enquiry.
 *
 *   node --test tests/shipments.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('Reception uploads and sends one LR a shipment; the single upload gives way to them', () => {
  const api = read('api/endpoints.js');
  assert.match(api, /if \(loadId\) form\.append\('loadId', loadId\);/);
  assert.match(api, /sendResult: \(id, loadId\) => api\.post\(`\/workspace\/todos\/\$\{id\}\/result\/send`, loadId \? \{ loadId \} : \{\}/);
  assert.match(api, /shipments: \(id\) => api\.get\(`\/workspace\/todos\/\$\{id\}\/shipments`\)/);
  const lr = read('components/Shipments.jsx');
  assert.match(lr, /onClick=\{\(\) => onUpload\(row\)\}>Upload LR<\/button>/);
  assert.match(lr, /workspace\.todos\.sendResult\(todo\._id, row\._id\)/);
  assert.match(lr, /the task closes once every shipment has its LR/);
  const flow = read('components/TaskWorkflow.jsx');
  assert.match(flow, /\{todo\.kind === 'lr_copy' && <LrShipments todo=\{todo\} onUpload=\{setUploading\} onChanged=\{moved\} onCount=\{setLrShipments\} \/>\}/);
  assert.match(flow, /\{resultStep && !lrShipments && \(/);
  assert.match(flow, /shipment=\{uploading === true \? null : uploading\}/);
  assert.match(flow, /workspace\.todos\.result\(\{ id: todo\._id, file, note, loadId: shipment\?\._id \}\)/);
});

test('the enquiry reads each shipment: models and pieces, the day, the LR for it', () => {
  assert.match(read('pages/EnquiryDetail.jsx'), /<EnquiryShipments data=\{records\.data\} \/>/);
  const section = read('components/Shipments.jsx');
  assert.match(section, /title=\{`Shipments \(\$\{rows\.length\}\)`\}/);
  for (const head of ['Date', 'Models &amp; pieces', 'How', 'LR / proof']) assert.ok(section.includes(`>${head}</th>`), head);
  assert.match(section, /'LR awaited from Reception'/);
  assert.match(section, /\{row\.needsLr \? 'View LR' : 'View proof'\}/);
});

test('Reception’s desk row reads each shipment’s LR — up and sent, or still to upload', () => {
  const desk = read('components/DeskTables.jsx');
  assert.match(desk, /\{row\.shipments\?\.length > 1 \? \(/);
  assert.match(desk, /<span className="font-semibold text-warn-400">LR to upload<\/span>/);
  assert.match(desk, /left \? `Upload \$\{left\} LR\$\{left > 1 \? 's' : ''\}` : 'Send to buyer'/);
});
