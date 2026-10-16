/**
 * Several accounts on one browser [src/auth/accounts.js], the PIN that seals a token
 * [src/auth/pinCrypto.js], and the idle clock behind the lock [src/auth/idle.js].
 *
 *   node --test tests/accounts.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/* localStorage as a browser has it, enough for these modules. */
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
globalThis.window = globalThis;

const accounts = await import('../src/auth/accounts.js');
const { sealToken, openToken, validPin, canSeal } = await import('../src/auth/pinCrypto.js');
const { wrapToken, unwrapToken, isWrapped } = await import('../src/auth/deviceKey.js');
const idle = await import('../src/auth/idle.js');

const navin = { id: 'u1', name: 'Navin R', email: 'navin@np.com', department: 'management' };
const nandhini = { id: 'u2', name: 'Nandhini S', email: 'nandhini@np.com', department: 'marketing' };

test.beforeEach(() => store.clear());

test('signing in adds the account, makes it active and mirrors its token for the API client', () => {
  const row = accounts.adoptAccount(navin, 'tok-navin', { roleLabel: 'Admin' });
  assert.equal(row.id, 'u1');
  assert.equal(row.signedIn, true);
  assert.equal(row.hasPin, false);
  assert.equal(accounts.activeId(), 'u1');
  assert.equal(localStorage.getItem('npt.token'), 'tok-navin');
  assert.equal(accounts.listAccounts()[0].token, undefined, 'the list never carries tokens');
});

test('a second sign-in sits beside the first; switching swaps the mirrored token; most recent first', () => {
  accounts.adoptAccount(navin, 'tok-navin');
  accounts.adoptAccount(nandhini, 'tok-nandhini');
  assert.equal(accounts.activeId(), 'u2');
  assert.equal(localStorage.getItem('npt.token'), 'tok-nandhini');
  assert.deepEqual(accounts.listAccounts().map((row) => row.id), ['u2', 'u1']);
  accounts.activate('u1');
  assert.equal(localStorage.getItem('npt.token'), 'tok-navin');
  assert.deepEqual(accounts.listAccounts().map((row) => row.id), ['u1', 'u2'], 'used just now');
});

test('the same person signing in again refreshes their row rather than doubling it', () => {
  accounts.adoptAccount(navin, 'tok-1');
  accounts.adoptAccount(navin, 'tok-2');
  assert.equal(accounts.listAccounts().length, 1);
  assert.equal(accounts.activeAccount().token, 'tok-2');
});

test('signing out removes the account and offers the next one; the last one out clears the token', () => {
  accounts.adoptAccount(navin, 'tok-navin');
  accounts.adoptAccount(nandhini, 'tok-nandhini');
  const next = accounts.removeAccount('u2');
  assert.equal(next.id, 'u1');
  assert.equal(accounts.activeId(), null, 'the caller activates the next one');
  assert.equal(localStorage.getItem('npt.token'), null);
  accounts.activate('u1');
  assert.equal(accounts.removeAccount('u1'), null);
  assert.equal(localStorage.getItem('npt.token'), null);
  assert.equal(accounts.listAccounts().length, 0);
});

test('at most five accounts, and one unused for a week is forgotten', () => {
  const day = 86400000;
  for (let n = 1; n <= 6; n += 1) accounts.adoptAccount({ id: `p${n}`, name: `Person ${n}` }, `tok-${n}`);
  const kept = accounts.listAccounts().map((row) => row.id);
  assert.equal(kept.length, 5);
  assert.ok(!kept.includes('p1'), 'the least recently used went');

  accounts.updateAccount('p2', { lastUsedAt: Date.now() - 8 * day });
  const after = accounts.pruneAccounts();
  assert.ok(!after.some((row) => row.id === 'p2'), 'a week unused: forgotten');
  assert.equal(after.length, 4);
});

