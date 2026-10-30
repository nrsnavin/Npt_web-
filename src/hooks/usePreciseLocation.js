import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A precise fix for a visit to the buyer's place — under 10 m when the phone can give one.
 *
 * The first fix a phone hands back is often its cell-tower or Wi-Fi guess, tens or hundreds of
 * metres out; the satellites take a few seconds more to lock. So on the press this watches the
 * phone's fixes — never a cached one (`maximumAge: 0`), high accuracy asked for — keeps the best,
 * and stops as soon as one is within `targetM`. The watch lives only for that window: nothing runs
 * before the press or after it ends, as with `useCurrentLocation`.
 *
 * Statuses:
 *   locating   watching; `best` is the closest fix so far, shown live ("±24 m — getting closer")
 *   ready      a fix within the target: `fix`
 *   rough      the window ran out without one: `fix` is the best there was, for the person to
 *              record anyway or try again in the open
 *   denied / unsupported / failed   as `useCurrentLocation`, with what to do
 */
export const TARGET_ACCURACY_M = 10;
export const PRECISE_WINDOW_MS = 45000;

const fixOf = (position) => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
  accuracyM: position.coords.accuracy,
  capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
});

export default function usePreciseLocation({ targetM = TARGET_ACCURACY_M, windowMs = PRECISE_WINDOW_MS } = {}) {
  const [state, setState] = useState({ status: 'idle' });
  const watch = useRef(null);
  const timer = useRef(null);
  const best = useRef(null);

  const stop = useCallback(() => {
    if (watch.current != null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watch.current);
    if (timer.current) clearTimeout(timer.current);
    watch.current = null;
    timer.current = null;
  }, []);
  /* Leaving the screen mid-watch ends it. */
  useEffect(() => stop, [stop]);

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'unsupported', message: 'This browser cannot share a location here. Open the app in Chrome on your phone.' });
      return;
    }
    stop();
    best.current = null;
    setState({ status: 'locating', best: null, startedAt: Date.now() });
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        const fix = fixOf(position);
        if (!best.current || fix.accuracyM < best.current.accuracyM) best.current = fix;
        if (best.current.accuracyM <= targetM) {
          stop();
          setState({ status: 'ready', fix: best.current });
        } else {
          setState((current) => ({ ...current, status: 'locating', best: best.current }));
        }
      },
      (failure) => {
        /* 1 is PERMISSION_DENIED. A slow or missing fix (2, 3) is waited out — the window decides. */
        if (failure.code === 1) {
          stop();
          setState({ status: 'denied', message: 'Location is turned off for this app. Allow it in your browser’s site settings (the lock beside the address), then press again.' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: windowMs },
    );
    timer.current = setTimeout(() => {
      stop();
      if (best.current) setState({ status: 'rough', fix: best.current, message: `The closest the phone got was ±${Math.round(best.current.accuracyM)} m. Step into the open, away from walls and roofs, and try again — or record it as it is.` });
      else setState({ status: 'failed', message: 'Your phone could not find where it is. Turn on GPS (Location → High accuracy) and step outside, then try again.' });
    }, windowMs);
  }, [stop, targetM, windowMs]);

  /* "Record anyway": the rough fix is taken as it is. */
  const accept = useCallback(() => setState((current) => (current.fix ? { status: 'ready', fix: current.fix, rough: true } : current)), []);
  const reset = useCallback(() => { stop(); setState({ status: 'idle' }); }, [stop]);

  return { ...state, targetM, locate, accept, reset };
}
