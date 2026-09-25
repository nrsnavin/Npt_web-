/**
 * Photos are made smaller before upload; documents and small images are not touched, and a
 * photo the browser cannot read is still sent.
 *
 *   node --test tests/shrink-image.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LONG_EDGE, fittedSize, jpegName, shrinkForm, shrinkImage, worthShrinking } from '../src/utils/shrinkImage.js';

const MB = 1024 * 1024;
const file = (name, type, size) => new File([new Uint8Array(size)], name, { type });

test('only photos over a megabyte are worth shrinking', () => {
  assert.equal(worthShrinking({ type: 'image/jpeg', size: 4 * MB }), true);
  assert.equal(worthShrinking({ type: 'image/heic', size: 3 * MB }), true);
  assert.equal(worthShrinking({ type: 'image/jpeg', size: 400 * 1024 }), false, 'already small');
  assert.equal(worthShrinking({ type: 'application/pdf', size: 8 * MB }), false, 'a document is never touched');
  assert.equal(worthShrinking({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 5 * MB }), false);
});

test('the long edge comes down to 2048 and the shape is kept; nothing is enlarged', () => {
  assert.deepEqual(fittedSize(4032, 3024), { width: LONG_EDGE, height: 1536 });
  assert.deepEqual(fittedSize(3024, 4032), { width: 1536, height: LONG_EDGE });
  assert.deepEqual(fittedSize(1200, 900), { width: 1200, height: 900 });
});

test('the shrunk file is named as the JPEG it now is', () => {
  assert.equal(jpegName('IMG_4821.HEIC'), 'IMG_4821.jpg');
  assert.equal(jpegName('carton damage.png'), 'carton damage.jpg');
  assert.equal(jpegName('noextension'), 'noextension.jpg');
});

test('a photo that cannot be read here is still sent, unchanged', async () => {
  const photo = file('IMG_1.jpg', 'image/jpeg', 3 * MB);
  assert.equal(await shrinkImage(photo), photo);
});

test('a form with nothing to shrink goes as it is, fields and all', async () => {
  const form = new FormData();
  form.append('file', file('po.pdf', 'application/pdf', 6 * MB));
  form.append('title', 'Purchase order');
  assert.equal(await shrinkForm(form), form);
});

test('a form with a photo keeps every other field', async () => {
  const form = new FormData();
  form.append('file', file('IMG_2.jpg', 'image/jpeg', 3 * MB));
  form.append('body', 'Carton crushed at the corner');
  form.append('mentions', '["abc"]');
  const sent = await shrinkForm(form);
  assert.equal(sent.get('body'), 'Carton crushed at the corner');
  assert.equal(sent.get('mentions'), '["abc"]');
  assert.equal(sent.get('file').name, 'IMG_2.jpg');
});
