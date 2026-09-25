/**
 * The list's keyboard shortcuts count only when nobody is typing and no dialog has the keyboard.
 *
 *   node --test tests/list-keys.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { listAction, step } from '../src/utils/listKeys.js';

const press = (key, target = { tagName: 'BODY', closest: () => null }, extra = {}) => ({ key, target, ...extra });

test('the letters mean what the help says', () => {
  assert.equal(listAction(press('j')), 'next');
  assert.equal(listAction(press('k')), 'previous');
  assert.equal(listAction(press('Enter')), 'open');
  assert.equal(listAction(press('x')), 'select');
  assert.equal(listAction(press('l')), 'label');
  assert.equal(listAction(press('e')), 'close');
  assert.equal(listAction(press('?')), 'help');
  assert.equal(listAction(press('z')), null);
});

test('typing a reply or a search never fires a shortcut', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(listAction(press('e', { tagName, closest: () => null })), null, `${tagName} fired e`);
  }
  assert.equal(listAction(press('e', { tagName: 'DIV', isContentEditable: true, closest: () => null })), null);
});

test('a held modifier or an open dialog leaves the key alone', () => {
  assert.equal(listAction(press('k', undefined, { ctrlKey: true })), null, 'Ctrl K is the command bar');
  assert.equal(listAction(press('j', { tagName: 'BUTTON', closest: () => ({}) })), null);
});

test('moving stays inside the list', () => {
  assert.equal(step(-1, 'next', 5), 0);
  assert.equal(step(4, 'next', 5), 4);
  assert.equal(step(0, 'previous', 5), 0);
  assert.equal(step(2, 'previous', 5), 1);
  assert.equal(step(0, 'next', 0), -1);
});