test('locking drops the plain token and keeps the seal; the list says locked', async () => {
  assert.ok(canSeal(), 'WebCrypto is here');
  accounts.adoptAccount(navin, 'tok-navin');
  const sealed = await sealToken('tok-navin', '246813');
  accounts.updateAccount('u1', { sealed });
  assert.equal(accounts.listAccounts()[0].hasPin, true);
  assert.equal(accounts.listAccounts()[0].locked, false);

  accounts.dropToken('u1');
  assert.equal(localStorage.getItem('npt.token'), null, 'nothing for the API client while locked');
  assert.equal(accounts.listAccounts()[0].locked, true);
  assert.ok(!JSON.stringify(localStorage.getItem('npt.accounts')).includes('tok-navin'), 'the token is not in storage in the clear');

  assert.equal(await openToken(accounts.activeAccount().sealed, '246813'), 'tok-navin');
  await assert.rejects(() => openToken(accounts.activeAccount().sealed, '000000'), /Wrong PIN/);
});

test('a PIN is six to eight digits, and every seal is different', async () => {
  assert.equal(validPin('123456'), true);
  assert.equal(validPin('12345678'), true);
  assert.equal(validPin('1234'), false, 'four digits are guessed offline in minutes');
  assert.equal(validPin('12a456'), false);
  await assert.rejects(() => sealToken('tok', '1234'), /six to eight digits/);
  const a = await sealToken('tok', '123456');
  const b = await sealToken('tok', '123456');
  assert.notEqual(a.data, b.data, 'a fresh salt and nonce each time');
});

test('a browser from before accounts existed keeps its session', () => {
  localStorage.setItem('npt.token', 'old-token');
  assert.equal(accounts.legacyToken(), 'old-token');
  accounts.adoptAccount(navin, 'old-token');
  assert.equal(accounts.legacyToken(), null, 'once adopted, it is an account');
});

test('browser keys are scoped to the active account', () => {
  assert.equal(accounts.scopedKey('npt.startPage'), 'npt.startPage', 'nobody signed in: the plain key');
  accounts.adoptAccount(navin, 'tok');
  assert.equal(accounts.scopedKey('npt.startPage'), 'npt.startPage.u1');
});

test('the idle clock: shared through storage, and past the policy only after the minutes', () => {
  const now = 1_800_000_000_000;
  idle.touch(now);
  assert.equal(idle.idleFor(now + 60000), 60000);
  assert.equal(idle.idlePast(15, now + 14 * 60000), false);
  assert.equal(idle.idlePast(15, now + 15 * 60000), true);
  /* Another tab touched later: this tab reads it. */
  localStorage.setItem('npt.lastActivity', String(now + 20 * 60000));
  assert.equal(idle.idlePast(15, now + 30 * 60000), false);
});

test('a PIN-protected account locks whenever it is not the one in use', async () => {
  accounts.adoptAccount(navin, 'tok-navin');
  accounts.updateAccount('u1', { sealed: await sealToken('tok-navin', '246813') });
  accounts.adoptAccount(nandhini, 'tok-nandhini');
  assert.equal(accounts.accountById('u1').token, null, 'another sign-in: Navin is locked at rest');
  assert.equal(accounts.listAccounts().find((row) => row.id === 'u1').locked, true);
  accounts.updateAccount('u1', { token: 'tok-navin' });
  accounts.activate('u1');
  assert.equal(accounts.accountById('u2').token, 'tok-nandhini', 'an account without a PIN stays open');
  accounts.activate('u2');
  assert.equal(accounts.accountById('u1').token, null, 'switching away locks it again');
});

test('wrong-PIN tries are kept on the account row, so a reload cannot reset them', () => {
  accounts.adoptAccount(navin, 'tok');
  accounts.updateAccount('u1', { tries: 4 });
  assert.equal(accounts.accountById('u1').tries, 4);
  assert.equal(JSON.parse(localStorage.getItem('npt.accounts'))[0].tries, 4, 'in storage, not memory');
});

test('the device key: a token is stored wrapped where the browser can, and as it is where it cannot (Node)', async () => {
  assert.equal(isWrapped('dk1:abc:def'), true);
  assert.equal(isWrapped('eyJ.plain.token'), false);
  /* No IndexedDB here: the token is kept as it is, and the app still works. */
  assert.equal(await wrapToken('tok'), 'tok');
  assert.equal(await unwrapToken('tok'), 'tok');
  assert.equal(await unwrapToken('dk1:AAAA:BBBB'), null, 'another device’s wrap cannot be opened');
});
