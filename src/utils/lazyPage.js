import { lazy } from 'react';

/**
 * A screen loaded on demand, that survives the site being deployed underneath it.
 *
 * **What goes wrong without this, and it is not rare.** The app is split per screen, so opening
 * Lead analytics fetches `assets/LeadAnalytics-CcLORf42.js` at the moment somebody clicks it.
 * The name carries a hash of the contents, so every deploy renames every changed chunk — and
 * `deploy/on-box.sh` swaps the whole directory in one `mv`. A tab that was open across that
 * rename is holding an `index.html` listing filenames that no longer exist on the box. The next
 * screen the person opens 404s, `import()` rejects, and React unmounts the route.
 *
 * What they see is "This screen could not be drawn" — which is true, and reads as the app
 * breaking, and is provoked by nothing worse than somebody else pressing merge. Pressing "Try
 * this screen again" fails identically every time, because the file is genuinely gone.
 *
 * **So: fetch it, and if the chunk is missing, reload once.** A reload re-fetches `index.html`,
 * which names the new chunks, and the screen opens. The deploy becomes invisible, which is what
 * it should have been.
 *
 * Three things make the reload safe rather than a way to lose somebody's afternoon:
 *
 *   **Only for a missing chunk.** A screen that throws while rendering is a bug, and reloading
 *   past a bug hides it and loses the typing. The message is matched first, and anything else is
 *   re-thrown untouched for the boundary to show.
 *
 *   **Once.** The tab records the moment it reloaded. A second failure inside that window is not
 *   a stale tab — the file is really absent, or the network is down — and reloading again would
 *   be an endless flicker on a screen nobody can escape. It surfaces instead, honestly.
 *
 *   **Never when it cannot be recorded.** With `sessionStorage` unavailable the guard above
 *   cannot be kept, so no reload is attempted at all. A message beats a loop.
 *
 * The other half of this lives on the box: Nginx serves the previous build's assets when the
 * current one has no such file, so a tab mid-deploy usually gets its chunk and never reloads at
 * all. Belt and braces, deliberately — the browser's half works whatever the server is doing,
 * including the deploy that removes `dist.old`.
 */

/**
 * Whether this is "the file is not there", said in each browser's own words.
 *
 * Chrome and Edge: `Failed to fetch dynamically imported module: <url>`.
 * Firefox: `error loading dynamically imported module`.
 * Safari: `Importing a module script failed.`
 *
 * Matched on the message because there is no error type to test: all three throw a plain
 * `TypeError`. Kept deliberately narrow — a wrong match here reloads past a real bug.
 */
export const isChunkMissing = (failure) => {
  const said = String(failure?.message || failure || '');
  return /dynamically imported module|Importing a module script failed|error loading dynamic/i
    .test(said);
};

/** How long after a reload a second failure is taken to be real rather than a stale tab. */
const SETTLING = 10000;

const STAMP = 'npt:chunk-reloaded-at';

/**
 * Whether this tab has already reloaded for a missing chunk a moment ago.
 *
 * A timestamp rather than a flag, because a flag would be spent on the first deploy of the day
 * and leave the tab defenceless against the second. The question being asked is "did I just try
 * this", not "have I ever".
 */
const justReloaded = () => {
  const at = Number(sessionStorage.getItem(STAMP) || 0);
  return at > 0 && Date.now() - at < SETTLING;
};

/**
 * A missing chunk, said in words somebody can act on.
 *
 * Reached only after a reload has already been spent, so "reload the page" is not the advice —
 * it has been tried. Kept as a real Error so the boundary prints it like any other.
 */
const gone = (failure) =>
  Object.assign(
    new Error(
      'This screen’s code could not be fetched. The site was probably updated a moment ago — '
      + 'close this tab and open the app again. If it keeps happening, the server is missing a '
      + 'file and somebody needs to look at the last deploy.'
    ),
    { cause: failure }
  );

/**
 * What to do about a screen that would not load: reload, re-throw, or give up honestly.
 *
 * Exported so it can be tested for what it actually does, rather than inferred from the shape
 * of the component `lazyPage` returns. Reaching the loader through React's internals to check
 * that a reload happened would be a test of React.
 */
export function recoverFrom(failure) {
  /* A screen that threw while rendering is a bug. Reloading past it would hide it and take
     whatever was typed with it, so it goes straight up to the boundary untouched. */
  if (!isChunkMissing(failure)) throw failure;

  let mayReload;
  try {
    mayReload = !justReloaded();
    if (mayReload) sessionStorage.setItem(STAMP, String(Date.now()));
  } catch {
    /* No storage means no guard, and no guard means no reload: a tab that cannot remember it
       has already tried would try for ever. */
    mayReload = false;
  }

  if (!mayReload) throw gone(failure);

  window.location.reload();

  /*
   * A promise that never settles. The page is being replaced, and resolving or rejecting here
   * would have React draw something — a spinner's fallback or the boundary's apology — in the
   * frames before the reload lands, which reads as a flicker of failure on the way to a screen
   * that works.
   */
  return new Promise(() => {});
}

/**
 * `React.lazy`, with the recovery above.
 *
 * Used for every screen in `App.jsx` and `Home.jsx`; `tests/lazy-pages.test.js` fails if a new
 * screen is added with the bare `lazy` instead, because the failure this prevents only appears
 * in front of somebody at work, days later, on whichever screen was forgotten.
 */
export default function lazyPage(load) {
  return lazy(() => load().catch(recoverFrom));
}
