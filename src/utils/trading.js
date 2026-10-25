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
