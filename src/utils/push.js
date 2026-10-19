import { pushApi } from '../api/endpoints.js';

/**
 * Turning notifications on and off for this device.
 *
 * Needs the app's service worker (built copies only), a browser that can take pushes, the
 * person's permission, and a server with keys configured. Each missing piece is said as a
 * state, so the switch on the profile can explain itself rather than silently doing nothing.
 */
const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The VAPID key, from base64url to the bytes the browser wants. */
function keyBytes(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.getRegistration();
}

/** 'unsupported' | 'unconfigured' | 'denied' | 'on' | 'off' */
export async function pushState() {
  if (!supported() || !(await registration())) return 'unsupported';
  const { configured } = await pushApi.key();
  if (!configured) return 'unconfigured';
  if (window.Notification.permission === 'denied') return 'denied';
  const subscription = await (await registration()).pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/** The key a subscription was made with, as base64url — to compare with the server's. */
function keyText(buffer) {
  if (!buffer) return '';
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/*
 * What the service worker needs to renew this device on its own [public/sw.js
 * `pushsubscriptionchange`]: where the API is (it may be another origin) and the server's key.
 * Kept in a cache the worker can read; it holds nothing private.
 */
const PUSH_CONFIG = 'npt-push';
async function tellWorker(publicKey) {
  try {
    const api = new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin).href.replace(/\/$/, '');
    const cache = await window.caches.open(PUSH_CONFIG);
    await cache.put('/push-config', new window.Response(JSON.stringify({ api, publicKey }), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    /* A private window without caches: the app renews the device itself next time it opens [syncPush]. */
  }
}

/**
 * This device's subscription, made with the server's current key: the one it has, or a fresh one
 * where it has none or one made with keys since replaced — the push service refuses those, and
 * the device would go quiet without a word. A replaced subscription's rows, every account's, move
 * to the new one [server: push.controller `renewPush`].
 */
async function currentSubscription(reg, publicKey) {
  const existing = await reg.pushManager.getSubscription();
  /* A browser that does not say which key a subscription was made with is taken at its word. */
  const madeWith = existing?.options?.applicationServerKey;
  if (existing && (!madeWith || keyText(madeWith) === publicKey)) return existing;
  const fresh = async () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  if (!existing) return fresh();
  const oldEndpoint = existing.endpoint;
  await existing.unsubscribe().catch(() => {});
  const made = await fresh();
  const { endpoint, keys } = made.toJSON();
  await pushApi.renew({ oldEndpoint, endpoint, keys }).catch(() => {});
  return made;
}

export async function enablePush() {
  const { publicKey } = await pushApi.key();
  if (!publicKey) throw new Error('Notifications are not set up on the server yet.');
  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed on this device.');
  const reg = await registration();
  if (!reg) throw new Error('The app is still installing on this device — reload the page and try again.');
  const subscription = await currentSubscription(reg, publicKey);
  const { endpoint, keys } = subscription.toJSON();
  await pushApi.subscribe({ endpoint, keys });
  await tellWorker(publicKey);
}

export async function disablePush() {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe({ endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

/**
 * Keeps this device ringing for whoever is signed in, without anybody pressing anything — run as
 * the app opens, on every account switch, and when it comes back to the screen [context/
 * AuthContext.jsx]. Where notifications were allowed it makes sure the device has a working
 * subscription and that the server has it for this account: a browser that dropped or rotated
 * its subscription, or keys changed on the server, used to leave the phone silent until someone
 * thought to press Turn off, Turn on. Asks for nothing: where permission was never given, the
 * offer bar does that [components/LiveAlerts.jsx]. Returns whether the device is subscribed.
 */
let lastSync = 0;
const SYNC_EVERY_MS = 10 * 60 * 1000;
export async function syncPush({ force = false } = {}) {
  if (!supported() || window.Notification.permission !== 'granted') return false;
  if (!force && Date.now() - lastSync < SYNC_EVERY_MS) return false;
  lastSync = Date.now();
  const reg = await registration();
  if (!reg) return false;
  const { publicKey, configured } = await pushApi.key();
  if (!configured || !publicKey) return false;
  const subscription = await currentSubscription(reg, publicKey);
  const { endpoint, keys } = subscription.toJSON();
  await pushApi.subscribe({ endpoint, keys });
  await tellWorker(publicKey);
  return true;
}

/**
 * Signing an account out of this device: its alerts stop arriving here. The device stays on for
 * any other account signed in on it.
 */
export async function forgetPushForMe() {
  if (!supported()) return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (subscription) await pushApi.unsubscribe({ endpoint: subscription.endpoint });
}
