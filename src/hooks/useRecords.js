import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads one record. Re-fetches whenever the id changes, and exposes `reload` so an action
 * that changes the record server-side can pull the authoritative version back.
 */
export function useRecord(fetcher, id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcher(id));
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [fetcher, id]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, loading, error, reload: load };
}

/**
 * Loads a paginated list.
 *
 * `params` is compared by its serialised form rather than by reference, so a caller can
 * pass a fresh object literal each render without spinning. Responses are dropped if a
 * newer request has already started, so fast typing in a search box cannot leave the
 * slower earlier response on screen.
 */
export function useRecordList(fetcher, params = {}) {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetcher(JSON.parse(key));
      if (current !== requestId.current) return;
      setData(response.data || []);
      setPagination(response.pagination || null);
    } catch (loadError) {
      if (current !== requestId.current) return;
      setError(loadError);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [fetcher, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, pagination, loading, error, reload: load };
}

/** Delays a fast-changing value, so a search box queries on a pause rather than a keystroke. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
