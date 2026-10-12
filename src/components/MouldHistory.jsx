import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mouldRunsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, Meter, Notice, Section, Spinner } from './ui.jsx';
import MaintenanceForm from './MaintenanceForm.jsx';
import { MaintenanceTable, QcTable, RunsTable } from './RecordTables.jsx';
import { formatDate, formatNumber } from '../utils/format.js';

/**
 * A mould's life on its own page [server: records.service `mouldHistory`]: its shot count and how
 * far it is to the next maintenance, the runs it made, the maintenance done on it and the QC records
 * against it.
 */
export default function MouldHistory({ mould }) {
  const { canRead, canWrite } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(false);
  const load = useCallback(() => mouldRunsApi.mouldHistory(mould._id).then((next) => { setData(next); setError(null); }).catch(setError), [mould._id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner label="Loading the mould's history" />;
  const life = data.mould;
  const every = life.maintenanceEveryShots;
  const since = life.shotsSinceMaintenance ?? 0;
  const percent = every ? (since / every) * 100 : null;
  const mayRecord = canWrite('moulds') || canWrite('production');

  return (
    <div className="mt-5 space-y-5">
      <Section
        title="Shot life and maintenance"
        actions={mayRecord && <button type="button" className="btn-secondary" onClick={() => setRecording(true)}>Record maintenance</button>}
      >
        {life.maintenanceDue && <Notice tone="warn">Maintenance is due — {formatNumber(since)} shots since the last, against every {formatNumber(every)}.</Notice>}
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="eyebrow">Shots in its life</p><p className="stat-value mt-1">{formatNumber(life.totalShots || 0)}</p></div>
          <div><p className="eyebrow">Since last maintenance</p><p className="stat-value mt-1">{formatNumber(since)}</p>{life.lastMaintenanceAt && <p className="mt-0.5 text-xs text-steel-500">Last on {formatDate(life.lastMaintenanceAt)}</p>}</div>
          <div>
            <p className="eyebrow">Maintenance every</p>
            <p className="stat-value mt-1">{every ? `${formatNumber(every)}` : '—'}</p>
            {!every && <p className="mt-0.5 text-xs text-steel-500">Set it on Edit the mould for a reminder</p>}
          </div>
        </div>
        {percent != null && <Meter className="mt-4" percent={percent} tone={percent >= 100 ? 'danger' : percent >= 85 ? 'warn' : 'accent'} label={`${Math.round(percent)}% of the way to the next maintenance`} />}
      </Section>

      <Section title={`Runs (${data.runs.length})`} actions={canRead('production') && <Link to="/mould-runs" className="text-sm font-semibold text-accent">All runs</Link>}>
        <RunsTable rows={data.runs} showMachine empty="No runs recorded for this mould yet." />
      </Section>

      <Section title={`Maintenance history (${data.maintenance.length})`}>
        <MaintenanceTable rows={data.maintenance} empty="No maintenance recorded for this mould yet." />
      </Section>

      {canRead('quality') && (
        <Section title={`QC records (${data.qc.length})`} actions={canWrite('quality') && <Link to={`/qc-records/new?mould=${mould._id}`} className="text-sm font-semibold text-accent">New QC record</Link>}>
          <QcTable rows={data.qc} empty="No QC records against this mould yet." />
        </Section>
      )}

      <MaintenanceForm open={recording} asset="mould" mould={mould} onClose={() => setRecording(false)} onSaved={load} />
    </div>
  );
}
