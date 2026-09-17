import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  dispatches as dispatchesApi,
  enquiries as enquiriesApi,
  payments as paymentsApi,
  pricings as pricingsApi,
  production as productionApi,
  quotations as quotationsApi,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import PricingDecision from '../components/PricingDecision.jsx';
import UrgentOrder from '../components/UrgentOrder.jsx';
import EscalationFeed from '../components/EscalationFeed.jsx';
import EscalatedTasks from '../components/EscalatedTasks.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';

/**
 * What management opens the app to find out [BLUEPRINT §21–24].
 *
 * Management was the last department still falling through to *My day*, and My day is — in its
 * own file's words — a marketing screen wearing a neutral name. Its four tiles count overdue
 * tasks, tasks due today, tasks due tomorrow and open tasks. Those are facts about one person's
 * to-do list. A managing director does not open a CRM to be told they have three to-dos; they
 * open it to find out whether the plant is all right this morning, and what will not move
 * without them.
 *
 * So this screen answers one question — **is the plant OK, and what needs me?** — in that order
 * of priority:
 *
 *   1. What cannot move without a signature. §9 floor approvals are the only action in this
 *      application that nobody else can take, so they come first and are decided *in place*.
 *   2. Four numbers about the plant, not about the reader. Money overdue, lines past their date,
 *      consignments to chase, prices waiting. Every one clicks through to exactly those rows.
 *   3. What is stuck, and whose it is — with the department that can clear it named.
 *   4. The money and the funnel, side by side.
 *
 * **Every figure is a link.** That is the whole of the interaction design: a dashboard number
 * that cannot be opened is a number somebody has to go and look up, which means they stop
 * trusting the dashboard and go straight to the register. The tiles carry a filter with them,
 * so clicking "3 past their date" lands on the three, not on all four hundred.
 *
 * Composed from the screens' own endpoints rather than a new management-only aggregate. That is
 * deliberate: each of those already scopes and redacts for the reader [§8, §29], so a manager
 * who is not an admin sees exactly what their grants allow, and a figure here can never disagree
 * with the screen it links to. A bespoke endpoint would be a second implementation of "late".
 */

/* ------------------------------------ pieces ------------------------------------ */

const TONES = {
  bad: { value: 'text-danger-400', ring: 'hover:ring-danger-500/40' },
  warn: { value: 'text-warn-400', ring: 'hover:ring-warn-500/40' },
  good: { value: 'text-success-400', ring: 'hover:ring-success-500/30' },
  neutral: { value: 'text-steel-50', ring: 'hover:ring-accent/30' },
};

/**
 * One headline number, and the sentence that says what it means.
 *
 * The sentence changes with the value rather than being a static caption, because "0" under a
 * label reading "Past their date" is ambiguous — it could equally mean nothing is late or
 * nothing is loaded. "Nothing is late" cannot be misread.
 */
