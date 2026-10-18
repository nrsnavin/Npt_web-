import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, EmptyState, ErrorState, FormError, Notice, PageHeader, Section, Spinner, TableSkeleton } from '../components/ui.jsx';
import { formatDateTime, formatNumber } from '../utils/format.js';
import { RISK_TONE, dayText, suggestionHeadline } from '../utils/insights.js';

const TABS = [
  ['ask', 'Ask'],
  ['schedule', 'Suggested schedule'],
  ['risk', 'Maintenance risk'],
  ['whatsapp', 'WhatsApp readings'],
];

/** A question answered from the plant's own figures [server: productionCopilot.service]. */
function AskPanel() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const ask = async (text) => {
    const asked = (text ?? question).trim();
    if (asked.length < 3) return;
    setQuestion(asked);
    setBusy(true);
    setProblem(null);
    try {
      setAnswer(await productionApi.ask(asked));
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Ask the floor">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); ask(); }}>
        <input className="input min-w-[16rem] flex-1" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="Which orders will be late this week?" aria-label="Your question" />
        <button type="submit" className="btn-primary" disabled={busy || question.trim().length < 3}>{busy ? 'Reading the figures…' : 'Ask'}</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {['Which orders will be late?', 'Why is OEE low this week?', 'Which press is likely to break down?'].map((text) => (
          <button key={text} type="button" className="row-action text-xs" onClick={() => ask(text)}>{text}</button>
        ))}
      </div>
      {problem && <div className="mt-3"><FormError error={problem} /></div>}
      {answer && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-steel-100">{answer.answer}</p>
          {answer.points?.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-steel-300">
              {answer.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          )}
          <p className="text-xs text-steel-500">{answer.from === 'model' ? 'Written by the assistant from the plant’s figures — check before acting.' : 'Straight from the plant’s figures.'}</p>
        </div>
      )}
    </Section>
  );
}

