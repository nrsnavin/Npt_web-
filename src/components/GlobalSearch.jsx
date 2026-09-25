import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { queries as queriesApi, search as searchApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { suggestCommands } from '../utils/commands.js';
import { useDebounced } from '../hooks/useRecords.js';

/**
 * One search across everything [BLUEPRINT §32], as a command palette.
 *
 * A modal on ⌘K rather than a field in the corner, because §32's promise is that *one*
 * search answers "where is this customer's sample" — and a field you have to find first is
 * one you reach for after you have already opened the wrong list. The shortcut works from
 * every screen, so the answer is always the same two keystrokes away.
 *
 * Results stay grouped by record type. A single relevance-ranked list reads faster in a demo
 * and worse in use: "SMP-2026-0004" and "Trendline Apparels" are different questions, and
 * merging them makes the reader find the type they meant among the types they did not.
 *
 * Fully keyboard-driven, since a palette you have to reach for the mouse inside is slower
 * than the list screen it replaces: arrows walk the results, Enter opens, Escape closes.
 *
 * Rendered through a portal to `document.body`. The trigger lives in the header, and the
 * header carries `backdrop-blur` — which makes it a containing block for `position: fixed`
 * descendants, so `inset-0` resolved against the header's own strip rather than the
 * viewport. The scrim then covered a 96px band, clicks outside the header did not dismiss,
 * and the page behind stayed live while looking dimmed. A dialog should not depend on where
 * its button happens to sit, so it escapes to the body and the question stops arising.
 */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/**
 * The trigger in the header. A field on a desktop, an icon on a phone.
 *
 * Taking a share of the header's width on a 390px screen squeezed the module tabs down to
 * four letters and left the trigger itself reading "S…". Neither was usable, and a control
 * whose own label does not fit is not advertising anything. Below `sm` it collapses to the
 * icon and gives the width back; the palette it opens is identical either way.
 */
function SearchTrigger({ onOpen }) {
  const icon = (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-steel-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search everything"
      title="Search everything"
      /* A field on a phone's width and on a very wide screen; an icon between, where the module
         tabs need the room — at 1366px the field pushed "Administration" off the end. */
      className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-lg border border-line/[0.08] bg-ink-800/60 px-2.5 py-1.5 text-left transition-colors hover:border-line/15 sm:min-w-0 sm:flex-1 sm:shrink sm:max-w-xs lg:max-w-none lg:flex-none lg:min-w-11 2xl:min-w-0 2xl:flex-1"
    >
      {icon}
      <span className="hidden truncate text-xs text-steel-500 sm:block lg:hidden 2xl:block">Search…</span>
      <kbd className="ml-auto hidden shrink-0 rounded border border-line/[0.08] px-1.5 py-0.5 font-sans text-xs font-semibold text-steel-500 sm:block lg:hidden 2xl:block">
        {isMac ? '⌘' : 'Ctrl '}K
      </kbd>
    </button>
  );
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const input = useRef(null);
  const requestId = useRef(0);
  const { user, canRead, canWrite } = useAuth();
  const { toast, warn } = useToast();
  const [running, setRunning] = useState(false);

  const query = useDebounced(term, 250);

  const close = useCallback(() => {
    setOpen(false);
    setTerm('');
    setData(null);
    setActive(0);
  }, []);

  /* ⌘K / Ctrl-K from anywhere, and Escape out of it. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }
      // Only when the palette owns the screen, or this would close whatever is behind it.
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        close();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  /* Navigating away closes it — the palette is how you left, not somewhere you return to. */
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  /* The page behind must not scroll under an open dialog. */
  useEffect(() => {
    if (!open) return undefined;

    input.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    /* "label QRY-6 quality" is an instruction, not something to search for. */
    if (!open || query.trim().length < 2 || /^(label|close|reopen|urgent)\s/i.test(query.trim())) {
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
  }, [open, query]);

  /* What was typed read as a command — a page, a form, or something done to a query. Shown above
     the search results, so Enter on "new sample" opens the form rather than searching for it. */
  const commands = suggestCommands(term, { canRead, canWrite, isAdmin: user?.role === 'admin' });

  // Flattened once, so the keyboard walks the same order the eye does.
  const flat = [
    ...commands.map((command) => ({ ...command, _id: command.id, isCommand: true })),
    ...(data?.groups || []).flatMap((group) =>
      group.results.map((result) => ({ ...result, group: group.label }))
    ),
  ];

  /** Finds the query a command names — the exact number, or the newest ending in those digits. */
  const findQuery = async (ref) => {
    const answer = await queriesApi.list({ search: ref.exact || ref.tail, limit: 10, ai: 'false' });
    const rows = answer.data || [];
    return ref.exact
      ? rows.find((row) => row.number === ref.exact)
      : rows.filter((row) => row.number?.endsWith(`-${ref.tail}`)).sort((a, b) => (a.number < b.number ? 1 : -1))[0];
  };

  const runCommand = async (command) => {
    const { run } = command;
    if (command.disabled) return;
    if (run.type === 'go') {
      close();
      navigate(run.path);
      return;
    }
    setRunning(true);
    try {
      const query = await findQuery(run.ref);
      if (!query) {
        warn('No such query', 'Nothing you can see has that number.');
        return;
      }
      if (run.type === 'label') {
        const result = await queriesApi.bulkLabel({ ids: [query._id], add: run.label });
        if (result.updated.length) toast(`Filed ${query.number} under #${result.label}`);
        else warn(`${query.number} was not filed`, result.skipped[0]?.reason || 'It already carries that label.');
      } else if (run.type === 'close') {
        await queriesApi.close(query._id);
      } else if (run.type === 'reopen') {
        await queriesApi.reopen(query._id);
      } else if (run.type === 'urgent') {
        await queriesApi.urgent({ id: query._id, urgent: true });
      }
      close();
      navigate(`/queries/${query._id}`);
    } catch (error) {
      warn('That did not go through', error.message);
    } finally {
      setRunning(false);
    }
  };

  const go = (result) => {
    if (!result) return;
    if (result.isCommand) {
      runCommand(result);
      return;
    }
    close();
    navigate(result.link);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => Math.min(Math.max(index + step, 0), Math.max(flat.length - 1, 0)));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      go(flat[active]);
    }
  };

  let cursor = -1;

  return (
    <>
      <SearchTrigger onOpen={() => setOpen(true)} />

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search everything"
          className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[8vh]"
        >
          {/* Clicking away closes, the way a palette should. */}
          <div
            className="absolute inset-0 animate-fade-in bg-scrim/80 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          <div className="relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line/[0.08] bg-ink-800 shadow-raised">
            <div className="flex shrink-0 items-center gap-2.5 border-b border-line/[0.06] px-4 py-3">
              <svg viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem] shrink-0 text-steel-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={input}
                type="text"
                className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-steel-50 outline-none placeholder:text-steel-500"
                placeholder="Search, or type a command — new sample, label QRY-6 quality…"
                aria-label="Search everything"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="shrink-0 rounded border border-line/[0.08] px-1.5 py-0.5 text-xs font-semibold text-steel-500 hover:text-steel-200"
              >
                Esc
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {/* The commands, first — see `utils/commands.js`. */}
              {commands.length > 0 && (
                <div>
                  <p className="px-4 pb-1 pt-2.5 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-steel-500">
                    {term.trim() ? 'Do' : 'Quick actions'}
                  </p>
                  {commands.map((command, index) => (
                    <button
                      key={command.id}
                      type="button"
                      disabled={running}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${index === active ? 'bg-line/[0.07]' : ''} ${
                        command.disabled ? 'opacity-60' : ''
                      }`}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runCommand(command)}
                    >
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                          command.kind === 'act'
                            ? 'bg-flame-500/15 text-flame-400'
                            : command.kind === 'new'
                              ? 'bg-aqua-500/15 text-aqua-300'
                              : 'bg-line/[0.07] text-steel-300'
                        }`}
                      >
                        {command.kind === 'act' ? '⚡' : command.kind === 'new' ? '+' : '→'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-steel-100">{command.title}</span>
                        <span className="block truncate text-xs text-steel-500">{command.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {term.trim().length < 2 && (
                <p className="px-4 py-5 text-center text-xs leading-relaxed text-steel-500">
                  Search a customer, a number, a model or a phone number — or type a command:
                  <br />
                  <span className="font-mono text-steel-400">new sample</span> ·{' '}
                  <span className="font-mono text-steel-400">label QRY-6 quality</span> ·{' '}
                  <span className="font-mono text-steel-400">close QRY-6</span> ·{' '}
                  <span className="font-mono text-steel-400">samples</span>
                </p>
              )}

              {term.trim().length >= 2 && loading && !data && (
                <p className="px-4 py-6 text-center text-sm text-steel-500">Searching…</p>
              )}

              {term.trim().length >= 2 && data && !flat.length && !commands.length && (
                <p className="px-4 py-6 text-center text-sm text-steel-500">
                  Nothing matches &ldquo;{term.trim()}&rdquo;.
                </p>
              )}

              {data?.groups.map((group) => (
                <div key={group.key}>
                  <p className="px-4 pb-1 pt-2.5 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-steel-500">
                    {group.label}
                    {/* Said out loud: a list quietly showing the first six of forty is a lie. */}
                    {group.total > group.results.length && (
                      <span className="ml-1.5 font-medium normal-case tracking-normal">
                        showing {group.results.length} of {group.total}
                      </span>
                    )}
                  </p>
                  {group.results.map((result) => {
                    cursor += 1;
                    /* After the commands, which take the first places on the keyboard. */
                    const index = cursor + commands.length;

                    return (
                      <button
                        key={result._id}
                        type="button"
                        className={`block w-full px-4 py-2.5 text-left ${
                          index === active ? 'bg-line/[0.07]' : ''
                        }`}
                        onMouseEnter={() => setActive(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => go(result)}
                      >
                        <span className="block truncate text-xs font-medium text-steel-100">
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

            {flat.length > 0 && (
              <div className="flex shrink-0 items-center gap-3 border-t border-line/[0.06] px-4 py-2 text-xs text-steel-500">
                <span>↑↓ to move</span>
                <span>↵ to open</span>
                {data && <span className="ml-auto">{data.total} in all</span>}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
