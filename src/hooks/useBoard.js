import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads a board and owns what happens when a card is dragged across it.
 *
 * Separate from `useRecordList` because a board is not a list with more columns. A list replaces
 * its page; a board keeps every column on screen at once, moves a card between two of them
 * without refetching either, and has to keep two numbers per column honest — the count of what
 * is in it, and the money behind that count.
 *
 * **The move is optimistic, and the rollback is exact.** The card jumps the moment it is
 * dropped, because a board that waits half a second for a round trip before anything visibly
 * happens feels broken, and people drop the same card twice. If the server refuses, the card
 * goes back precisely where it was — its old column, its old position in that column, both
 * totals restored — and the server's own sentence is shown. Those sentences are already written
 * for people ("This enquiry has already reached Quote submitted, so it cannot go back to
 * Pricing required"), so there is nothing to translate.
 *
 * **A refusal is not a reason to reload.** Snapping the board back is enough, and a full reload
 * would throw away every other column's "show more" as collateral for one bad drop.
 *
 * **The reply replaces the card.** A status change usually writes more than the status — a
 * follow-up date, a lost reason, the dispatch details — and the server hands the whole record
 * back. Keeping the pre-move copy would leave a card that had visibly moved still showing the
 * fields it moved away from.
 */
/**
 * Whether this screen is showing its list or its board, remembered per screen.
 *
 * Remembered rather than reset each visit because it is a preference, not a filter: somebody
 * who works the enquiry funnel as a board wants it as a board tomorrow morning too, and being
 * handed the table again every time is the sort of small friction that stops a feature being
 * used at all. Kept per screen, since the same person may well want the leads as a board and
 * the sample bench as a queue.
 *
 * Every read and write is guarded: a private window, cleared site data, or a browser set to
 * refuse storage all throw here rather than returning nothing, and a preference is not worth a
 * blank screen.
 */
export function useViewMode(key, initial = 'list') {
  const storageKey = `npt.view.${key}`;

  const [mode, setMode] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) || initial;
    } catch {
      return initial;
    }
  });

  const choose = useCallback((next) => {
    setMode(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* The preference simply does not persist. Nothing on the screen depends on it. */
    }
  }, [storageKey]);

  return [mode, choose];
}

export function useBoard(fetcher, params = {}) {
  const [columns, setColumns] = useState([]);
  const [sort, setSort] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /** A refused move. Distinct from `error`, which means the board itself would not load. */
  const [moveError, setMoveError] = useState(null);
  const requestId = useRef(0);

  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetcher(JSON.parse(key));
      // A slower earlier request must not overwrite a newer one — the same rule the list
      // hook holds, and it matters more here because a board is refetched on every filter.
      if (current !== requestId.current) return;
      setColumns(response.columns || []);
      setSort(response.sort);
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

  /**
   * Moves a card between columns and asks the server to agree.
   *
   * `apply` is the caller's — `enquiries.setStatus`, `samples.setStatus`, `leads.update` — so
   * every move goes through the ordinary write route with every rule it carries. The board has
   * no endpoint of its own to move anything, which is the point: a second write path would be a
   * second place for the §3 floor and the §9 gate to be enforced, or forgotten.
   */
  const move = useCallback(async ({ card, from, to, valueOf, apply }) => {
    setMoveError(null);

    /* Where it was, precisely — so a refusal can put it back rather than approximately back. */
    const before = columns;
    const index = columns.find((column) => column.status === from)?.cards
      .findIndex((row) => row._id === card._id) ?? -1;

    const worth = valueOf ? valueOf(card) || 0 : 0;

    setColumns((current) =>
      current.map((column) => {
        if (column.status === from) {
          return {
            ...column,
            total: Math.max(column.total - 1, 0),
            value: column.value - worth,
            cards: column.cards.filter((row) => row._id !== card._id),
          };
        }
        if (column.status === to) {
          return {
            ...column,
            total: column.total + 1,
            value: column.value + worth,
            /*
             * On the front. The board sorts by when something was promised and a card that has
             * just moved has no new promise yet, so any position is a guess — the top is the
             * guess that keeps it where the person who moved it is still looking.
             */
            cards: [{ ...card, status: to }, ...column.cards],
          };
        }
        return column;
      })
    );

    try {
      const saved = await apply();
      /* The server's version of the card, which carries whatever else the move wrote. */
      setColumns((current) =>
        current.map((column) =>
          column.status === to
            ? { ...column, cards: column.cards.map((row) => (row._id === card._id ? { ...row, ...saved } : row)) }
            : column
        )
      );
      return { ok: true };
    } catch (failure) {
      setColumns(before.map((column) => ({ ...column, cards: [...column.cards] })));
      setMoveError(failure);
      return { ok: false, error: failure, index };
    }
  }, [columns]);

  /** Another page of one column, appended — never replacing what is already read. */
  const appendTo = useCallback((status, cards) => {
    setColumns((current) =>
      current.map((column) => {
        if (column.status !== status) return column;
        /* Guarding the seam: a card already on screen must not arrive again from page two. */
        const known = new Set(column.cards.map((row) => row._id));
        return { ...column, cards: [...column.cards, ...cards.filter((row) => !known.has(row._id))] };
      })
    );
  }, []);

  return {
    columns, sort, loading, error, reload: load,
    move, moveError, dismissMoveError: () => setMoveError(null), appendTo,
  };
}
