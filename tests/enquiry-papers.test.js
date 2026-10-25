/**
 * The enquiry's Documents section [components/EnquiryDocuments.jsx; server: enquiryDocuments
 * `documentsFor`, enquiryMessage `listEnquiryPapers` `enquiryPaperFile`]: every paper by section,
 * open or save any, and its marketing person emails them to the buyer.
 *
 *   node --test tests/enquiry-papers.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the enquiry page reads every paper, not only the files attached to it', () => {
  const page = read('pages/EnquiryDetail.jsx');
  assert.match(page, /\{mayReadEnquiries && <EnquiryDocuments enquiry=\{enquiry\} canWrite=\{mayWrite\} \/>\}/);
  assert.doesNotMatch(page, /<Documents collection="enquiries"/);
  const api = read('api/endpoints.js');
  assert.match(api, /papers: \(id\) => api\.get\(`\/enquiries\/\$\{id\}\/papers`\)/);
  assert.match(api, /paperBlob: \(\{ id, type, docId \}\) => api\.get\(`\/enquiries\/\$\{id\}\/papers\/\$\{type\}\/\$\{docId\}`, \{ responseType: 'blob' \}\)/);
});

test('by section, each to open, save or email; several ticked go in one email', () => {
  const docs = read('components/EnquiryDocuments.jsx');
  assert.match(docs, /const groups = state\?\.meta\?\.groups \|\| \[\];/, 'the sections as the server orders them');
  assert.match(docs, /onClick=\{\(\) => open\(doc, true\)\}>Download<\/button>/);
  assert.match(docs, /\{mayEmail && <button type="button" className="row-action px-2 py-1 text-xs" onClick=\{\(\) => setEmailing\(\[doc\]\)\}>Email<\/button>\}/);
  assert.match(docs, /\{pickedDocs\.length \? `Email \$\{pickedDocs\.length\} to buyer` : 'Tick papers to email'\}/);
  assert.match(docs, /const MAX_PICK = 6;/, 'the server takes six at most');
  assert.match(docs, /enquiriesApi\.sendMessage\(\{ id: enquiry\._id, channel: 'email', subject: subject\.trim\(\), body: body\.trim\(\), attachments: picked\.map\(\(\{ type, id \}\) => \(\{ type, id \}\)\) \}\)/);
  assert.match(docs, /has no email address on their record/);
  assert.match(docs, />\+ Attach<\/button>/, 'still attaches a drawing to the enquiry');
});
