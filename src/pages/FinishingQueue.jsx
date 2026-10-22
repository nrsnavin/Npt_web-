import { useCallback, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import FinishingQueueList, { TEAM_WORDS } from '../components/FinishingQueueList.jsx';
import { PageHeader } from '../components/ui.jsx';
import { todayInIndia } from '../utils/taskForm.js';
import { finishingCsv } from '../utils/productionQueue.js';

/**
 * The Printing queue and the Assembly queue [server: finishingQueue.controller] — the production
 * queue's next legs, each on its own page: every open task of the team in the order the goods
 * are due, with where the goods are model by model. Worked on the task itself (statuses, the
 * hand-over date or EDD) and seen whole on the enquiry's Production workflow page.
 */
export default function FinishingQueue() {
  const { team } = useParams();
  const [rows, setRows] = useState([]);
  const onRows = useCallback((next) => setRows(next), []);
  const words = TEAM_WORDS[team];
  if (!words) return <Navigate to="/production/queue" replace />;

  /* The queue as a sheet, for the line's own board. */
  const download = () => {
    const blob = new Blob([finishingCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${team}-queue-${todayInIndia()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const other = team === 'printing' ? 'assembling' : 'printing';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={words.queue}
        subtitle={`In the order the goods are due — what is in hand to ${words.verb}, and what is still with ${words.from}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link to="/production/queue" className="btn-secondary">Production queue</Link>
            <Link to={`/production/queue/${other}`} className="btn-secondary">{TEAM_WORDS[other].queue}</Link>
            <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
            <button type="button" className="btn-secondary" onClick={download} disabled={!rows.length}>CSV</button>
          </div>
        }
      />
      <FinishingQueueList key={team} team={team} onRows={onRows} />
    </div>
  );
}
