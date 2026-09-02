import { useCallback, useRef } from 'react';
import Board from '../Board.jsx';
import { enquiries as enquiriesApi } from '../../api/endpoints.js';
import { useBoard } from '../../hooks/useBoard.js';
import { ENQUIRY_BOARD, daysInColumn, isSettled } from '../../utils/boards.js';
import { CLOSED_STAGES, followUpState, nextStagesFrom, numeric } from '../../utils/pipeline.js';
import { formatCompactCurrency, formatNumber, humanise } from '../../utils/format.js';

/**
 * The enquiry funnel as a board.
 *
 * Everything module-specific about an enquiry board is here — what a card shows, where a card
 * may go, and what moving one actually calls — so `Board` itself stays a board and knows
 * nothing about enquiries.
 *
 * The rule about where a card may go is `nextStagesFrom`, the same helper the enquiry detail
 * screen's stage picker already uses, which in turn mirrors the server's §3 floor. Three
 * statements of one rule would be two too many; two is the price of not making the reader wait
 * for a round trip to find out that a column is closed to them.
 */

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/** How long it has sat here, said only once it is worth saying. */
function Aged({ card }) {
  const days = daysInColumn(card);
  if (days === null || days < 3) return null;
  return (
    <span className={days >= 14 ? 'text-warn-400' : 'text-steel-500'}>
      {days}d here
    </span>
  );
}

export default function EnquiryBoard({ filters, canMove, perColumn = 20 }) {
  const fetcher = useCallback((params) => enquiriesApi.board(params), []);
  const {
    columns, sort, loading, error, reload, move, moveError, dismissMoveError, appendTo,
  } = useBoard(fetcher, { ...filters, perColumn });

  /* Which page each column has read to. A ref, because turning one page must not redraw twelve. */
  const pages = useRef({});

  const onMove = ({ card, from, to, extra }) =>
    move({
      card,
      from,
      to,
      valueOf: (row) => row.estimatedValue || 0,
      apply: () =>
        enquiriesApi.setStatus({
          id: card._id,
          status: to,
          ...extra,
          /* The dialog hands back strings; the server's schema wants a number and rejects one
             that arrives quoted. Coerced here, at the boundary, rather than loosened there. */
          ...(extra.estimatedValue !== undefined
            ? { estimatedValue: numeric(extra.estimatedValue) }
            : {}),
        }),
    });

  const showMore = async (status) => {
    const next = (pages.current[status] || 1) + 1;
    const response = await enquiriesApi.list({
      ...filters,
      /* The stage is the column, and the sort is the board's own — see `boarded` in the API
         layer for why paging in a different order would repeat and hide cards at the seam. */
      status,
      sort,
      page: next,
      limit: perColumn,
    });
    pages.current[status] = next;
    appendTo(status, response.data || []);
  };

  return (
    <Board
      board={ENQUIRY_BOARD}
      columns={columns}
      loading={loading}
      error={error}
      onRetry={reload}
      canMove={canMove}
      targetsFor={(card) => nextStagesFrom(card).map((stage) => stage.value)}
      onMove={onMove}
      moveError={moveError}
      onDismissMoveError={dismissMoveError}
      onShowMore={showMore}
      valueLabel="currency"
      /* "Open" keeps its meaning by choosing columns rather than filtering rows — see `hidden`. */
      hidden={filters.open === 'true' ? CLOSED_STAGES : []}
      hrefFor={(card) => `/enquiries/${card._id}`}
      describeCard={(card) => `${card.number} — ${card.customer?.name || 'no customer'}`}
      renderCard={(card) => {
        const due = followUpState(card.nextFollowUpDate);
        return (
          <>
            <p className="truncate text-xs font-semibold text-steel-100">
              {card.customer?.name || 'No customer'}
            </p>
            <p className="truncate text-[11px] text-steel-400">
              {card.number} · {card.product?.modelCode || card.requirement?.modelNumber || 'New development'}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
              {card.requirement?.quantity ? (
                <span className="text-steel-300">{formatNumber(card.requirement.quantity)} pcs</span>
              ) : null}
              {card.estimatedValue ? (
                <span className="font-semibold text-steel-100">
                  {formatCompactCurrency(card.estimatedValue)}
                </span>
              ) : null}
            </div>

            {/*
              * The promise and whether it has been kept. On a board this is the line people
              * actually scan, so it is last and it is the only thing allowed to be red.
              */}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              {/* Closing an enquiry clears its follow-up on purpose, so a won or lost card is
                  not missing anything and must not be flagged as if it were. */}
              {isSettled(ENQUIRY_BOARD, card.status) ? (
                <span className="text-steel-500">{card.lostReason ? humanise(card.lostReason) : ''}</span>
              ) : due ? (
                <span className={TONE_TEXT[due.tone]}>{due.text}</span>
              ) : (
                <span className="text-warn-400">No next step</span>
              )}
              <Aged card={card} />
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
