import { useCallback, useRef } from 'react';
import Board from '../Board.jsx';
import { leads as leadsApi } from '../../api/endpoints.js';
import { useBoard } from '../../hooks/useBoard.js';
import { LEAD_BOARD, daysQuiet, isSettled } from '../../utils/boards.js';
import { followUpState } from '../../utils/pipeline.js';
import { formatCompactCurrency, humanise } from '../../utils/format.js';

/**
 * The lead book as a board.
 *
 * Two things make this one different from its siblings, and both are about being honest rather
 * than consistent.
 *
 * **The ageing figure is "how long since we spoke", not "how long in this column".** A lead
 * keeps no status history — there is no such field on the model — so the column-age the other
 * two boards show cannot be computed for one. `updatedAt` was there for the taking and would
 * have produced a number that looked exactly like the real thing while meaning "somebody
 * corrected a phone number". The question worth asking about a lead is whether it has gone
 * quiet, and that is answerable from the activity log.
 *
 * **Converted is a column you can read but not drop on.** Converting writes a customer, its
 * first contact and usually the first enquiry, and asks which of those to create; the server
 * refuses a bare status change to it for that reason. The column still shows what has been
 * converted, because that is the outcome the whole board is aimed at.
 */

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/** Where a lead may go from where it is: forwards, or out. */
const targetsFor = (card) => {
  if (['converted', 'disqualified'].includes(card.status)) return [];
  const ladder = ['new', 'contacted', 'qualified'];
  const at = ladder.indexOf(card.status);
  /*
   * Forward along the ladder only. A lead going back from qualified to new is not something
   * that happens — it either keeps being worked, converts, or is disqualified — and offering
   * the move would be inviting somebody to undo a judgement rather than record a new one.
   */
  return [...ladder.slice(at + 1), 'converted', 'disqualified'];
};

export default function LeadBoard({ filters, canMove, perColumn = 20 }) {
  const fetcher = useCallback((params) => leadsApi.board(params), []);
  const {
    columns, sort, loading, error, reload, move, moveError, dismissMoveError, appendTo,
  } = useBoard(fetcher, { ...filters, perColumn });

  const pages = useRef({});

  const onMove = ({ card, from, to, extra }) =>
    move({
      card,
      from,
      to,
      valueOf: (row) => row.estimatedValue || 0,
      apply: () =>
        leadsApi.update({
          id: card._id,
          /* The same optimistic-concurrency check every other write to a lead carries: a card
             is a copy, and somebody else may have edited the lead since the board loaded. */
          expectedUpdatedAt: card.updatedAt,
          status: to,
          ...extra,
        }),
    });

  const showMore = async (status) => {
    const next = (pages.current[status] || 1) + 1;
    const response = await leadsApi.list({ ...filters, status, sort, page: next, limit: perColumn });
    pages.current[status] = next;
    appendTo(status, response.data || []);
  };

  return (
    <Board
      board={LEAD_BOARD}
      columns={columns}
      loading={loading}
      error={error}
      onRetry={reload}
      canMove={canMove}
      targetsFor={targetsFor}
      onMove={onMove}
      moveError={moveError}
      onDismissMoveError={dismissMoveError}
      onShowMore={showMore}
      valueLabel="currency"
      hrefFor={(card) => `/leads/${card._id}`}
      describeCard={(card) => `${card.number} — ${card.company}`}
      renderCard={(card) => {
        const due = followUpState(card.nextFollowUpDate);
        const quiet = daysQuiet(card);
        return (
          <>
            <p className="truncate text-xs font-semibold text-steel-100">{card.company}</p>
            <p className="truncate text-[11px] text-steel-400">
              {card.number}
              {card.city ? ` · ${card.city}` : ''}
            </p>

            {card.productInterest && (
              <p className="mt-1 truncate text-[11px] text-steel-300">{card.productInterest}</p>
            )}

            {card.estimatedValue ? (
              <p className="mt-1.5 text-[11px] font-semibold tabular-nums text-steel-100">
                {formatCompactCurrency(card.estimatedValue)}
              </p>
            ) : null}

            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              {/* A disqualified lead has no next step by design — see `isSettled`. */}
              {isSettled(LEAD_BOARD, card.status) ? (
                <span className="text-steel-500">
                  {card.disqualifyReason ? humanise(card.disqualifyReason) : ''}
                </span>
              ) : due ? (
                <span className={TONE_TEXT[due.tone]}>{due.text}</span>
              ) : (
                <span className="text-warn-400">No next step</span>
              )}
              {/* Silence, which for a lead is the number that decides whether it is still alive. */}
              {quiet !== null && quiet >= 7 && (
                <span className={quiet >= 21 ? 'text-warn-400' : 'text-steel-500'}>
                  Quiet {quiet}d
                </span>
              )}
            </div>

            {card.assignedTo?.name && (
              <p className="mt-1 truncate text-[11px] text-steel-500">{card.assignedTo.name}</p>
            )}
          </>
        );
      }}
    />
  );
}
