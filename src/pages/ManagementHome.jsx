import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  enquiries as enquiriesApi,
  leads as leadsApi,
  pricings as pricingsApi,
  queries as queriesApi,
  quotations as quotationsApi,
  samples as samplesApi,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, ErrorState, Modal, Notice, PageHeader, Spinner } from '../components/ui.jsx';
import PricingDecision from '../components/PricingDecision.jsx';
import NeedsYouToday from '../components/NeedsYouToday.jsx';
import WhatMattersNow from '../components/WhatMattersNow.jsx';
import { formatCompactCurrency, formatDate, formatNumber } from '../utils/format.js';

/**
 * What management opens the app to find out [BLUEPRINT §21–24].
 *
 * A managing director does not open a CRM to be told they have three to-dos. They open it to
 * find out whether the business is all right this morning, and what will not move without them.
 * So this screen answers one question — **is it all right, and what needs me?** — in that order:
 *
 *   1. What cannot move without a signature. §9 floor approvals are the only action in this
 *      application that nobody else can take, so they come first and are decided *in place*.
 *   2. Four numbers about the business, not about the reader. Every one clicks through to
 *      exactly those rows.
 *   3. What is stuck, and whose it is.
 *   4. The funnel, stage by stage.
 *
 * **Every figure is a link.** A dashboard number that cannot be opened is a number somebody has
 * to go and look up, which means they stop trusting the dashboard and go to the register
 * instead. The tiles carry their filter with them, so "6 out with buyers" lands on the six.
 *
 * Composed from the screens' own endpoints rather than a management-only aggregate, so each one
 * already scopes and redacts for the reader [§8, §29] and a figure here can never disagree with
 * the screen it links to.
 *
 * **This screen used to run to the far end of the plant** — money overdue, lines past their
 * date, consignments to chase — and those four numbers were the first three quarters of it.
 * Sales orders, production, quality, despatch and payments are no longer part of this
 * application, so the question it answers is now a narrower one: the business up to the point a
 * buyer says yes. It is a smaller screen, honestly, rather than the same screen with holes in.
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
 * label reading "Waiting on a signature" is ambiguous — it could equally mean nothing is waiting
 * or nothing has loaded. "Nothing is held up on you" cannot be misread.
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
 * The bar is against the largest stage rather than against the total, because the useful read is
 * "where does the work pile up" and a share-of-total bar makes every stage look small once there
 * are eight of them.
 */
