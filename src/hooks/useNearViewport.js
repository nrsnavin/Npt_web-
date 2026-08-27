import { useEffect, useRef, useState } from 'react';

/**
 * True once the element has come near the viewport, and true from then on.
 *
 * Sticky on purpose: something that has been seen stays loaded. A hook that flipped back to
 * false on scrolling away would throw work out and redo it the moment the reader scrolled
 * back, which is worse than never having deferred it.
 *
 * `rootMargin` is generous so the work starts before the element is actually visible —
 * loading only on the exact intersection means the reader watches a blank space fill in.
 */
export function useNearViewport({ rootMargin = '400px', once = true } = {}) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || near) return undefined;

    // No observer (old browser, a test environment): show everything rather than nothing.
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setNear(true);
          if (once) observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [near, once, rootMargin]);

  return [ref, near];
}

export default useNearViewport;
