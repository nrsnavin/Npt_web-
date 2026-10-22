import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import TaskPanel from './TaskPanel.jsx';
import { BAND_TONE } from './ProductionQueueList.jsx';
import { formatDate } from '../utils/format.js';
import { byEdd, dueWords, eddBandOf } from '../utils/productionQueue.js';

/**
 * The Printing, Assembly and Quality desks, read at a glance [server: deskSummary.service]: one
 * line per task in EDD order — the enquiry, the buyer, the EDD, and where it stands in 20 to 30
 * words (the model's line where it has written one, marked AI; the rules' until then). Each line
 * opens the enquiry's Production workflow page — every model, hand-over and work order — or the
 * task itself to move its status.
 */
export default function FinishingDeskList({ rows = [], onChanged }) {
  const { isAdmin, departments = [], user } = useAuth();
  const [opened, setOpened] = useState(null);
  const me = String(user?.id || user?._id || '');
  const mayWork = (task) => isAdmin || departments.includes(task.department) || String(task.user?._id || task.user || '') === me;
  const ordered = byEdd(rows);

  if (!ordered.length) {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="text-base font-semibold text-steel-200">Nothing open on this desk right now.</p>
        <p className="mt-1 text-sm text-steel-500">When Production hands goods over, or Quality is asked, the task appears here.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="space-y-2" aria-label="Department tasks">
        {ordered.map((row) => {
          const band = eddBandOf(row);
          const tone = BAND_TONE[band] || BAND_TONE.later;
          const edd = row.edd || row.enquiry?.edd?.date || null;
          return (
            <li key={row.task._id} className={`card border-l-4 ${tone.edge} p-3 sm:p-4`}>
              <div className="grid gap-3 md:grid-cols-[8.5rem_minmax(0,13rem)_minmax(0,1fr)_auto] md:items-center">
                <div className="flex items-center gap-2 md:block">
                  <p className={`text-base font-bold tabular-nums ${band === 'late' ? 'text-danger-400' : 'text-steel-50'}`}>{edd ? formatDate(edd) : 'No EDD'}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>{edd ? dueWords(edd) : 'not given yet'}</span>
                </div>
                <div className="min-w-0">
                  {row.enquiry ? (
                    <Link to={`/enquiries/${row.enquiry._id}`} className="font-bold text-steel-50 hover:text-accent">{row.enquiry.number}</Link>
                  ) : (
                    <p className="font-bold text-steel-50">Team task</p>
                  )}
                  <p className="truncate text-sm text-steel-300">{row.enquiry?.customer?.name || row.task.customer?.name || '—'}</p>
                  {/* What the task is about [server: deskSummary.service `modelsOfBrief`]: each model with its pieces and complaint, and the complaint received. */}
                  {row.models?.length > 0 && (
                    <p className="text-xs text-steel-200" aria-label="Models">
                      {row.models.map((entry, at) => (
                        <span key={entry.model}>
                          {at > 0 && ' · '}
                          <span className="font-semibold">{entry.model}</span>
                          {entry.quantity ? ` ${entry.quantity.toLocaleString('en-IN')} pcs` : ''}
                          {entry.complaint ? <span className="text-danger-400"> — {entry.complaint}</span> : null}
                        </span>
                      ))}
                    </p>
                  )}
                  {row.complaint && <p className="text-xs font-semibold text-danger-400">Complaint: {row.complaint}</p>}
                </div>
                <p className="text-sm leading-snug text-steel-200">
                  {row.summary || row.task.title}
                  {row.summaryBy === 'model' && <span className="ml-1.5 rounded bg-accent/15 px-1 py-px align-middle text-xs font-semibold text-accent" title="Written by AI from the task's own records">AI</span>}
                </p>
                <div className="flex gap-2 print:hidden">
                  <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => setOpened(row.task)}>
                    {mayWork(row.task) && !row.task.completed ? 'Update' : 'Open'}
                  </button>
                  {row.workflow && <Link to={row.workflow} className="btn-primary px-3 py-2 text-sm">Workflow →</Link>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {opened && (
        <TaskPanel
          task={opened}
          mayWork={mayWork(opened)}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); onChanged?.(); }}
        />
      )}
    </>
  );
}
