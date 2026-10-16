/**
 * The device PIN, as cryptography rather than a curtain.
 *
 * A PIN screen that only hides the page leaves the session token readable in the browser's
 * storage, so anyone at the keyboard with the developer tools gets in without it. Here the PIN
 * seals the token: a key is derived from the PIN (PBKDF2, a salt per seal, many rounds) and the
 * token is encrypted with it (AES-GCM, a fresh nonce per seal). While locked, the plain token is
 * gone from storage and only the seal remains; the PIN opens it, into memory, for the session.
 *
 * Browser and Node (tests) share the WebCrypto API, so this file runs in both.
 */
const ROUNDS = 300000;
const subtle = () => globalThis.crypto?.subtle;
const random = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));

const toBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
};
const fromBase64 = (text) => Uint8Array.from(globalThis.atob(text), (char) => char.charCodeAt(0));

async function keyFor(pin, salt) {
  const material = await subtle().importKey('raw', new globalThis.TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: ROUNDS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** True when this browser can seal: WebCrypto is present (every modern browser; not file://). */
export const canSeal = () => Boolean(subtle());

/** A PIN as the app accepts it: six to eight digits — four is guessed offline in minutes. */
export const validPin = (pin) => /^\d{6,8}$/.test(String(pin || ''));

/** `{ v, salt, iv, data }`, all base64 — storable as JSON, useless without the PIN. */
export async function sealToken(token, pin) {
  if (!validPin(pin)) throw new Error('A PIN is six to eight digits.');
  const salt = random(16);
  const iv = random(12);
  const key = await keyFor(pin, salt);
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, new globalThis.TextEncoder().encode(String(token))));
  return { v: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(data) };
}

/** The token back, or a throw — a wrong PIN and a damaged seal look the same, by design. */
export async function openToken(sealed, pin) {
  if (!sealed || sealed.v !== 1) throw new Error('Nothing is sealed here.');
  try {
    const key = await keyFor(pin, fromBase64(sealed.salt));
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data));
    return new globalThis.TextDecoder().decode(plain);
  } catch {
    throw new Error('Wrong PIN.');
  }
}
