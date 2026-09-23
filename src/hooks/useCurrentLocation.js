import { useCallback, useState } from 'react';

/**
 * One fix from the phone, taken because somebody pressed a button.
 *
 * **Only ever on a press.** There is no watch, no interval and nothing on mount: a location in
 * this app is a message a person chose to send (docs/QUERIES-CHAT-DESIGN.md §6), and a hook that
 * could be pointed at a timer is a hook somebody eventually points at one.
 *
 * `enableHighAccuracy` because the job is a buyer's gate, not a town; a 15 s ceiling because a
 * phone that has not found the sky by then is not going to, and waiting longer on a shop floor
 * reads as the app hanging. A fix up to a minute old is reused — the person has not moved in the
 * time it took to type a caption.
 *
 * The failures are told apart because they are answered differently. **Denied** means the person
 * (or their phone) said no, and the fix is in settings, so that is what the message says.
 * **Unsupported** is an old browser or a page not served over HTTPS — browsers refuse location to
 * insecure pages. Anything else is "could not get a fix", which is worth one retry.
 */
export default function useCurrentLocation() {
  const [state, setState] = useState({ status: 'idle' });

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({
        status: 'unsupported',
        message: 'This browser cannot share a location here. Open the app in Chrome on your phone.',
      });
      return;
    }

    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: 'ready',
          fix: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          },
        });
      },
      (failure) => {
        /* 1 is PERMISSION_DENIED in every browser; the constant is not exported anywhere usable. */
        if (failure.code === 1) {
          setState({
            status: 'denied',
            message: 'Location is turned off for this app. Allow it in your browser’s site '
              + 'settings (the lock beside the address), then press the pin again.',
          });
          return;
        }
        setState({
          status: 'failed',
          message: 'Your phone could not find where it is. Turn on GPS or step outside, then try again.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  const clear = useCallback(() => setState({ status: 'idle' }), []);

  return { ...state, locate, clear };
}
