/**
 * Customers from Excel on the Customers page [components/CustomerUpload.jsx; server:
 * services/customerImport.service.js]: the template, the owner for rows naming none, a preview, Import.
 *
 *   node --test tests/customer-import.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the endpoints: the template as .xlsx, the upload with its owner and commit', () => {
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /customerTemplate: \(\) => save\('\/customers\/import\/template', \{\}, 'customer-import-template\.xlsx'\)/);
  assert.match(endpoints, /if \(defaultOwner\) form\.append\('defaultOwner', defaultOwner\);/);
  assert.match(endpoints, /api\.post\('\/customers\/import', form, \{ feedback: commit \}\)/);
});

test('the Customers page has Import from Excel for whoever may add customers', () => {
  const page = read('pages/Customers.jsx');
  assert.match(page, /\{mayWrite && \(\s*<button type="button" className="btn-secondary" onClick=\{\(\) => setImporting\(true\)\}>\s*Import from Excel/);
  assert.match(page, /title="Import customers from Excel"/);
  assert.match(page, /<CustomerUpload/);
});

test('the dialog: download the template, pick the owner, choose the file, see the preview, then Import', () => {
  const upload = read('components/CustomerUpload.jsx');
  assert.match(upload, /downloads\.customerTemplate\(\)/);
  assert.match(upload, /aria-label="Marketing owner for rows that name none"/);
  assert.match(upload, /customersApi\.importSheet\(\{ file: chosen, defaultOwner: ownerId \|\| undefined, commit: false \}\)/);
  assert.match(upload, /customersApi\.importSheet\(\{ file, defaultOwner: owner \|\| undefined, commit: true \}\)/);
  assert.match(upload, /Already a customer — \$\{entry\.existing\.name\}/);
  assert.match(upload, /Import \$\{summary\.create\} customer/);
});

test('delivery and accounts contacts take an email on the customer form, and the contact card shows it', () => {
  const page = read('pages/Customers.jsx');
  assert.match(page, /email: contact\?\.email \|\| '',/);
  assert.match(page, /if \(name \|\| phone \|\| email\) return \{ sameAsOrder: false, name: name \|\| undefined, phone: phone \|\| undefined, email: email \|\| undefined \};/);
  assert.match(page, /register\(`\$\{name\}\.email`\)/);
  assert.match(read('components/BuyerContactCard.jsx'), /return \{ name: contact\.name, phone: contact\.phone, email: contact\.email \};/);
});

test('WhatsApp: a tick for the same as mobile, the box only when it is not — on the customer form and a new prospect', () => {
  const page = read('pages/Customers.jsx');
  assert.match(page, /WhatsApp is the same as mobile/);
  assert.match(page, /whatsappSame: !customer\.whatsapp \|\| customer\.whatsapp === customer\.mobile,/);
  assert.match(page, /\{!whatsappSame && \(/);
  assert.match(page, /const whatsapp = same \? values\.mobile : values\.whatsapp;/);
  const enquiry = read('components/EnquiryForm.jsx');
  assert.match(enquiry, /register\('prospect\.whatsappSame'\)/);
  assert.match(enquiry, /\{!prospectWhatsappSame && \(/);
  assert.match(enquiry, /values\.prospect\?\.whatsappSame \? \{ \.\.\.values\.prospect, whatsapp: values\.prospect\.mobile \}/);
});

test('the edit form is the add form, filled: numbers as typed, the owner shown (Admin may move it), the saved route and transporter chosen', () => {
  const page = read('pages/Customers.jsx');
  assert.match(page, /mobile: localPhone\(customer\.mobile\),/);
  assert.match(page, /whatsapp: localPhone\(customer\.whatsapp\),/);
  assert.match(page, /assignedTo: idOf\(customer\.assignedTo\) \|\| '',/);
  assert.match(page, /\{\(!editing \|\| isAdmin\) && !ownerFixed && \(/);
  assert.match(page, /Only an administrator can move a customer to someone else/);
  assert.match(page, /assignedTo: editing \? \(isAdmin && values\.assignedTo \? values\.assignedTo : idOf\(customer\.assignedTo\)\) : values\.assignedTo,/);
  assert.match(page, /if \(lists\.routes\.length\) setValue\('deliveryRoute', idOf\(customer\.deliveryRoute\) \|\| ''\);/);
  const picker = read('components/OwnerPicker.jsx');
  assert.match(picker, /key=\{team \? 'ready' : 'loading'\}/);
  assert.match(picker, /\(current\)<\/option>/);
});
