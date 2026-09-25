import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Opens a page's "new" form when the address says `?new=1` — how the command bar's "New sample"
 * lands on the samples page with the form already open. The flag is taken off the address once
 * used, so going back or reloading does not open the form a second time.
 */
export default function useOpenFromLink(open, key = 'new') {
  const [params, setParams] = useSearchParams();
  const wanted = params.get(key) === '1';

  useEffect(() => {
    if (!wanted) return;
    open();
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
}
