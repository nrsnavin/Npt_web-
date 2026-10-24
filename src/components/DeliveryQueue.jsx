import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatchPlanning } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import DeliveryUrgencyDialog from './DeliveryUrgencyDialog.jsx';
import TaskPanel from './TaskPanel.jsx';
import { EmptyState, ErrorState, TableSkeleton } from './ui.jsx';
import { dueWords, urgencyTone } from '../utils/deliveryUrgency.js';

/**
 * The Dispatch desk's delivery queue [server: deliveryUrgency.service `deliveryQueue`]: every open
 * Dispatch request in the order it has to go — late first, then Top Most Urgent, then by cut-off
 * (Today Morning by noon, Today Evening and Today by 7 PM, Tomorrow by 7 PM tomorrow), and last the
 * A request nobody has given an urgency reads Today — the day it reached Dispatch — marked as the
 * default. Read in the order shown; nothing here holds a dispatch. Dispatch moves each request's
 * status from its row ("Update status", the task's own workflow); only Admin and the request's
 * marketing person set or change the urgency [server: row `maySetUrgency`].
 */

const REFRESH_MS = 60 * 1000;
const bandOf = (row) => (!row.delivery ? 'Today' : row.delivery.late ? 'Late' : row.delivery.label);

export default function DeliveryQueue() {
  const { isAdmin, departments = [], user } = useAuth();
  const me = String(user?.id || user?._id || '');
  /* Whoever works the Dispatch desk, Admin, or the person the request is with moves its status. */
  const mayWork = (task) => isAdmin || departments.includes(task.department) || String(task.user?._id || task.user || '') === me;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [setting, setSetting] = useState(null);
  const [opened, setOpened] = useState(null);

  const load = useCallback(() => dispatchPlanning.queue()
    .then((data) => { setRows(data || []); setError(null); })
    .catch((failure) => setError(failure)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <TableSkeleton rows={4} />;
  if (!rows.length) return <EmptyState title="Nothing waiting to go" description="Open Dispatch requests appear here in delivery order." />;

  /* Bands in the server's order: each heading once, where its first row falls. */
  const bands = [];
  for (const row of rows) {
    const name = bandOf(row);
    const last = bands.at(-1);
    if (last?.name === name) last.rows.push(row);
    else bands.push({ name, rows: [row] });
  }

  return (
    <div className="space-y-5">
      {bands.map((band) => (
        <section key={band.name} className="space-y-2">
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${band.name === 'Late' || band.name === 'Top Most Urgent' ? 'text-danger-400' : 'text-steel-400'}`}>
            {band.name} · {band.rows.length}
          </h3>
          <ol className="space-y-2">
            {band.rows.map((row) => {
              const about = [row.enquiry?.number || 'Team task', row.customer?.name, row.model].filter(Boolean).join(' · ');
              return (
                <li key={row.task._id} className={`card grid gap-3 p-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center ${row.delivery?.late ? 'border-danger-500/40' : ''}`}>
                  <div className="space-y-1">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyTone(row.delivery)}`}>{row.delivery?.label || 'Today'}{row.delivery?.default ? ' · default' : ''}</span>
                    <p className={`text-xs ${row.delivery?.late ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>{dueWords(row.delivery)}</p>
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-steel-50">
                      {row.enquiry ? <Link to={row.link} className="hover:text-accent">{row.enquiry.number}</Link> : 'Team task'}
                      {row.customer && <span className="font-normal text-steel-300"> · {row.customer.name}{row.customer.city ? `, ${row.customer.city}` : ''}</span>}
                    </p>
                    <p className="text-xs text-steel-400">
                      {[row.model, row.quantity && `${row.quantity} pcs`, row.task.statusLabel, row.task.with ? `with ${row.task.with.name}` : 'not picked up'].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-steel-500">
                      {!row.delivery || row.delivery.default
                        ? `Default: the day it reached Dispatch — waiting for ${row.owner?.name || 'the marketing person'} to confirm`
                        : `Set by ${row.delivery.by || 'marketing'}${row.delivery.note ? ` — “${row.delivery.note}”` : ''}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:flex-col">
                    {/* The request's own workflow, from the queue: Goods Ready, Dispatched, Task Closed. */}
                    <button type="button" className="btn-primary justify-center px-3 py-1.5 text-xs" onClick={() => setOpened(row.task)}>
                      {mayWork(row.task) ? 'Update status' : 'Open'}
                    </button>
                    {row.maySetUrgency && (
                      <button type="button" className="btn-secondary justify-center px-3 py-1.5 text-xs" onClick={() => setSetting({ row, about })}>
                        {!row.delivery || row.delivery.default ? 'Confirm urgency' : 'Change urgency'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {setting && (
        <DeliveryUrgencyDialog
          taskId={setting.row.task._id}
          current={setting.row.delivery?.urgency || 'today'}
          isDefault={!setting.row.delivery || Boolean(setting.row.delivery.default)}
          about={setting.about}
          onClose={() => setSetting(null)}
          onSaved={load}
        />
      )}
      {opened && (
        <TaskPanel
          task={opened}
          mayWork={mayWork(opened)}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); load(); }}
        />
      )}
    </div>
  );
}
