/**
 * Traded items on Production tasks [pages/TradedSupply.jsx; server: trading.service]: each
 * status in words with its pill, and the moves the Production team can make from it.
 */
export const TRADE_STATUS = {
  to_order: { words: 'To order', tone: 'warn' },
  ordered: { words: 'Ordered', tone: 'info' },
  part_received: { words: 'Part received', tone: 'info' },
  received: { words: 'Received', tone: 'success' },
  cancelled: { words: 'Cancelled', tone: 'neutral' },
};

/** The buttons on a line: the next step first (the primary one), then the rest. */
export function tradeActions(status) {
  if (status === 'to_order') return [{ move: 'cancelled', label: 'Cancel' }, { move: 'received', label: 'Received' }, { move: 'ordered', label: 'Mark ordered', primary: true }];
  if (status === 'ordered') return [{ move: 'cancelled', label: 'Cancel' }, { move: 'ordered', label: 'Change date' }, { move: 'received', label: 'Received', primary: true }];
  if (status === 'part_received') return [{ move: 'cancelled', label: 'Cancel' }, { move: 'received', label: 'Received more', primary: true }];
  return [];
}

/** Where a traded model goes once it is in: "Printing → Assembly", or "Dispatch". */
export const tradeRoute = (line) => [line?.route?.printing && 'Printing', line?.route?.assembly && 'Assembly'].filter(Boolean).join(' → ') || 'Dispatch';

/** Its due day said as what it is: the hand-over to Printing or Assembly, else when it is needed. */
export const tradeDueLabel = (line) => (line?.handsTo ? `to ${line.handsTo} by` : 'needed by');

/** What a full receipt does next, for the toast. */
export const receivedWords = (line) => (line?.handsTo
  ? `All in — handed to ${line.handsTo}; their task has it now.`
  : 'All in — ready for dispatch.');
