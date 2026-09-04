import { useCallback, useRef } from 'react';
import Board from '../Board.jsx';
import { samples as samplesApi } from '../../api/endpoints.js';
import { useBoard } from '../../hooks/useBoard.js';
import { SAMPLE_BOARD, daysInColumn, isSettled } from '../../utils/boards.js';
import {
  CLOSED_SAMPLE_STAGES, WITH_CUSTOMER_STAGES, followUpState, nextSampleStagesFrom, numeric,
} from '../../utils/pipeline.js';
import { formatNumber } from '../../utils/format.js';

/**
 * The sample bench as a board — the follow-up view of what has been asked for and where it is.
 *
 * The one of the three where most of the interesting behaviour is about what a board must *not*
 * let you do. Four of its thirteen columns refuse a dropped card: the three feedback outcomes,
 * because what the customer said is recorded by whoever spoke to them and never by the person
 * who made the sample, and `cancelled`, because ending a request is a decision that belongs on
 * the record with its reason. All four are still drawn — what has been approved and what came
 * back for modification is most of what anybody opens this screen to find out.
 *
 * Dispatch is the other one. Getting a sample out of the door needs a courier, an AWB and a
 * quantity, and the server refuses without them; the board asks for all three at the drop, so
 * the move either happens or was never attempted.
 */

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

export default function SampleBoard({ filters, canMove, perColumn = 20 }) {
  const fetcher = useCallback((params) => samplesApi.board(params), []);
  const {
    columns, sort, loading, error, reload, move, moveError, dismissMoveError, appendTo,
  } = useBoard(fetcher, { ...filters, perColumn });

  const pages = useRef({});

  /*
   * Which columns this view is asking about.
   *
   * The escalation rule [§25] is that a sample is overdue when its date has passed *and* the
   * delay is the plant's — a request already with the customer, or already answered, is not
   * the bench's problem. On a list the server expresses both halves as a filter. On a board the
   * date half is still a filter and the status half becomes this: the columns §25 excludes are
   * simply not drawn, which is the same rule stated in the only grammar a board has.
   */
  const hidden = filters.overdue === 'true'
    ? [...CLOSED_SAMPLE_STAGES, ...WITH_CUSTOMER_STAGES]
    : filters.open === 'true'
      ? CLOSED_SAMPLE_STAGES
      : [];

  const onMove = ({ card, from, to, extra }) =>
    move({
      card,
      from,
      to,
      /* Pieces, not rupees — a sample has a quantity and no price [see the board endpoint]. */
      valueOf: (row) => row.quantity || 0,
      apply: () =>
        samplesApi.setStatus({
          id: card._id,
          status: to,
          ...extra,
          ...(extra.dispatchedQuantity !== undefined
            ? { dispatchedQuantity: numeric(extra.dispatchedQuantity) }
            : {}),
        }),
    });

  const showMore = async (status) => {
    const next = (pages.current[status] || 1) + 1;
    const response = await samplesApi.list({ ...filters, status, sort, page: next, limit: perColumn });
    pages.current[status] = next;
    appendTo(status, response.data || []);
  };

  return (
    <Board
      board={SAMPLE_BOARD}
      columns={columns}
      loading={loading}
      error={error}
      onRetry={reload}
      canMove={canMove}
      /* The maker's own list of moves, which already excludes the three feedback outcomes. */
      targetsFor={(card) => nextSampleStagesFrom(card.status).map((stage) => stage.value)}
      onMove={onMove}
      moveError={moveError}
      onDismissMoveError={dismissMoveError}
      onShowMore={showMore}
      valueLabel="pieces"
      hidden={hidden}
      hrefFor={(card) => `/samples/${card._id}`}
      describeCard={(card) =>
        `${card.number} — ${card.customer?.name || card.lead?.company || 'internal trial'}`}
      renderCard={(card) => {
        /* A sample's promise is its required date, which is what §25 escalates against. */
        const due = followUpState(card.requiredDate);
        const days = daysInColumn(card);
        return (
          <>
            {/* A request made for a lead names the company: calling it a trial for nobody
                would be the card stating something untrue about a real buyer. */}
            <p className="truncate text-xs font-semibold text-steel-100">
              {card.customer?.name || card.lead?.company || 'Internal trial'}
            </p>
            <p className="truncate text-[11px] text-steel-400">
              {card.number} · {card.modelNumber || card.mould?.mouldCode || 'New development'}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-steel-300">
              <span>{formatNumber(card.quantity)} pcs</span>
              {card.colour && <span className="text-steel-400">{card.colour}</span>}
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              {/* An answered or cancelled request is not waiting on a date. */}
              {isSettled(SAMPLE_BOARD, card.status) ? (
                <span className="text-steel-500" />
              ) : due ? (
                <span className={TONE_TEXT[due.tone]}>{due.text}</span>
              ) : (
                <span className="text-warn-400">No date</span>
              )}
              {days !== null && days >= 3 && (
                <span className={days >= 10 ? 'text-warn-400' : 'text-steel-500'}>{days}d here</span>
              )}
            </div>

            <p className="mt-1 truncate text-[11px] text-steel-500">
              {card.assignedTo?.name || <span className="text-warn-400">Nobody on it</span>}
            </p>
          </>
        );
      }}
    />
  );
}
