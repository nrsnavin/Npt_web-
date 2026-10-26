/**
 * The customer filter on every list, and each job's place in the plant's queues
 * [components/CustomerFilter.jsx; server: queuePlaces.service].
 *
 *   node --test tests/customer-filter.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('one filter, built from the rows: All customers, then each buyer with its count', () => {
  const filter = read('components/CustomerFilter.jsx');
  assert.match(filter, /<option value="">All customers \(\{\(rows \|\| \[\]\)\.length\}\)<\/option>/);
  assert.match(filter, /\{option\.name === NO_CUSTOMER \? 'No customer' : option\.name\} \(\{option\.count\}\)/);
  assert.match(filter, /\{entry\.queue\} queue · \{entry\.place\} of \{entry\.of\}/, 'the place, of the whole queue');
  assert.match(read('api/endpoints.js'), /queuePlaces: \(\) => api\.get\('\/production\/queue-places'/);
});

test('the filter and the place on the queues, the desks, the task lists and the enquiries', () => {
  for (const file of ['components/ProductionQueueList.jsx', 'components/FinishingQueueList.jsx']) {
    const list = read(file);
    assert.match(list, /<CustomerFilter rows=\{rows\} nameOf=\{customerName\} value=\{customer\} onChange=\{setCustomer\}/, file);
    assert.match(list, /<QueuePlace place=\{row\.place\}/, file);
  }
  for (const file of ['components/DepartmentTasksBoard.jsx', 'components/DeskTables.jsx', 'components/DispatchTable.jsx', 'components/FinishingDeskList.jsx', 'components/TodoBoard.jsx', 'components/SoDesk.jsx', 'components/SamplingWorkQueue.jsx']) {
    assert.match(read(file), /<CustomerFilter /, file);
  }
  for (const file of ['components/DepartmentTasksBoard.jsx', 'components/DispatchTable.jsx', 'components/FinishingDeskList.jsx', 'components/dock/TodoPanel.jsx']) {
    assert.match(read(file), /placesForTask\(places, /, file);
  }
  assert.match(read('components/DeskTables.jsx'), /<QueuePlace places=\{row\.places\}/);
  const enquiries = read('pages/Enquiries.jsx');
  assert.match(enquiries, /<CustomerSelect\s+value=\{forCustomer \|\| ''\}/, 'the enquiry list filters by buyer on the server');
  assert.match(enquiries, /<QueuePlace places=\{places\.enquiries\?\.\[enquiry\._id\]\}/);
});
