/**
 * Pictures shared to the installed app from the phone's gallery — "Share → Navin Hangers".
 *
 * The share arrives as a POST the page cannot read, so the service worker keeps the files in
 * this cache and sends the app to the drafts screen [public/sw.js `share-photo`]; the screen
 * takes them from here, once, and uploads them with the person's own session.
 */
export const SHARED_CACHE = 'npt-shared-photos';

/** As many pictures as one go takes — a long chat runs to a few screenshots, not dozens. */
export const MOST_PHOTOS = 10;

/** Only pictures, in the order they were picked, at most `MOST_PHOTOS`. */
export const picturesOf = (files) =>
  Array.from(files || []).filter((file) => /^image\//i.test(file?.type || '')).slice(0, MOST_PHOTOS);

/** The shared pictures, oldest first, removed from the cache as they are taken. */
export async function takeSharedPhotos(store = globalThis.caches) {
  if (!store) return [];
  const cache = await store.open(SHARED_CACHE);
  const requests = (await cache.keys()).sort((a, b) => a.url.localeCompare(b.url));
  const files = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('X-File-Name') || 'shared-photo');
      files.push(new File([blob], name, { type: blob.type || response.headers.get('Content-Type') || 'image/jpeg' }));
    }
    await cache.delete(request);
  }
  return files;
}
