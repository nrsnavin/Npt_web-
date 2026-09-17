/**
 * Where the lorry is going, enterable on the consignment's own page [BLUEPRINT §19].
 *
 * §19 will not let a consignment leave without a delivery address, and the plant had no way to
 * supply one from the consignment. The reason was further back than the screen: `createDispatch`
 * said it prefilled the address "from the address the customer master already holds", and the
 * customer register held a town and a state and no address at all. So the gate demanded a field
 * nothing could fill, the create form sent an `address` it never asked for, and the only box in
 * the app that could set one was a quick-fill on the despatch board's blocked card.
 *
 * Read as text because `node --test` here has no JSX loader.
 *
 *   node --test tests/delivery-address.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const PANEL = read('components/DeliveryAddress.jsx');
const DETAIL = read('pages/DispatchDetail.jsx');
const CUSTOMER = read('pages/Customers.jsx');
const RAISE = read('components/DispatchForm.jsx');

test('the consignment page can enter an address, not only display one', () => {
  assert.match(DETAIL, /import DeliveryAddress from '\.\.\/components\/DeliveryAddress\.jsx'/);
  assert.match(DETAIL, /<DeliveryAddress[\s\S]{0,200}customer=\{dispatch\.customer\}/);
  /* Only where the reader may actually write, and it reloads so the gate notice updates. */
  assert.match(DETAIL, /editable=\{mayWrite\}/);
  assert.match(DETAIL, /onSaved=\{reload\}/);

  assert.match(PANEL, /Enter the delivery address/);
  assert.match(PANEL, /Change where it is going/);
  assert.match(PANEL, /dispatchApi\.update\(\{ id: dispatch\._id, destination: trimmed \}\)/);
});

test('every part of the destination is editable, including the pincode', () => {
  /* The read-only panel showed consignee, address, town and contact. A pincode that can be
     displayed and not corrected is its own small trap. */
  for (const field of ['name', 'address', 'city', 'state', 'pincode', 'contactName', 'contactMobile']) {
    assert.match(PANEL, new RegExp(`onChange=\\{set\\('${field}'\\)\\}`), field);
  }
});

test('the customer\'s address is offered with its contents shown', () => {
  /*
   * "Use the customer's address" is a question somebody can only answer if they can see what
   * they would be getting — on a buying house's order the answer is usually no, because the
   * goods go to a garment unit somewhere else entirely.
   */
  assert.match(PANEL, /Use the customer&rsquo;s address/);
  assert.match(PANEL, /On the buyer&rsquo;s record/);
  assert.match(PANEL, /customer\.address, \[customer\.city, customer\.state\]/);
  /* And says so plainly when there is nothing to copy, rather than offering a dead button. */
  assert.match(PANEL, /has no address on record, so there is nothing to copy/);
});

test('filling from the customer copies, and does not overwrite a typed consignee', () => {
  /*
   * A delivery note says where the load actually went and has to keep saying it, so this is a
   * copy rather than a link — correcting a buyer next month must not rewrite where a lorry went
   * last month. And a unit name somebody typed is a deliberate answer that survives the fill.
   */
  const fill = PANEL.match(/const useCustomers = \(\) =>[\s\S]*?\}\)\);/);
  assert.ok(fill, 'the fill handler is there');
  assert.match(fill[0], /name: current\.name \|\| customer\?\.name/);
  assert.match(fill[0], /address: customer\?\.address \|\| ''/);
  assert.ok(!/customer\._id/.test(fill[0]), 'it copies values, it does not store a reference');
});

test('the missing-address gate is said on the panel that can fix it', () => {
  assert.match(PANEL, /const missing = !dispatch\.destination\?\.address;/);
  assert.match(PANEL, /cannot be despatched \[§19\]/);
  /* And it says whether there is anything to copy, which decides what to do next. */
  assert.match(PANEL, /The buyer has one on record/);
  assert.match(PANEL, /The buyer has none on record either/);
});

test('the customer form has the address the consignment copies', () => {
  /* The root of it: the register had a town and a state and nothing a driver could find. */
  assert.match(CUSTOMER, /label="Delivery address"/);
  assert.match(CUSTOMER, /\{\.\.\.register\('address'\)\}/);
  assert.match(CUSTOMER, /\{\.\.\.register\('pincode'\)\}/);
});

test('the form that raises a consignment asks for the address it sends', () => {
  /*
   * It was in the payload with no input behind it, so `values.address` was always blank and
   * every consignment went out one paperwork item short.
   */
  assert.match(RAISE, /address: text\(values\.address\)/, 'it sends one');
  assert.match(RAISE, /value=\{values\.address\} onChange=\{set\('address'\)\}/, 'and now asks for one');
});
