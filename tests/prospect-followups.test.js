/**
 * Prospect enquiries, the buyer's contact card, the route landmark and Today's actions
 * [components/EnquiryForm.jsx, BuyerContactCard.jsx, TodaysActions.jsx; pages/Customers.jsx].
 *
 *   node --test tests/prospect-followups.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('an enquiry is raised on a customer or on a prospect, never neither', () => {
  const form = read('components/EnquiryForm.jsx');
  assert.match(form, /New prospect — not a customer yet/);
  assert.match(form, /isProspect \? \{ prospect \} : \{ customer \}/);
  assert.match(form, /Give a phone number or an email/);
});

test('the enquiry shows the contact card, and a prospect converts to a customer from it', () => {
  const card = read('components/BuyerContactCard.jsx');
  for (const role of ['Order contact', 'Delivery contact', 'Accounts & Payments']) assert.match(card, new RegExp(role));
  assert.match(card, /Convert to customer/);
  assert.match(card, /enquiriesApi\.convert/);
  assert.match(card, /failure\.details\?\.existing/, 'a duplicate offers the existing customer to link');
  assert.match(read('pages/EnquiryDetail.jsx'), /<BuyerContactCard/);
  assert.match(read('pages/Enquiries.jsx'), />Prospect</);
});

test('the customer form: the landmark is a route, and delivery and accounts contacts can be the order contact', () => {
  const routes = ['Kangeyam Road', 'Uthukuli Road', 'Dharapuram Road', 'Palladam Road', 'College Road', 'Mangalam Road', 'PN Road', 'Avinashi Road'];
  const pipeline = read('utils/pipeline.js');
  for (const route of routes) assert.match(pipeline, new RegExp(`'${route}'`));
  const form = read('pages/Customers.jsx');
  assert.match(form, /This route will be sent to the Dispatch Team for vehicle planning\./);
  assert.match(form, /is the same as order contact/);
  assert.match(form, /Delivery contact person/);
  assert.match(form, /Accounts & Payments phone \/ WhatsApp/);
  assert.match(read('components/CustomerQuickCreate.jsx'), /LANDMARK_ROUTES/);
});

test('Today’s actions sits beside the party master, and a row sets a follow-up', () => {
  const dashboard = read('pages/OverviewDashboard.jsx');
  assert.match(dashboard, /<TodaysActions/);
  assert.match(dashboard, /<FollowUpDialog/);
  const card = read('components/TodaysActions.jsx');
  assert.match(card, /Today&rsquo;s actions/);
  for (const action of ['Log call', 'Reschedule', 'Close']) assert.match(card, new RegExp(`>${action}<`));
  assert.match(card, /History/);
});

test('a dispatch task waiting on a readiness ask shows it and locks its status', () => {
  const workflow = read('components/TaskWorkflow.jsx');
  assert.match(workflow, /disabled=\{waiting\.length > 0\}/);
  assert.match(workflow, /The status can be changed once/);
});
