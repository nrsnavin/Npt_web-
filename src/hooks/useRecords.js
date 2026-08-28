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
  /*
   * Whatever else the reply carried about the whole result rather than this page of it — a
   * tally per stage, say. Kept here rather than fetched separately by whoever wants it,
   * because it was computed from the same filter and must change at the same moment the rows
   * do; two requests would show a count that disagreed with the list beneath it.
   */
  const [meta, setMeta] = useState({});
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
      const { data: rows, pagination: pages, success, ...rest } = response;
      setData(rows || []);
      setPagination(pages || null);
      setMeta(rest);
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

  return { data, setData, pagination, meta, loading, error, reload: load };
}

/**
 * Loads a list that grows by appending — a feed rather than a table.
 *
 * Distinct from `useRecordList`, which replaces the page each time. A conversation is read
 * downwards: paging it would take away what the reader has already read to show them what
 * comes next, so here the next page joins the end and everything stays put.
 *
 * `reload` returns to the first page, which is what any write to the feed should do — a new
 * entry belongs at the top, not appended to whatever was last fetched.
 */
export function usePagedFeed(fetcher, params = {}) {
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const key = JSON.stringify(params);

  const fetchPage = useCallback(
    async (page, { append }) => {
      const current = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const response = await fetcher({ ...JSON.parse(key), page });
        if (current !== requestId.current) return;

        const rows = response.data || [];
        // Deduplicated on merge: an entry posted between two page fetches shifts everything
        // down one, and without this the row on the boundary would appear twice.
        setData((existing) => {
          if (!append) return rows;
          const seen = new Set(existing.map((row) => row._id));
          return [...existing, ...rows.filter((row) => !seen.has(row._id))];
        });
        setPagination(response.pagination || null);
      } catch (loadError) {
        if (current === requestId.current) setError(loadError);
      } finally {
        if (current === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [fetcher, key]
  );

  const reload = useCallback(() => fetchPage(1, { append: false }), [fetchPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const hasMore = Boolean(pagination && pagination.page < pagination.pages);
  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    fetchPage(pagination.page + 1, { append: true });
  }, [fetchPage, hasMore, loading, loadingMore, pagination]);

  return { data, setData, pagination, loading, loadingMore, error, reload, loadMore, hasMore };
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
