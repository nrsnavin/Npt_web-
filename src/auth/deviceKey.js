/**
 * Tokens at rest, encrypted with a key this browser made and cannot give away.
 *
 * Every account's token in storage [accounts.js] is wrapped with an AES-GCM key kept in
 * IndexedDB as a non-extractable CryptoKey: the browser will use it to encrypt and decrypt, but
 * never hands the key bytes to a script. A copy of localStorage alone — a backup, a sync, a
 * careless export — then holds nothing that signs in. The PIN [pinCrypto.js] seals the same
 * token a second time, with a key only the person's head holds.
 *
 * Without IndexedDB or WebCrypto (a very old browser, some private windows) the token is stored
 * as it is, as it always was, and the app still works.
 */
const DB = 'npt-device';
const STORE = 'keys';
const NAME = 'token-wrap';
const PREFIX = 'dk1:';

let keyPromise = null;

const openDb = () => new Promise((resolve, reject) => {
  const request = globalThis.indexedDB.open(DB, 1);
  request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('blocked'));
});

const inStore = (db, mode, run) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, mode);
  const request = run(tx.objectStore(STORE));
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function deviceKey() {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) return null;
  if (!keyPromise) {
    keyPromise = (async () => {
      const db = await openDb();
      try {
        const kept = await inStore(db, 'readonly', (store) => store.get(NAME));
        if (kept) return kept;
        const made = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await inStore(db, 'readwrite', (store) => store.put(made, NAME));
        return made;
      } finally {
        db.close();
      }
    })().catch(() => null);
  }
  return keyPromise;
}

const toBase64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return globalThis.btoa(s); };
const fromBase64 = (text) => Uint8Array.from(globalThis.atob(text), (c) => c.charCodeAt(0));

/** True when the value is a wrapped token, not a plain one. */
export const isWrapped = (value) => typeof value === 'string' && value.startsWith(PREFIX);

/** The token for storage: wrapped when the device can, as it is otherwise. */
export async function wrapToken(plain) {
  if (!plain || isWrapped(plain)) return plain;
  const key = await deviceKey();
  if (!key) return plain;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new globalThis.TextEncoder().encode(plain)));
  return `${PREFIX}${toBase64(iv)}:${toBase64(data)}`;
}

/** The token for use: unwrapped, or null when this browser cannot open it (another device's wrap). */
export async function unwrapToken(stored) {
  if (!stored) return null;
  if (!isWrapped(stored)) return stored;
  const key = await deviceKey();
  if (!key) return null;
  try {
    const [, iv, data] = stored.split(':');
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(data));
    return new globalThis.TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
