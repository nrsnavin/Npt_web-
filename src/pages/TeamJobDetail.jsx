import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { files, workspace } from '../api/endpoints.js';
import { ErrorState, PageHeader, Section, Spinner } from '../components/ui.jsx';
import ModelJourney from '../components/ModelJourney.jsx';
import { NowPill } from './TeamJobs.jsx';
import { AddShipmentPaper } from '../components/Shipments.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * One team job, read the way an enquiry is [server: teamJobs.service `teamJob`], kept plain:
 *
 *   What you asked      the team, the buyer, the models, the words
 *   Where it is now     one line
 *   Steps               each team's task in order — its status, who has it, done or not
 *   What was done       every move and update across the job, newest first, in the team's words
 *
 * and only where the job has them: each model's journey, the payments with what Accounts said,
 * the shipments with their LR, and the files on its tasks.
 */

const when = (at) => new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const PAYMENT_STATE = { awaiting: 'Waiting for Accounts', confirmed: 'Confirmed by Accounts', not_in_bank: 'Not in bank', confirmed_late: 'Came after all — confirmed', logged_again: 'Logged again' };

async function openFile(key) {
  const url = URL.createObjectURL(await files.blob(key));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function TeamJobDetail() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => workspace.todos.teamJob(id).then((data) => { setJob(data); setError(null); }).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!job) return <Spinner label="Loading the job" />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={`${job.number || 'Job'} · ${job.customer?.name || 'No buyer'}`}
        subtitle={<><Link to="/team-jobs" className="hover:text-accent">Team jobs</Link> · given by {job.raisedBy || '—'} on {formatDate(job.raisedAt)}{job.edd ? ` · EDD ${formatDate(job.edd)}` : ''}</>}
      />

      {/* Where it is now, first — the question the job page answers. */}
      <div className={`rounded-xl border px-4 py-3 ${job.now.done ? 'border-success-500/40 bg-success-500/[0.06]' : 'border-warn-500/40 bg-warn-500/[0.06]'}`} role="status">
        <p className="text-xs font-bold uppercase tracking-wide text-steel-400">Where it is now</p>
        <p className={`text-lg font-bold ${job.now.done ? 'text-success-400' : 'text-warn-400'}`}>{job.now.words}</p>
      </div>

      <Section title="What you asked">
        <p className="text-sm text-steel-100"><span className="font-semibold">{job.asked.what}</span> · {job.asked.team}{job.asked.models.length ? ` · ${job.asked.models.join(', ')}` : ''}</p>
        {job.asked.note && <p className="mt-1 whitespace-pre-line text-sm text-steel-300">{job.asked.note}</p>}
      </Section>

      <Section title={`Steps (${job.steps.length})`}>
        <ol className="space-y-2" aria-label="Steps">
          {job.steps.map((step, index) => (
            <li key={step._id} className="flex gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.completed ? 'bg-success-500/20 text-success-400' : 'bg-warn-500/20 text-warn-400'}`}>{step.completed ? '✓' : index + 1}</span>
              <div className="min-w-0 flex-1 rounded-lg border border-line/[0.08] px-3 py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-steel-100">{step.team} — {step.what}</span>
                  <span className={`text-xs font-semibold ${step.completed ? 'text-success-400' : 'text-warn-400'}`}>{step.completed ? `Done ${step.completedAt ? formatDate(step.completedAt) : ''}` : step.statusLabel}</span>
                </p>
                <p className="text-xs text-steel-400">{step.completed ? step.statusLabel : step.with ? `With ${step.with}` : 'Not picked up yet'} · asked {formatDate(step.raisedAt)}</p>
                {step.modelStatuses?.length > 0 && <p className="text-xs text-steel-300">{step.modelStatuses.map((row) => `${row.model}: ${row.label}`).join(' · ')}</p>}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {job.journeys?.length > 0 && (
        <Section title="Each model">
          <ModelJourney journeys={job.journeys} />
        </Section>
      )}

      <Section title="What was done">
        <ol className="space-y-2" aria-label="What was done">
          {job.timeline.map((line, index) => (
            <li key={`${line.at}-${index}`} className="border-l-2 border-line/[0.12] pl-3">
              <p className="text-xs text-steel-500">{when(line.at)} · {line.team}{line.by ? ` · ${line.by}` : ''}</p>
              <p className="text-sm"><span className="font-semibold text-steel-100">{line.what}</span>{line.text && line.text !== line.what ? <span className="text-steel-300"> — {line.text}</span> : null}</p>
            </li>
          ))}
        </ol>
      </Section>

      {job.payments?.length > 0 && (
        <Section title="Payments">
          <ul className="divide-y divide-line/[0.06] text-sm">
            {job.payments.map((row) => (
              <li key={row._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <Link to={`/payments/${row.receivable._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.receivable.number}</Link>
                  <span className="text-steel-300"> · {formatCurrency(row.amount)}{row.mode ? ` · ${String(row.mode).toUpperCase()}` : ''}{row.reference ? ` · ${row.reference}` : ''}{row.by ? ` · logged by ${row.by}` : ''}</span>
                </span>
                <span className={`text-xs font-semibold ${row.state === 'not_in_bank' ? 'text-danger-400' : row.state === 'awaiting' ? 'text-warn-400' : 'text-success-400'}`}>
                  {PAYMENT_STATE[row.state] || row.state}{row.state === 'not_in_bank' && row.reason ? ` — ${row.reason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {job.shipments?.length > 0 && (
        <Section title={`Shipments (${job.shipments.length})`}>
          <ul className="divide-y divide-line/[0.06] text-sm">
            {job.shipments.map((row) => (
              <li key={row._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-steel-100">{formatDate(row.at)} · {row.lines.map((line) => `${line.model} ${Number(line.quantity || 0).toLocaleString('en-IN')} pcs`).join(' · ')}<span className="text-xs text-steel-400">{row.modeLabel ? ` · ${row.modeLabel}` : ''}{row.lrNumber ? ` · LR ${row.lrNumber}` : ''}</span></span>
                {row.paper
                  ? <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => openFile(row.paper.key)}>{row.needsLr ? 'View LR' : 'View proof'}</button>
                  : <span className="flex items-center gap-2"><span className="text-xs font-semibold text-warn-400">{row.needsLr ? 'LR awaited from Reception' : 'Proof to come'}</span><AddShipmentPaper load={row} onSaved={load} /></span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {job.documents?.length > 0 && (
        <Section title={`Documents (${job.documents.length})`}>
          <ul className="divide-y divide-line/[0.06] text-sm">
            {job.documents.map((file) => (
              <li key={file._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <button type="button" className="text-left font-semibold text-steel-100 hover:text-accent" onClick={() => openFile(file.key)}>{file.title}</button>
                <span className="text-xs text-steel-400">{file.team} · {formatDate(file.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
