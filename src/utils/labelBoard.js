/** A column's key for "no label at all". Not a label anybody can type — it has a space and a dot. */
export const UNLABELLED = ' ·none';

/**
 * The queries as columns, one per label — the chip bar turned into a board.
 *
 * A query carrying two labels shows in both columns, because it is in both groups. Dragging a card
 * from one column to another *moves* that one label (takes the old, adds the new); dropping on
 * "No label" takes the old one off. The other labels the query carries stay where they are.
 */
export function boardColumns(rows = [], labels = []) {
  const columns = labels.map((entry) => ({ key: entry.label, title: entry.label, rows: [] }));
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const none = { key: UNLABELLED, title: 'No label', rows: [] };

  for (const row of rows) {
    const on = (row.labels || []).filter((label) => byKey.has(label));
    if (!on.length) none.rows.push(row);
    for (const label of on) byKey.get(label).rows.push(row);
  }
  return [none, ...columns];
}

/** What a drop from one column onto another asks the server for, in order. */
export function moveRequests(ids, from, to) {
  if (from === to) return [];
  const requests = [];
  if (from !== UNLABELLED) requests.push({ ids, remove: from });
  if (to !== UNLABELLED) requests.push({ ids, add: to });
  return requests;
}