function Figure({ label, value, hint, tone = 'neutral', to }) {
  const t = TONES[tone] || TONES.neutral;

  return (
    <Link
      to={to}
      className={`group block rounded-xl ring-1 ring-transparent transition-all ${t.ring}`}
    >
      <div className="card-interactive h-full px-4 py-4">
        <p className="eyebrow">{label}</p>
        <p className={`stat-value mt-2 ${t.value}`}>{value}</p>
        <p className="mt-1.5 text-xs leading-snug text-steel-400">{hint}</p>
        <p className="mt-2 text-xs font-semibold text-steel-600 transition-colors group-hover:text-accent">
          Open →
        </p>
      </div>
    </Link>
  );
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-bold tracking-tight text-steel-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-steel-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A row of the funnel, drawn as a proportional bar.
 *
 * The bar is against the largest stage rather than against the total, because the useful read
 * is "where does the work pile up" and a share-of-total bar makes every stage look small once
 * there are eight of them.
 */
function FunnelRow({ label, count, value, widest, to }) {
  /* A stage with nothing in it draws no bar at all. The minimum width is there so that one
     order behind a hundred is still visible, not so that zero looks like something. */
  const width = count && widest ? Math.max(4, Math.round((count / widest) * 100)) : 0;

  return (
    <Link to={to} className="group block">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-steel-200 group-hover:text-accent">{label}</p>
        <p className="shrink-0 text-xs tabular-nums text-steel-300">
          {count}
          {value ? <span className="ml-1.5 text-steel-500">{formatCompactCurrency(value)}</span> : null}
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/[0.07]">
        <div
          className="h-full rounded-full bg-accent/70 transition-all group-hover:bg-accent"
          style={{ width: `${width}%` }}
        />
      </div>
    </Link>
  );
}

/* ------------------------------------ screen ------------------------------------ */

/** Everything this screen reads, fetched together so one slow call cannot half-render it. */
const EMPTY = { approvals: [], money: null, plant: null, yard: null, funnel: {}, sent: 0 };

export default function ManagementHome() {
  const { user, canRead, canWrite } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deciding, setDeciding] = useState(null);

  const seesMoney = canRead('payments');
  const seesPlant = canRead('production');
  const seesYard = canRead('dispatch');
  const seesPricing = canRead('pricing');
  const mayDecide = canWrite('pricing');

  /**
   * One pass, in parallel, and every call is allowed to fail on its own.
   *
   * A manager whose grants do not cover payments should still get the rest of the screen rather
   * than an error page — and a module that is down should cost its own panel, not the morning's
   * only view of the plant.
   */
  const load = useCallback(async () => {
    setError(null);
    const safe = (promise, fallback) => promise.then((value) => value).catch(() => fallback);

    try {
      const [approvals, money, plant, yard, enquiries, sent] = await Promise.all([
        seesPricing
          ? safe(pricingsApi.list({ awaitingApproval: 'true', limit: 10 }), { data: [] })
          : { data: [] },
        seesMoney ? safe(paymentsApi.day(), null) : null,
        seesPlant ? safe(productionApi.day(), null) : null,
        seesYard ? safe(dispatchesApi.day(), null) : null,
        safe(enquiriesApi.list({ limit: 1 }), { stageCounts: {} }),
        safe(quotationsApi.list({ sent: 'true', limit: 1 }), { pagination: { total: 0 } }),
      ]);

      setData({
        approvals: approvals?.data || [],
        money,
        plant,
        yard,
        funnel: enquiries?.stageCounts || {},
        sent: sent?.pagination?.total || 0,
      });
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [seesMoney, seesPlant, seesYard, seesPricing]);

  useEffect(() => {
    load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (loading) return <Spinner label="Reading the plant" />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  const { approvals, money, plant, yard, funnel, sent } = data;
  const moneyMeta = money?.meta || {};
  const plantMeta = plant?.meta || {};
  const yardMeta = yard?.meta || {};

  /*
   * The escalated orders from both ends, de-duplicated. The plant and the yard each carry the
   * same order when it is urgent, and management reading it twice under two headings would
   * suggest two problems where there is one.
   */
  const stuck = [];
  const seen = new Set();
  for (const row of [...(plant?.data?.urgent || []), ...(yard?.data?.urgent || [])]) {
    if (seen.has(String(row._id))) continue;
    seen.add(String(row._id));
    stuck.push(row);
  }

  const funnelRows = Object.entries(funnel)
    .filter(([, row]) => row.leads > 0)
    .map(([key, row]) => ({ key, label: humanise(key), count: row.leads, value: row.value }))
    .sort((a, b) => b.count - a.count);
  const widest = funnelRows[0]?.count || 0;

  const nothingNeedsYou = !approvals.length && !stuck.length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="The whole plant, and what will not move without you"
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={load}>
              Refresh
            </button>
            <Link to="/dashboard/marketing" className="btn-ghost">
              Sales analytics
            </Link>
          </div>
        }
      />

      {/*
        First, and above the numbers. A costing under the floor cannot be quoted by anybody until
        management signs it, so it is the one queue on this screen where the reader is the
        bottleneck — and it is decided here rather than three clicks away on the costing register.
      */}
      {seesPricing && (
        <Panel
          title="Waiting on your signature"
          subtitle={
            approvals.length
              ? 'A price under the floor cannot be quoted until you settle it [§9]'
              : 'Nothing is held up on you'
          }
          action={
            approvals.length ? (
              <Badge tone="accent">{approvals.length}</Badge>
            ) : (
              <span className="text-xs font-semibold text-success-400">Clear</span>
            )
          }
        >
          {approvals.length === 0 ? (
            <p className="py-5 text-center text-sm text-steel-400">
              No costing is waiting on a decision. Marketing can quote everything that has been
              priced.
            </p>
          ) : (
            <ul className="space-y-2">
              {approvals.map((row) => (
                <li
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn-500/25 bg-warn-500/[0.04] px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/pricings/${row._id}`}
                      className="text-sm font-semibold text-steel-100 hover:text-accent"
                    >
                      {row.number}
                    </Link>
                    <p className="text-xs text-steel-400">
                      {row.customer?.name || 'No customer'}
                      {row.modelNumber ? ` · ${row.modelNumber}` : ''}
                      {row.quantity ? ` · ${formatNumber(row.quantity)} pcs` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {/* The figure the decision is about, so the row is readable without opening
                        anything. §8 lets management see it. */}
                    <span className="text-sm font-bold tabular-nums text-warn-400">
                      ₹{Number(row.approvedSellingPrice ?? 0).toFixed(2)}
                    </span>
                    {mayDecide && (
                      <button
                        type="button"
                        className="btn-primary px-3 py-1 text-xs"
                        onClick={() => setDeciding(row)}
                      >
                        Decide
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* The plant in four numbers, every one of them a door. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {seesMoney && (
          <Figure
            label="Overdue money"
            value={formatCompactCurrency(moneyMeta.overdueValue || 0)}
            hint={
              moneyMeta.overdue
                ? `${moneyMeta.overdue} ${moneyMeta.overdue === 1 ? 'invoice is' : 'invoices are'} past their day`
                : 'Nothing is past its day'
            }
            tone={moneyMeta.overdue ? 'bad' : 'good'}
            to="/payments?overdue=true"
          />
        )}
        {seesPlant && (
          <Figure
            label="Late in production"
            value={plantMeta.late || 0}
            hint={
              plantMeta.late
                ? 'Lines that have already broken a promise'
                : plantMeta.atRisk
                  ? `Nothing late, but ${plantMeta.atRisk} will miss`
                  : 'Nothing is late'
            }
            tone={plantMeta.late ? 'bad' : plantMeta.atRisk ? 'warn' : 'good'}
            to="/production"
          />
        )}
        {seesYard && (
          <Figure
            label="Consignments to chase"
            value={yardMeta.chase || 0}
            hint={
              yardMeta.chase
                ? 'Past the day a buyer was promised'
                : yardMeta.load
                  ? `${yardMeta.load} ready to load`
                  : 'Nothing is behind'
            }
            tone={yardMeta.chase ? 'bad' : 'good'}
            to="/dispatches"
          />
        )}
        {seesPricing && (
          <Figure
            label="Prices with buyers"
            value={sent}
            hint={sent ? 'Quotations sent and not yet answered' : 'Nothing is out with a buyer'}
            tone="neutral"
            to="/quotations/sent"
          />
        )}
      </div>

      {/* Stopped orders. Draws nothing when nothing is stopped, so a calm morning stays calm. */}
      <EscalatedTasks />
      {canRead('orders') && <EscalationFeed />}

      {/*
        What is stuck and whose it is. The card is the same one the plant and the yard read, so
        the three screens cannot describe one order three ways — `mine` only changes whose angle
        the sentence is written from, and management's angle is nobody's: it names the department.
      */}
      {stuck.length > 0 && (
        <div className="mt-4">
          <Panel
            title="Escalated and not moving"
            subtitle="What is holding each one, and who can clear it"
            action={<Badge tone="danger">{stuck.length}</Badge>}
          >
            {/* UrgentOrder renders an <li>, so the wrapper has to be a list or the browser
                draws a stray marker beside each card. */}
            <ul className="space-y-3">
              {stuck.map((row) => (
                <UrgentOrder key={row._id} row={row} mine="management" onAnswered={load} />
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Money, aged. The buckets are the conversation accounts actually has. */}
        {seesMoney && (
          <Panel
            title="What is owed"
            subtitle={`${formatCompactCurrency(moneyMeta.outstanding || 0)} outstanding across ${moneyMeta.open || 0} ${moneyMeta.open === 1 ? 'invoice' : 'invoices'}`}
            action={
              <Link to="/payments" className="row-action text-xs">
                All receivables
              </Link>
            }
          >
            {(moneyMeta.ageing || []).some((bucket) => bucket.count > 0) ? (
              <ul className="space-y-2.5">
                {(moneyMeta.ageing || []).map((bucket) => (
                  <li key={bucket.key}>
                    <FunnelRow
                      label={bucket.label}
                      count={bucket.count}
                      value={bucket.value}
                      widest={Math.max(...(moneyMeta.ageing || []).map((b) => b.count), 1)}
                      to={`/payments?ageing=${bucket.key}`}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-steel-400">
                Nothing outstanding. Every invoice raised has been settled.
              </p>
            )}

            {moneyMeta.broken > 0 && (
              <div className="mt-4">
                <Notice tone="warn">
                  {moneyMeta.broken === 1
                    ? 'One buyer has broken a payment promise.'
                    : `${moneyMeta.broken} buyers have broken a payment promise.`}{' '}
                  A promise that was missed is the one worth ringing about.
                </Notice>
              </div>
            )}
          </Panel>
        )}

        {/* The funnel, by where the work has piled up rather than by pipeline order. */}
        <Panel
          title="Where the work is"
          subtitle="Open enquiries by stage, biggest first"
          action={
            <Link to="/enquiries" className="row-action text-xs">
              All enquiries
            </Link>
          }
        >
          {funnelRows.length ? (
            <ul className="space-y-3">
              {funnelRows.map((row) => (
                <li key={row.key}>
                  <FunnelRow
                    label={row.label}
                    count={row.count}
                    value={row.value}
                    widest={widest}
                    to={`/enquiries?status=${row.key}`}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-steel-400">
              No open enquiries. Everything raised has been settled one way or the other.
            </p>
          )}
        </Panel>
      </div>

      {/* Said only when it is true, and said plainly. A screen that reassures has to be a screen
          that would have told you otherwise. */}
      {nothingNeedsYou && (
        <div className="mt-4">
          <Notice tone="success">
            Nothing is waiting on you and nothing is escalated. The numbers above are the plant
            running itself — open any of them to look closer.
          </Notice>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-steel-600">
        Read {formatDate(new Date())} · every figure links to the rows behind it
      </p>

      <Modal
        open={Boolean(deciding)}
        title={`Approve ${deciding?.number || ''}?`}
        description="This price is below the approved minimum, so nothing can be quoted until it is settled"
        onClose={() => setDeciding(null)}
      >
        {deciding && (
          <PricingDecision
            pricing={deciding}
            onClose={() => setDeciding(null)}
            onSaved={load}
          />
        )}
      </Modal>
    </div>
  );
}
