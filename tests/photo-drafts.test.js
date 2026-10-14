/**
 * Draft enquiries from the phone's gallery [src/hooks/usePhotoDrafts.js, src/utils/sharedPhotos.js,
 * public/manifest.webmanifest, public/sw.js].
 *
 *   node --test tests/photo-drafts.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOST_PHOTOS, SHARED_CACHE, picturesOf, takeSharedPhotos } from '../src/utils/sharedPhotos.js';

const file = (name, type) => new File([new Uint8Array([1, 2, 3])], name, { type });

test('only pictures go up, in the order picked, ten at most', () => {
  const picked = [file('chat-1.jpg', 'image/jpeg'), file('notes.pdf', 'application/pdf'), file('chat-2.png', 'image/png')];
  assert.deepEqual(picturesOf(picked).map((one) => one.name), ['chat-1.jpg', 'chat-2.png']);
  assert.equal(picturesOf(Array.from({ length: 14 }, (_, n) => file(`s${n}.jpg`, 'image/jpeg'))).length, MOST_PHOTOS);
  assert.deepEqual(picturesOf(null), []);
});

test('the pickers offer the gallery: no capture attribute forces the camera', () => {
  for (const page of ['src/pages/OverviewDashboard.jsx', 'src/pages/BuyerCards.jsx', 'src/hooks/usePhotoDrafts.js']) {
    assert.doesNotMatch(readFileSync(page, 'utf8'), /capture=|capture:/, `${page} would open only the camera`);
  }
});

test('the installed app is a share target for pictures, handled by the service worker', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.share_target.action, '/share-photo');
  assert.equal(manifest.share_target.method, 'POST');
  assert.equal(manifest.share_target.enctype, 'multipart/form-data');
  assert.deepEqual(manifest.share_target.params.files[0].accept, ['image/*']);
  const worker = readFileSync('public/sw.js', 'utf8');
  assert.match(worker, /url\.pathname === '\/share-photo'/);
  assert.match(worker, new RegExp(`'${SHARED_CACHE}'`), 'the worker keeps them where the page looks');
  assert.match(worker, new RegExp(`MOST_SHARED = ${MOST_PHOTOS}\\b`), 'the same ten as the picker');
  assert.match(worker, /\/enquiries\/drafts\?shared=1/);
});

test('shared pictures are taken once, oldest first, with their names and types', async () => {
  const entries = new Map();
  const cache = {
    keys: async () => [...entries.keys()].map((url) => ({ url })),
    match: async (request) => entries.get(request.url),
    delete: async (request) => entries.delete(request.url),
  };
  const store = { open: async (name) => { assert.equal(name, SHARED_CACHE); return cache; } };
  entries.set('https://app/shared-photo/1-01', new Response(new Blob(['b'], { type: 'image/png' }), { headers: { 'X-File-Name': encodeURIComponent('chat 2.png') } }));
  entries.set('https://app/shared-photo/1-00', new Response(new Blob(['a'], { type: 'image/jpeg' }), { headers: { 'X-File-Name': 'chat-1.jpg' } }));

  const files = await takeSharedPhotos(store);
  assert.deepEqual(files.map((one) => [one.name, one.type]), [['chat-1.jpg', 'image/jpeg'], ['chat 2.png', 'image/png']]);
  assert.equal(entries.size, 0, 'taken once — a reload does not upload them again');
  assert.deepEqual(await takeSharedPhotos(store), []);
  assert.deepEqual(await takeSharedPhotos(null), [], 'no cache storage, nothing shared');
});