/** A schedule to read and apply [server: scheduleSuggest.service]. */
function SchedulePanel({ mayPlan }) {
  const { toast, warn } = useToast();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const suggest = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setResult(await productionApi.suggestPlan());
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const done = await productionApi.applyPlan(result.moves);
      toast('Schedule applied', `${done.applied.length} work orders placed${done.skipped.length ? ` · ${done.skipped.length} left as they were` : ''}`);
      if (done.skipped.length) warn('Some were left alone', done.skipped.map((row) => row.why).join(' · '));
      setResult(null);
    } catch (failure) {
      warn('Not applied', failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      title="Suggested schedule"
      actions={<button type="button" className="btn-primary" disabled={busy} onClick={suggest}>{busy && !result ? 'Working it out…' : result ? 'Suggest again' : 'Suggest a schedule'}</button>}
    >
      <p className="text-sm text-steel-400">Places every open work order on a press that can hold its mould, most urgent first, using how long each mould really runs — so the fewest jobs end late. Nothing changes until you apply it.</p>
      {problem && <div className="mt-3"><FormError error={problem} /></div>}
      {result && (
        <div className="mt-4 space-y-4">
          <Notice tone={result.summary.lateAfter < result.summary.lateBefore ? 'success' : 'info'}>{suggestionHeadline(result.summary)}</Notice>
          {result.narrative && (
            <div className="rounded-lg border border-line/[0.08] p-3 text-sm">
              <p className="font-semibold text-steel-100">{result.narrative.headline}</p>
              <ul className="mt-1 list-disc pl-5 text-steel-300">{result.narrative.points.map((point) => <li key={point}>{point}</li>)}</ul>
            </div>
          )}
          {result.cannotPlace.length > 0 && (
            <Notice tone="warn">Left where they are: {result.cannotPlace.map((row) => `${row.number} — ${row.why}`).join(' · ')}</Notice>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {result.plan.map((press) => (
              <div key={press.machine._id} className="rounded-lg border border-line/[0.08] p-3">
                <p className="mb-2 font-semibold text-steel-100">{press.machine.code} <span className="font-normal text-steel-500">· {press.jobs.length} {press.jobs.length === 1 ? 'job' : 'jobs'}</span></p>
                {press.jobs.length === 0 && <p className="text-xs text-steel-500">Nothing on it.</p>}
                <ol className="space-y-2">
                  {press.jobs.map((job) => (
                    <li key={job._id} className="text-sm">
                      <span className="font-semibold text-steel-100">{job.number}</span>
                      <span className="text-steel-400"> · {job.mouldCode || '—'} · {job.colour || '—'} · {formatNumber(job.toMake)} pcs</span>
                      {job.from && <Badge tone="info">from {job.from}</Badge>}
                      {job.late && <Badge tone="danger">late</Badge>}
                      <span className="block text-xs text-steel-500">{dayText(job.start)} → {dayText(job.end)}{job.dueDay ? ` · due ${dayText(job.dueDay)}` : ''}{job.slip > 1 ? ` · ×${job.slip} on history` : ''}</span>
                      {job.why && <span className="block text-xs text-steel-400">{job.why}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {mayPlan && result.moves.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" disabled={busy} onClick={apply}>Apply this schedule</button>
              <span className="text-xs text-steel-500">A work order someone changed since this was worked out is left as it is.</span>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function RiskTable({ rows, label }) {
  if (!rows.length) return <p className="text-sm text-steel-500">Nothing on the register.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-2 text-left">{label}</th>
            <th className="px-3 py-2 text-right">Risk</th>
            <th className="px-3 py-2 text-left">Why</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/[0.04]">
          {rows.map((row) => (
            <tr key={row._id}>
              <td className="px-3 py-2 font-semibold text-steel-100">{row.code}</td>
              <td className="px-3 py-2 text-right"><Badge tone={RISK_TONE[row.level]}>{row.score}</Badge></td>
              <td className="px-3 py-2 text-steel-300">{row.reasons.length ? row.reasons.join(' · ') : 'Nothing to see'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Presses and moulds most likely to stop soon [server: productionRisk.service `maintenanceRisk`]. */
function RiskPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => productionApi.maintenanceRisk().then((value) => { setData(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <TableSkeleton rows={5} columns={3} />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Presses" actions={<Link to="/machines" className="row-action text-xs">Machines</Link>}><RiskTable rows={data.machines} label="Press" /></Section>
      <Section title="Moulds" actions={<Link to="/moulds" className="row-action text-xs">Moulds</Link>}><RiskTable rows={data.moulds} label="Mould" /></Section>
      <p className="text-xs text-steel-500 lg:col-span-2">Scored from breakdown repairs in 90 days, breakdown and mould-problem stops rising, services overdue, shots past the maintenance count and rejects creeping up. 60 and over is worth a look this week.</p>
    </div>
  );
}

const MESSAGE_TONE = { pending: 'warn', applied: 'success', cancelled: 'neutral', expired: 'neutral', failed: 'danger' };

/** Press readings sent over WhatsApp [server: floorMessage.service]. */
function WhatsappPanel() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => productionApi.floorMessages().then((value) => { setRows(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  return (
    <Section title="Readings sent over WhatsApp">
      <p className="mb-3 text-sm text-steel-400">Production texts the plant’s number from the press — <span className="font-mono text-steel-200">IM-2 23400 rej 40 flash</span> or <span className="font-mono text-steel-200">IM-2 down 30 heater</span> — and answers YES to log it on the running job (NO drops it).</p>
      {error && <ErrorState error={error} onRetry={load} />}
      {!rows && !error && <Spinner label="Loading" />}
      {rows && rows.length === 0 && <p className="text-sm text-steel-500">No readings yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line/[0.06] text-sm">
          {rows.map((row) => (
            <li key={row._id} className="flex flex-wrap items-baseline gap-2 py-2">
              <Badge tone={MESSAGE_TONE[row.status] || 'neutral'}>{row.status}</Badge>
              <span className="text-steel-100">{row.summary || row.body}</span>
              <span className="text-xs text-steel-500">{row.sender?.name || row.from} · {formatDateTime(row.createdAt)}{row.error ? ` · ${row.error}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Looking ahead [server: productionInsights, scheduleSuggest, productionRisk, floorMessage,
 * productionCopilot]: a question box answered from the plant's figures, a suggested schedule to
 * apply, the presses and moulds most likely to stop, and the floor's WhatsApp readings.
 */
export default function ProductionInsights() {
  const { canWrite } = useAuth();
  const [tab, setTab] = useState('ask');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Look-ahead"
        subtitle="What the plant’s own history says is coming — and what to do about it."
        actions={<Link to="/production/plan" className="btn-secondary">Planning board</Link>}
      />
      <div role="tablist" aria-label="Look-ahead" className="tab-track grid-flow-col overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className="tab py-1.5" onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === 'ask' && <AskPanel />}
      {tab === 'schedule' && <SchedulePanel mayPlan={canWrite('production')} />}
      {tab === 'risk' && <RiskPanel />}
      {tab === 'whatsapp' && <WhatsappPanel />}
    </div>
  );
}
