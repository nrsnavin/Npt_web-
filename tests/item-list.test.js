/**
 * Each model on the enquiry with its mould: the photo large enough to see, the code and name
 * (a link to the register), and what the register says about the part [components/ItemList.jsx].
 *
 *   node --test tests/item-list.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const list = readFileSync(new URL('../src/components/ItemList.jsx', import.meta.url), 'utf8');

test('the mould shows its photo, code, name and details', () => {
  assert.match(list, /<MouldThumb mould=\{item\.mould\} size="lg" \/>/);
  assert.match(list, /<Link to=\{`\/moulds\/\$\{item\.mould\._id\}`\}/);
  for (const said of ['g a piece', 'cavit', 'hook`', 'a carton', 'MOQ ']) assert.ok(list.includes(said), said);
  assert.match(list, /Found on the mould register by its model number/);
  assert.match(list, /item\.mould \? 'On the mould register' : 'Bought in — no tool of ours'/);
});

test('the one-model enquiry passes on a mould found by its code', () => {
  const page = readFileSync(new URL('../src/pages/EnquiryDetail.jsx', import.meta.url), 'utf8');
  assert.match(page, /mouldByCode: enquiry\.mouldByCode,/);
});
