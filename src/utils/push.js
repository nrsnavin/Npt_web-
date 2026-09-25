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

export async function enablePush() {
  const { publicKey } = await pushApi.key();
  if (!publicKey) throw new Error('Notifications are not set up on the server yet.');
  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed on this device.');
  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const { endpoint, keys } = subscription.toJSON();
  await pushApi.subscribe({ endpoint, keys });
}

export async function disablePush() {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await pushApi.unsubscribe({ endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}
