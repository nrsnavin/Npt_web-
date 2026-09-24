/**
 * Tagging people with @ in a query thread — the text handling, which is all pure.
 *
 *   node --test tests/mentions.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  insertMention, matchPeople, mentionAt, mentionsIn, splitMentions, taggablePeople,
} from '../src/utils/mentions.js';

const arun = { _id: 'a1', name: 'Arun K', department: 'Marketing' };
const arunKumar = { _id: 'a2', name: 'Arun Kumar', department: 'Despatch' };
const anita = { _id: 'n1', name: 'Anita P', department: 'Despatch' };

test('an @ at the start or after a space is a tag being typed; one inside a word is not', () => {
  assert.deepEqual(mentionAt('@ar', 3), { start: 0, typed: 'ar' });
  assert.deepEqual(mentionAt('ask @An', 7), { start: 4, typed: 'An' });
  assert.equal(mentionAt('mail anita@np.com', 17), null, 'an email address is not a tag');
  assert.equal(mentionAt('@Arun K done', 12), null, 'finished once a space follows');
});

test('picking a name replaces what was typed and puts the caret after it', () => {
  const text = 'ask @ar about it';
  const at = mentionAt(text, 7);
  const next = insertMention(text, at, 7, arun);
  assert.equal(next.text, 'ask @Arun K  about it');
  assert.equal(next.caret, 'ask @Arun K '.length);
});

test('first names match first, then anywhere in the name; the reader is never offered', () => {
  const people = taggablePeople(
    [{ label: 'Marketing', people: [arun, { _id: 'me', name: 'Nandhini S' }] }, { label: 'Despatch', people: [anita, arunKumar] }],
    'me'
  );
  assert.ok(!people.some((person) => person._id === 'me'));
  assert.deepEqual(matchPeople(people, 'ar').map((person) => person.name), ['Arun K', 'Arun Kumar']);
  assert.deepEqual(matchPeople(people, 'ita').map((person) => person.name), ['Anita P']);
});

test('only people still named in the message are sent', () => {
  assert.deepEqual(mentionsIn('@Arun K please check', [arun, anita]), ['a1'], 'Anita was picked, then deleted');
  assert.deepEqual(mentionsIn('@Arun K and @Arun K again', [arun]), ['a1']);
});

test('a longer name is not read as a shorter one followed by more words', () => {
  const pieces = splitMentions('ping @Arun Kumar and @Arun K', [arun, arunKumar]);
  assert.deepEqual(pieces.map((piece) => [piece.text, piece.person?._id || null]), [
    ['ping ', null], ['@Arun Kumar', 'a2'], [' and ', null], ['@Arun K', 'a1'],
  ]);
  assert.deepEqual(splitMentions('no tags here', []), [{ text: 'no tags here' }]);
});