function FunnelRow({ label, count, value, widest, to }) {
  /* A stage with nothing in it draws no bar at all. The minimum width is there so that one
     enquiry behind a hundred is still visible, not so that zero looks like something. */
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

/* The stages worth drawing, in the order the work moves through them. */
const FUNNEL = [
  ['new', 'New'],
  ['requirement_clarification', 'Clarifying'],
  ['sample_required', 'Sample needed'],
  ['pricing_required', 'Pricing'],
  ['quote_submitted', 'Quoted'],
  ['negotiation', 'Negotiating'],
  ['customer_decision_pending', 'With the buyer'],
];

const EMPTY = {
  approvals: [],
  funnel: {},
  sent: 0,
  won: { count: 0, value: 0 },
  openQueries: 0,
  openLeads: 0,
  openSamples: 0,
};

export default function ManagementHome() {
  const { user, canRead, canWrite } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deciding, setDeciding] = useState(null);

  const seesPricing = canRead('pricing');
  const seesQueries = canRead('queries');
  const mayDecide = canWrite('pricing');

  /**
   * One pass, in parallel, and every call is allowed to fail on its own.
   *
   * A manager whose grants do not cover pricing should still get the rest of the screen rather
   * than an error page — and a module that is down should cost its own panel, not the morning's
   * only view of the business.
   */
  const load = useCallback(async () => {
    setError(null);
    const safe = (promise, fallback) => promise.then((value) => value).catch(() => fallback);

    try {
      const [approvals, enquiries, sent, won, openQueries, openLeads, openSamples] =
        await Promise.all([
          seesPricing
            ? safe(pricingsApi.list({ awaitingApproval: 'true', limit: 10 }), { data: [] })
            : { data: [] },
          safe(enquiriesApi.list({ limit: 1 }), { stageCounts: {} }),
          safe(quotationsApi.list({ sent: 'true', limit: 1 }), { pagination: { total: 0 } }),
          safe(quotationsApi.list({ status: 'accepted', limit: 1 }), { pagination: { total: 0 } }),
          seesQueries
            ? safe(queriesApi.list({ status: 'open', limit: 1 }), { pagination: { total: 0 } })
            : { pagination: { total: 0 } },
          safe(leadsApi.list({ open: 'true', limit: 1 }), { pagination: { total: 0 } }),
          safe(samplesApi.list({ open: 'true', limit: 1 }), { pagination: { total: 0 } }),
        ]);

      setData({
        approvals: approvals?.data || [],
        funnel: enquiries?.stageCounts || {},
        sent: sent?.pagination?.total || 0,
        /* What has actually been won. `wonTotal` rides on the list reply beside the page — see
           the quotations controller; a count of accepted quotes is not a figure anybody quotes. */
        won: { count: won?.pagination?.total || 0, value: won?.wonTotal || 0 },
        openQueries: openQueries?.pagination?.total || 0,
        openLeads: openLeads?.pagination?.total || 0,
        openSamples: openSamples?.pagination?.total || 0,
      });
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [seesPricing, seesQueries]);

  useEffect(() => {
    load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (loading) return <Spinner label="Reading the business" />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  const { approvals, funnel, sent, won, openQueries, openLeads, openSamples } = data;

  /*
   * A stage is `{ leads, value }`, not a number.
   *
   * Read as a number this rendered an object into a `<p>`, which React refuses — and the whole
   * screen went to the error boundary. It only showed up when somebody opened it as an admin,
   * because a marketing reader's funnel came back empty and an empty object is falsy. Written
   * as accessors so there is one place that knows the shape.
   */
  const stageCount = (key) => funnel[key]?.leads ?? 0;
  const stageValue = (key) => funnel[key]?.value ?? 0;

  const widest = Math.max(1, ...FUNNEL.map(([key]) => stageCount(key)));
  const inFunnel = FUNNEL.reduce((sum, [key]) => sum + stageCount(key), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle="What is in the pipeline, and what will not move without you"
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

      {/* The business in four numbers, every one of them a door. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Won"
          value={won.value ? formatCompactCurrency(won.value) : won.count}
          hint={
            won.count
              ? `${won.count} ${won.count === 1 ? 'quotation the buyer has' : 'quotations buyers have'} accepted`
              : 'Nothing accepted yet'
          }
          tone={won.count ? 'good' : 'neutral'}
          to="/quotations?status=accepted"
        />
        <Figure
          label="Out with buyers"
          value={sent}
          hint={sent ? 'Quoted and waiting on an answer' : 'Nothing is out with a buyer'}
          tone={sent ? 'neutral' : 'warn'}
          to="/quotations/sent"
        />
        <Figure
          label="In the funnel"
          value={inFunnel}
          hint={inFunnel ? 'Enquiries still being worked' : 'The funnel is empty'}
          tone={inFunnel ? 'neutral' : 'warn'}
          to="/enquiries"
        />
        {seesQueries && (
          <Figure
            label="Unanswered questions"
            value={openQueries}
            hint={
              openQueries
                ? 'Nobody has replied to these yet'
                : 'Every question has been answered'
            }
            tone={openQueries ? 'warn' : 'good'}
            to="/queries?status=open"
          />
        )}
      </div>

      {/* What needs somebody today, and what the plant's own alarms have raised [§25, §35]. */}
      <NeedsYouToday />
      <WhatMattersNow />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="The funnel" subtitle="Where the work is piling up">
          {inFunnel === 0 ? (
            <p className="py-5 text-center text-sm text-steel-400">
              No enquiry is open. Everything has been quoted, won or closed.
            </p>
          ) : (
            <div className="space-y-3">
              {FUNNEL.map(([key, label]) => (
                <FunnelRow
                  key={key}
                  label={label}
                  count={stageCount(key)}
                  value={stageValue(key)}
                  widest={widest}
                  to={`/enquiries?status=${key}`}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="The two registers behind it" subtitle="What marketing and the bench hold">
          <div className="space-y-3">
            <FunnelRow label="Leads still being worked" count={openLeads} widest={Math.max(1, openLeads, openSamples)} to="/leads" />
            <FunnelRow label="Samples on the bench" count={openSamples} widest={Math.max(1, openLeads, openSamples)} to="/samples" />
          </div>
          {openLeads === 0 && openSamples === 0 && (
            <Notice tone="warn">
              Nothing is being worked in either register. That is worth a look rather than a
              celebration — it usually means nobody is filling the top of the funnel.
            </Notice>
          )}
        </Panel>
      </div>

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
