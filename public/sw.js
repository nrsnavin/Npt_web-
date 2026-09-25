/*
 * The installed app's service worker.
 *
 * It keeps the app itself — the page and its scripts — so the app opens at once on a poor signal
 * and shows its own screen, not the browser's, when there is none. It never keeps data: anything
 * from the API goes straight to the network, so nobody reads yesterday's figures thinking they
 * are today's, and nothing a person may not see is left on the phone.
 *
 * It also shows the pushes the server sends — a tag, an urgent thread — and opens the thread
 * when the notification is pressed.
 */
const SHELL = 'npt-shell-v1';
const ASSETS = 'npt-assets-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/favicon.svg', '/icons/icon-192.png'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, ASSETS].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
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
    self.registration.showNotification(message.title || 'Navin Hangers', {
      body: message.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { link: message.link || '/' },
      tag: message.link || undefined,
    })
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
