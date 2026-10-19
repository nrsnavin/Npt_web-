/*
 * The installed app's service worker.
 *
 * It keeps the app itself — the page and its scripts — so the app opens at once on a poor signal
 * and shows its own screen, not the browser's, when there is none. It never keeps data: anything
 * from the API goes straight to the network, so nobody reads yesterday's figures thinking they
 * are today's, and nothing a person may not see is left on the phone.
 *
 * It also shows the pushes the server sends — a tag, an urgent thread — and opens the thread
 * when the notification is pressed; and when the browser replaces the device's subscription, it
 * makes the new one and tells the server, so the phone does not go quiet until someone notices.
 *
 * And it takes pictures shared to the app from the phone's gallery ("Share → Navin Hangers",
 * manifest `share_target`): the share arrives as a POST no page can read, so the files are kept
 * here a moment and the app opens on Draft enquiries, which uploads them with the person's own
 * session [src/utils/sharedPhotos.js].
 */
const SHELL = 'npt-shell-v1';
const ASSETS = 'npt-assets-v1';
const SHARED = 'npt-shared-photos';
/* Where the API is and the server's push key, put here by the app [src/utils/push.js `tellWorker`]. */
const PUSH_CONFIG = 'npt-push';
const MOST_SHARED = 10;

async function keepShared(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('photos').filter((file) => file && /^image\//i.test(file.type || '')).slice(0, MOST_SHARED);
    const cache = await caches.open(SHARED);
    const stamp = Date.now();
    await Promise.all(files.map((file, index) => cache.put(
      `/shared-photo/${stamp}-${String(index).padStart(2, '0')}`,
      new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg', 'X-File-Name': encodeURIComponent(file.name || 'shared-photo') } })
    )));
  } catch {
    /* Nothing kept: the drafts screen opens all the same, and the photo can be picked there. */
  }
  return Response.redirect('/enquiries/drafts?shared=1', 303);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/favicon.svg', '/icons/icon-192.png'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, ASSETS, SHARED, PUSH_CONFIG].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  /* Pictures shared from the gallery. */
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-photo') {
    event.respondWith(keepShared(request));
    return;
  }
  /* Only this app's own files. The API is another origin, and is never kept. */
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  /* A page: the network first, so a deploy is seen at once; the kept shell when offline. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  /* Built scripts and styles carry their hash in the name, so a kept copy is never stale. */
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (kept) =>
          kept ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: event.data?.text() || 'Navin Hangers' };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title || 'Navin Hangers', {
        body: message.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { link: message.link || '/' },
        /*
         * Each its own banner. Tagged by the task, a second move on the same task replaced the
         * first without a sound or a banner — the phone looked silent while the app's bell had it.
         * Only a sender that asks for one tag (a test) collapses, and it still rings again.
         */
        ...(message.tag ? { tag: message.tag, renotify: true } : {}),
      }),
      /* The app, where it is open, is told the same moment — a toast and the bell, no polling. */
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        windows.forEach((client) => client.postMessage({ type: 'push', message }));
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus().then(() => open.navigate(link));
      return self.clients.openWindow(link);
    })
  );
});

/*
 * The browser replaced this device's subscription — it expired, or the push service rotated it.
 * Pushes to the old one now fail, so a new one is made with the same key and the server moves
 * every account's row on this device to it [server: push.controller `renewPush`]. The worker has
 * no sign-in and needs none: the old endpoint, which only this device knows, is the proof. Where
 * this cannot run, the app does the same the next time it opens [src/utils/push.js `syncPush`].
 */
function keyBytes(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function renewSubscription(event) {
  const kept = await caches.open(PUSH_CONFIG).then((cache) => cache.match('/push-config'));
  const config = kept ? await kept.json() : null;
  if (!config?.api) return;
  const applicationServerKey = event.oldSubscription?.options?.applicationServerKey || (config.publicKey ? keyBytes(config.publicKey) : null);
  if (!applicationServerKey) return;
  const subscription = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
  const { endpoint, keys } = subscription.toJSON();
  const oldEndpoint = event.oldSubscription?.endpoint;
  if (!oldEndpoint || oldEndpoint === endpoint) return;
  await fetch(`${config.api}/workspace/push/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldEndpoint, endpoint, keys }),
  });
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(renewSubscription(event).catch(() => {}));
});
