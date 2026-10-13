/**
 * The product details an enquiry asks for only on a new development — category, hook, clip,
 * packing — and the confirmation the costing sheet and the order forms take when they arrive
 * blank [components/ItemCards.jsx, components/ProductDetailsConfirm.jsx,
 * components/CostingSheetForm.jsx, components/OrderForm.jsx, components/OrderFromQuotation.jsx].
 *
 *   node --test tests/product-details.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailsOf, missingDetails, sayList } from '../src/utils/productDetails.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('what a line does not say, in the sheet’s order, said as a person says a list', () => {
  assert.deepEqual(missingDetails({}), ['Category', 'Hook', 'Clip', 'Packing']);
  assert.deepEqual(missingDetails({ category: 'shirt', hookRef: 'h1', clipRef: { _id: 'c1', name: 'Metal clip' }, packing: '200 pcs' }), []);
  assert.deepEqual(missingDetails({ category: '', hookRef: 'h1', packing: '  ' }), ['Category', 'Clip', 'Packing'], 'blank spaces are not a packing');
  assert.equal(sayList(['Category', 'Hook', 'Packing']), 'Category, Hook and Packing');
  assert.equal(sayList(['Hook']), 'Hook');
  assert.equal(sayList([]), '');
});

test('the facts read the names off populated registers, and the blanks as blanks', () => {
  const facts = Object.fromEntries(detailsOf({
    modelNumber: 'NH-400', category: 'shirt', materialRef: { name: 'PP : NATURAL' }, colour: 'Black',
    hookRef: { name: 'Swivel hook' }, clipRef: 'abc', packing: '',
  }));
  assert.equal(facts.Model, 'NH-400');
  assert.equal(facts.Material, 'PP : NATURAL');
  assert.equal(facts.Hook, 'Swivel hook');
  assert.equal(facts.Clip, 'Chosen');
  assert.equal(facts.Packing, '');
});

test('on the enquiry, the model reference, category, size, hook, clip and packing are asked only of a new development', () => {
  const cards = read('components/ItemCards.jsx');
  assert.match(cards, /const develops = !withMould \|\| Boolean\(item\.isNewDevelopment\);/);
  for (const label of ['Category', 'Size \\(mm\\)', 'Hook', 'Clip', 'Packing']) {
    assert.match(cards, new RegExp(`\\{develops && \\(\\s*<Field label="${label}"`), `${label} is gated on the new-development tick`);
  }
  assert.match(cards, /\{develops && \(\s*<Field\s+label=\{item\.isNewDevelopment \? 'Describe the model' : 'Model reference'\}/);
  /* Printing and the colour rule stay asked of every item. */
  assert.match(cards, /\n\s*<Field label="Printing">/);
  /* Picking a tool fills the category and size from the register — a blank on the register stays blank. */
  assert.match(cards, /category: known\.category \|\| item\.category \|\| '',/);
  assert.match(cards, /sizeMm: known\.sizeMm \|\| item\.sizeMm \|\| '',/);
  assert.match(cards, /onChange=\{pickMould\}/);
});

test('converting a prospect fills the customer form with everything the call took down', () => {
  const card = read('components/BuyerContactCard.jsx');
  assert.match(card, /mobile: prospect\.mobile \|\| prospect\.whatsapp \|\| '',/);
  assert.match(card, /whatsapp: prospect\.whatsapp \|\| prospect\.mobile \|\| '',/);
  assert.match(card, /orderContact: prospect\.contactPerson \|\| '',/);
  assert.match(card, /source: enquiry\.source \|\| 'manual',/);
  assert.match(card, /assignedTo: enquiry\.assignedTo\?\._id \|\| enquiry\.assignedTo \|\| undefined,/);
  assert.match(card, /name: prospect\.contactPerson, mobile: prospect\.mobile \|\| prospect\.whatsapp \|\| '', email: prospect\.email \|\| '', isPrimary: true/);
});

test('the costing sheet confirms the blanks before the quote, and saves what was filled', () => {
  const sheet = read('components/CostingSheetForm.jsx');
  assert.match(sheet, /const missingAtOpen = useRef\(missingDetails\(row\)\)\.current;/);
  assert.match(sheet, /const missingNow = missingDetails\(\{ category, hookRef, clipRef, packing \}\);/);
  assert.match(sheet, /const needsConfirm = procurementNeedsDetails\(procurement\) && missingAtOpen\.length > 0 && missingNow\.length > 0 && !confirmed;/);
  assert.match(sheet, /<ProductDetailsConfirm\s+line=\{\{ \.\.\.row, category, packing/);
  assert.match(sheet, /disabled=\{busy \|\| needsConfirm\}/);
  assert.match(sheet, /\.\.\.\(category !== \(row\.category \?\? ''\) \? \{ category: category \|\| null \} : \{\}\)/);
  assert.match(sheet, /\.\.\.\(packing !== \(row\.packing \?\? ''\) \? \{ packing \} : \{\}\)/);
  /* The register's own category and packing are offered for a mould it knows. */
  assert.match(sheet, /if \(!row\.category && known\.category\) setCategory/);
  assert.match(sheet, /known\.packingQty\} pcs per carton/);
});

test('booking from a quotation says what the quote left blank and takes the buyer’s word before booking', () => {
  const form = read('components/OrderFromQuotation.jsx');
  assert.match(form, /missingOnQuote: missingDetails\(line\)/);
  assert.match(form, /Not given on the quotation: \{sayList\(row\.missingOnQuote\)\}/);
  assert.match(form, /const unconfirmed = chosen\.filter\(\(row\) => missingDetails\(row\)\.length > 0\);/);
  assert.match(form, /\(unconfirmed\.length > 0 && !confirmed\)/);
  assert.match(form, /category: text\(row\.category\),\s*packing: text\(row\.packing\),/);
  assert.match(form, /aria-label="Product details confirmed with the buyer"/);
});

test('the second door asks the same of every named line', () => {
  const form = read('components/OrderForm.jsx');
  assert.match(form, /category: '', packing: '',/);
  assert.match(form, /\.filter\(\(entry\) => entry\.named && entry\.missing\.length\)/, 'a blank line is not a line with blanks');
  assert.match(form, /disabled=\{busy \|\| needsConfirm \|\|/);
  assert.match(form, /category: line\.category \|\| undefined,\s*packing: text\(line\.packing\),/);
  assert.match(form, /<ProductDetailsConfirm/);
});
