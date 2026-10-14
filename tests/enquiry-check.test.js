/**
 * The "Edit and verify" box on the dashboard's enquiry panel [src/utils/enquiryCheck.js].
 *
 *   node --test tests/enquiry-check.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFieldsOf, checkPayloadOf, checkProblem, materialColourOf } from '../src/utils/enquiryCheck.js';

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
    whatsapp: '+919865879657',
    modelNumber: 'PTR - 322',
    quantity: '1677',
    materialColour: 'PP black',
    remarks: 'Model: PTR - 322 · Qty: 1677',
  });
});

test('before there is a customer, the prospect carries them', () => {
  const fields = checkFieldsOf({ prospect: { name: 'Dasa Knit', contactPerson: 'Kumar', mobile: '9840011223' }, requirement: {} });
  assert.equal(fields.company, 'Dasa Knit');
  assert.equal(fields.contactPerson, 'Kumar');
  assert.equal(fields.whatsapp, '9840011223', 'the mobile when no WhatsApp number was taken');
  assert.equal(fields.quantity, '');
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
