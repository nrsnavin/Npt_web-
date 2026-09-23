/**
 * A screen fetched later must survive the site being deployed underneath it.
 *
 * The failure this guards is the one that was reported from the plant: a tab open across a
 * release asked for `assets/LeadAnalytics-CcLORf42.js`, which the deploy had renamed, and the
 * route died with "This screen could not be drawn". Nothing was wrong with the screen. See
 * `src/utils/lazyPage.js`.
 *
 *   node --test tests/lazy-pages.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const sourceFiles = (dir) => {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.jsx?$/.test(entry)) found.push(full);
  }
  return found;
};

test('every screen loaded on demand goes through lazyPage', () => {
  /*
   * The whole point: one screen added with the bare `lazy` is one screen that dies after a
   * deploy — and it dies for whoever happens to open it, days later, not for whoever added it.
   */
  const offenders = [];

  for (const file of sourceFiles(SRC)) {
    if (file.endsWith(path.join('utils', 'lazyPage.js'))) continue;
    const text = readFileSync(file, 'utf8');
    if (/(?<!lazyPage|[A-Za-z])lazy\s*\(\s*\(\s*\)\s*=>\s*import\(/.test(text)) {
      offenders.push(path.relative(SRC, file));
    }
  }

  assert.deepEqual(offenders, [], `use lazyPage(() => import(…)) in: ${offenders.join(', ')}`);
});

test('a screen is still actually being split', () => {
  /* A guard on the guard: if the swap above were done by deleting the lazy loading rather than
     wrapping it, this file would pass while everybody downloaded the whole app at login. */
  const app = readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
  const split = app.match(/lazyPage\(\(\) => import\(/g) || [];
  assert.ok(split.length > 20, `expected the screens to still be split, found ${split.length}`);
});

/* ------------------------- What the wrapper actually does ------------------------- */

/**
 * The module under test reaches for `sessionStorage` and `window.location`, neither of which
 * exists here. Both are stood up as the smallest thing that answers, so the behaviour being
 * checked is the module's rather than a mock's.
 */
const stub = () => {
  const store = new Map();
  const reloads = { count: 0 };

  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.window = { location: { reload: () => { reloads.count += 1; } } };

  return { store, reloads };
};

const CHUNK_GONE = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: https://npt.baluelastics.com/assets/X-abc.js'
  );

test('the browsers’ three wordings are all recognised, and a real bug is not', async () => {
  stub();
  const { isChunkMissing } = await import('../src/utils/lazyPage.js');

  /* Chrome, Firefox, Safari. */
  assert.ok(isChunkMissing(CHUNK_GONE()));
  assert.ok(isChunkMissing(new TypeError('error loading dynamically imported module')));
  assert.ok(isChunkMissing(new TypeError('Importing a module script failed.')));

  /* And the thing that must never be reloaded past: an ordinary bug in a screen. */
  assert.ok(!isChunkMissing(new TypeError('row.items.map is not a function')));
  assert.ok(!isChunkMissing(undefined));
});

test('a missing chunk reloads the tab once, and only once', async () => {
  const { reloads } = stub();
  const { recoverFrom } = await import('../src/utils/lazyPage.js');

  /* First time: the tab is stale, so replace it. */
  const waiting = recoverFrom(CHUNK_GONE());
  assert.equal(reloads.count, 1);

  /*
   * And it does not settle. React is handed this while the page is being replaced; resolving or
   * rejecting would draw a spinner or an apology in the frames before the reload lands.
   */
  const settled = await Promise.race([
    waiting.then(() => 'settled', () => 'settled'),
    new Promise((resolve) => { setTimeout(() => resolve('still pending'), 30); }),
  ]);
  assert.equal(settled, 'still pending');

  /* Second time, straight away: reloading did not help, so say so instead of doing it again. */
  assert.throws(() => recoverFrom(CHUNK_GONE()), /could not be fetched/);
  assert.equal(reloads.count, 1, 'no second reload — that would be an endless flicker');
});

test('a bug in a screen is never reloaded past', async () => {
  const { reloads } = stub();
  const { recoverFrom } = await import('../src/utils/lazyPage.js');

  /*
   * The dangerous mistake this file exists to prevent in the other direction: reloading on an
   * ordinary render error hides the bug and loses whatever was typed, every time, for ever.
   */
  const bug = new TypeError('row.items.map is not a function');
  assert.throws(() => recoverFrom(bug), (thrown) => thrown === bug);
  assert.equal(reloads.count, 0);
});

test('with nowhere to keep the guard, it does not reload at all', async () => {
  const { reloads } = stub();
  globalThis.sessionStorage = {
    getItem() { throw new Error('The operation is insecure.'); },
    setItem() { throw new Error('The operation is insecure.'); },
  };
  const { recoverFrom } = await import('../src/utils/lazyPage.js');

  /* A private window, or site data blocked. A tab that cannot remember it already reloaded
     would reload for ever, so it reports instead. */
  assert.throws(() => recoverFrom(CHUNK_GONE()), /could not be fetched/);
  assert.equal(reloads.count, 0);
});
