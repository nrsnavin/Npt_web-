/**
 * The "Edit and verify" box on the dashboard's enquiry panel [src/utils/enquiryCheck.js].
 *
 *   node --test tests/enquiry-check.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFieldsOf, checkFormOf, checkPayloadOf, checkProblem, materialColourOf, suggestedOwnerOf } from '../src/utils/enquiryCheck.js';

const enquiry = {
  _id: 'e1',
  updatedAt: '2026-10-14T05:00:00.000Z',
  customer: {
    name: 'Premier Sundari C',
    whatsapp: '+919865879657',
    contacts: [{ name: 'Office', isPrimary: false }, { name: 'Ravi', isPrimary: true }],
  },
  requirement: { modelNumber: 'PTR - 322', quantity: 1677, material: 'pp', colour: 'black' },
  remarks: 'Model: PTR - 322 · Qty: 1677',
};

test('the form opens with what was captured — the buyer’s own details from the customer', () => {
  assert.deepEqual(checkFieldsOf(enquiry), {
    company: 'Premier Sundari C',
    contactPerson: 'Ravi',
    mobile: '',
    whatsapp: '+919865879657',
    modelNumber: 'PTR - 322',
    quantity: '1677',
    materialColour: 'PP black',
    remarks: 'Model: PTR - 322 · Qty: 1677',
    assignedTo: '',
  });
});

test('before there is a customer, the prospect carries them', () => {
  const fields = checkFieldsOf({ prospect: { name: 'Dasa Knit', contactPerson: 'Kumar', mobile: '9840011223' }, requirement: {} });
  assert.equal(fields.company, 'Dasa Knit');
  assert.equal(fields.contactPerson, 'Kumar');
  assert.equal(fields.mobile, '9840011223');
  assert.equal(fields.quantity, '');
});

test('WhatsApp is the same as the mobile unless they differ; ticked, the save sends the mobile as WhatsApp', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const prospect = { prospect: { name: 'Dasa Knit', mobile: '9840011223' }, requirement: {} };
  const form = checkFormOf(prospect);
  assert.equal(form.whatsappSame, true);
  assert.equal(form.mobile, '9840011223');
  /* A number kept only as WhatsApp opens as the mobile, ticked. */
  const old = checkFormOf({ customer: { name: 'Old', whatsapp: '+919865879657', contacts: [] }, requirement: {} });
  assert.deepEqual([old.mobile, old.whatsappSame], ['+919865879657', true]);
  /* Two different numbers: unticked, each shown. */
  const two = checkFormOf({ prospect: { name: 'Two', mobile: '9840011223', whatsapp: '9840099999' }, requirement: {} });
  assert.deepEqual([two.whatsappSame, two.whatsapp], [false, '9840099999']);
  const opened = checkFieldsOf(prospect);
  const changed = checkPayloadOf({ ...form, mobile: '9840055555' }, opened, { _id: 'e1' });
  assert.equal(changed.mobile, '9840055555');
  assert.equal(changed.whatsapp, '9840055555', 'ticked: WhatsApp follows the mobile');
  const own = checkPayloadOf({ ...form, whatsappSame: false, whatsapp: '9840077777' }, opened, { _id: 'e1' });
  assert.equal(own.whatsapp, '9840077777');
  assert.match(read('components/EnquiryCheckCard.jsx'), /WhatsApp is the same as mobile/);
  assert.match(read('components/EnquiryCheckCard.jsx'), /\{!form\.whatsappSame && \(/);
});

test('the resin reads as people write it; "plastic" says nothing and is left out', () => {
  assert.equal(materialColourOf({ material: 'recycled_pp', colour: 'White' }), 'RECYCLED PP White');
  assert.equal(materialColourOf({ material: 'plastic', colour: 'Navy' }), 'Navy');
  assert.equal(materialColourOf({}), '');
});

test('saving sends only what changed, with the version it was read at', () => {
  const opened = checkFieldsOf(enquiry);
  assert.deepEqual(checkPayloadOf(opened, opened, enquiry), { id: 'e1', expectedUpdatedAt: enquiry.updatedAt }, 'nothing changed: just mark it checked');
  const changed = { ...opened, company: ' Premier Sundari Garments ', quantity: '', modelNumber: 'PTR-322' };
  assert.deepEqual(checkPayloadOf(changed, opened, enquiry), {
    id: 'e1', expectedUpdatedAt: enquiry.updatedAt, company: 'Premier Sundari Garments', modelNumber: 'PTR-322', quantity: null,
  });
  assert.equal(checkPayloadOf({ ...opened, quantity: '2000' }, opened, enquiry).quantity, 2000);
});

test('the form names what is wrong before it is sent', () => {
  assert.match(checkProblem({ company: '  ' }), /company/);
  assert.match(checkProblem({ company: 'X', quantity: 'many' }), /number/);
  assert.equal(checkProblem({ company: 'X', quantity: '1677' }), null);
});

test('the draft opens on the buyer’s own marketing person, and says so', () => {
  const enquiry = {
    _id: 'e1', checkPending: true, updatedAt: 'T',
    assignedTo: { _id: 'u-admin', name: 'Navin R' },
    customer: { _id: 'c1', name: 'Premier Sundari', assignedTo: { _id: 'u-nandhini', name: 'Nandhini S' } },
  };
  const suggested = suggestedOwnerOf(enquiry);
  assert.equal(suggested.id, 'u-nandhini');
  assert.match(suggested.reason, /Premier Sundari is Nandhini S’s customer/);
  assert.equal(checkFieldsOf(enquiry).assignedTo, 'u-admin', 'what the record says');
  assert.equal(checkFormOf(enquiry).assignedTo, 'u-nandhini', 'what the form opens on');
  /* Saving without touching anything else still hands it over. */
  const payload = checkPayloadOf(checkFormOf(enquiry), checkFieldsOf(enquiry), enquiry);
  assert.deepEqual(payload, { id: 'e1', expectedUpdatedAt: 'T', assignedTo: 'u-nandhini' });

  /* A checked enquiry, or one whose owner already holds the buyer, opens on its owner. */
  assert.equal(suggestedOwnerOf({ ...enquiry, checkPending: false }).id, 'u-admin');
  assert.equal(suggestedOwnerOf({ ...enquiry, assignedTo: { _id: 'u-nandhini', name: 'Nandhini S' } }).reason, null);
  /* A prospect has no buyer to defer to. */
  assert.equal(suggestedOwnerOf({ ...enquiry, customer: null, prospect: { name: 'Nobody' } }).id, 'u-admin');
  assert.equal(checkProblem({ company: 'X', assignedTo: '' }), 'Say whose enquiry this is.');
});

test('the draft card offers the owner box and sends a chosen owner', async () => {
  const { readFileSync } = await import('node:fs');
  const card = readFileSync(new URL('../src/components/EnquiryCheckCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /label="Assigned to \(marketing\)"/);
  assert.match(card, /enquiriesApi\.delegateTargets\(enquiry\._id\)/, 'the people it may go to come from the server');
  assert.match(card, /aria-label="Assigned to"/);
  assert.match(card, /checkFormOf\(enquiry\)/, 'the form opens on the suggested owner');
});
