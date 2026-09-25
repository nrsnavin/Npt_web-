import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from './ui.jsx';
import { DRAG_TYPE, LabelDot, droppedIds } from './QueryLabelling.jsx';
import { UNLABELLED, boardColumns, moveRequests } from '../utils/labelBoard.js';

function Card({ row, column }) {
  return (
    <Link
      to={`/queries/${row._id}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify([row._id]));
        event.dataTransfer.setData('application/x-npt-from', column);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={`block rounded-lg border bg-ink-850 p-3 shadow-raised transition hover:border-line/20 ${
        row.isUrgent ? 'border-danger-500/50' : 'border-line/[0.08]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`line-clamp-2 text-sm ${row.unread ? 'font-bold text-steel-50' : 'font-semibold text-steel-200'}`}>
          {row.subject}
        </p>
        {row.unread > 0 && (
          <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-flame-500 px-1.5 text-[0.7rem] font-bold text-white">
            {row.unread}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-xs text-steel-400">{row.customer?.name || 'No customer'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {row.isUrgent && <Badge tone="danger">Urgent</Badge>}
        <Badge status={row.status} />
        <span className="text-[0.7rem] text-steel-500">{row.number}</span>
      </div>
    </Link>
  );
}

function Column({ column, onMove }) {
  const [over, setOver] = useState(false);
  return (
    <section
      aria-label={column.title}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const ids = droppedIds(event);
        const from = event.dataTransfer.getData('application/x-npt-from') || UNLABELLED;
        if (ids.length) onMove(ids, from, column.key);
      }}
      className={`flex w-72 shrink-0 flex-col rounded-xl border p-2.5 transition-colors ${
        over ? 'border-flame-500/60 bg-flame-500/[0.06]' : 'border-line/[0.06] bg-line/[0.02]'
      }`}
    >
      <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
        {column.key === UNLABELLED ? (
          <span aria-hidden className="h-2 w-2 rounded-full border border-steel-500" />
        ) : (
          <LabelDot label={column.key} />
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-steel-100">{column.title}</h3>
        <span className="text-xs tabular-nums text-steel-500">{column.rows.length}</span>
      </header>
      <div className="flex min-h-[4rem] flex-col gap-2">
        {column.rows.map((row) => (
          <Card key={row._id} row={row} column={column.key} />
        ))}
        {!column.rows.length && (
          <p className="rounded-lg border border-dashed border-line/10 px-3 py-4 text-center text-xs text-steel-500">
            Drop a query here
          </p>
        )}
      </div>
    </section>
  );
}

export default function QueryLabelBoard({ rows, labels, onFile }) {
  /*
   * Columns seen this visit stay on the board. A label whose last query was dragged out has no
   * count any more and drops off the list — but a column that vanishes mid-drag is a board you
   * cannot drag back onto.
   */
  const [seen, setSeen] = useState([]);
  useEffect(() => {
    setSeen((current) => [...new Set([...current, ...labels.map((entry) => entry.label)])]);
  }, [labels]);
  const shown = [
    ...labels,
    ...seen.filter((label) => !labels.some((entry) => entry.label === label)).map((label) => ({ label, count: 0 })),
  ];
  const columns = boardColumns(rows, shown);

  const move = async (ids, from, to) => {
    for (const request of moveRequests(ids, from, to)) {
      await onFile(request);
    }
  };

  return (
    <div className="-mx-1 overflow-x-auto pb-3">
      <div className="flex items-start gap-3 px-1">
        {columns.map((column) => (
          <Column key={column.key} column={column} onMove={move} />
        ))}
      </div>
      {!labels.length && (
        <p className="mt-3 text-sm text-steel-500">
          No labels yet. Give a query a label from the list (its # button) and it gets a column here.
        </p>
      )}
    </div>
  );
}
