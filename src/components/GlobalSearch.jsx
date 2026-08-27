import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search as searchApi } from '../api/endpoints.js';
import { useDebounced } from '../hooks/useRecords.js';

/**
 * One search across everything [BLUEPRINT §32].
 *
 * In the header rather than on a screen of its own, because §32's promise is that *one*
 * search answers "where is this customer's sample" — and a search you have to navigate to
 * first is one you use after you have already opened the wrong list.
 *
 * Results stay grouped by record type. A single relevance-ranked list reads faster in a demo
 * and worse in use: "SMP-2026-0004" and "Trendline Apparels" are different questions, and
 * merging them makes the reader find the type they meant among the types they did not.
 *
 * Arrow keys and Enter work over the flattened results, because a search box you have to
 * reach for the mouse in the middle of is slower than the list screen it replaces.
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const wrapper = useRef(null);
  const input = useRef(null);
  const requestId = useRef(0);

  const query = useDebounced(term, 250);

  useEffect(() => {
    if (query.trim().length < 2) {
      setData(null);
      return undefined;
    }

    const current = ++requestId.current;
    setLoading(true);
    let cancelled = false;

    searchApi(query)
      .then((response) => {
        if (cancelled || current !== requestId.current) return;
        setData(response);
        setActive(0);
      })
      .catch(() => !cancelled && current === requestId.current && setData(null))
      .finally(() => !cancelled && current === requestId.current && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [query]);

  /* A click elsewhere closes it, and Ctrl/⌘-K reaches it from anywhere. */
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Flattened once, so the keyboard walks the same order the eye does.
  const flat = (data?.groups || []).flatMap((group) =>
    group.results.map((result) => ({ ...result, group: group.label }))
  );

  const go = useCallback(
    (result) => {
      if (!result) return;
      setOpen(false);
      setTerm('');
      setData(null);
      navigate(result.link);
    },
    [navigate]
  );

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => Math.min(Math.max(index + step, 0), flat.length - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      go(flat[active]);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };

  const showing = open && term.trim().length >= 2;
  let cursor = -1;

  return (
    <div ref={wrapper} className="relative min-w-0 flex-1 sm:max-w-sm">
      <input
        ref={input}
        type="search"
        className="input py-1.5 text-[0.8125rem]"
        placeholder="Search customers, enquiries, samples…"
        aria-label="Search everything"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showing && (
        <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-full min-w-[20rem] overflow-y-auto rounded-lg border border-line/[0.08] bg-ink-800 py-1 shadow-raised">
          {loading && !data && <p className="px-3 py-2 text-xs text-steel-500">Searching…</p>}

          {data && !flat.length && (
            <p className="px-3 py-2 text-xs text-steel-500">
              Nothing matches &ldquo;{term.trim()}&rdquo;.
            </p>
          )}

          {data?.groups.map((group) => (
            <div key={group.key}>
              <p className="px-3 pb-1 pt-2 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-steel-500">
                {group.label}
                {/* Said out loud: a list that is quietly the first six of forty is a lie. */}
                {group.total > group.results.length && (
                  <span className="ml-1.5 font-medium normal-case tracking-normal">
                    showing {group.results.length} of {group.total}
                  </span>
                )}
              </p>
              {group.results.map((result) => {
                cursor += 1;
                const index = cursor;

                return (
                  <button
                    key={result._id}
                    type="button"
                    className={`block w-full px-3 py-2 text-left ${
                      index === active ? 'bg-line/[0.06]' : ''
                    }`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(result)}
                  >
                    <span className="block truncate text-[0.8125rem] font-medium text-steel-100">
                      {result.title}
                    </span>
                    {result.subtitle && (
                      <span className="block truncate text-xs text-steel-500">
                        {result.subtitle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
