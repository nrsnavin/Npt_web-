import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboard, invoices, leads, productionOrders, stock } from '../api/endpoints.js';
import { PageHeader, Spinner, Badge } from '../components/ui.jsx';
import { formatCompactCurrency, formatCurrency, formatNumber, humanise } from '../utils/format.js';

/** Pipeline stages warm up as they approach a win, so the funnel reads left to right. */
const STAGE_COLOURS = {
  new: '#3C5C6B',
  contacted: '#2C94A5',
  qualified: '#36B5C9',
  quoted: '#F5B14A',
  won: '#22C07A',
  lost: '#F0455B',
};

/** Shared Recharts styling for the dark canvas. */
const AXIS = { fontSize: 11, fill: '#78858D', fontWeight: 600 };

/** Funnel order, so the pipeline chart reads top to bottom as a lead actually progresses. */
const STAGE_ORDER = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'];
const byFunnelOrder = (rows = []) =>
  [...rows].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
const GRID_STROKE = 'rgba(255,255,255,0.05)';
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)',
  background: '#17262F',
  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  fontSize: 12,
  color: '#E9F0F4',
};
const TOOLTIP_CURSOR = { fill: 'rgba(255,255,255,0.04)' };

function StatCard({ label, value, sublabel, to, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-steel-50',
    success: 'text-success-400',
    warn: 'text-warn-400',
    danger: 'text-danger-400',
  };

  const content = (
    <div className={`h-full p-5 ${to ? 'card-interactive' : 'card'}`}>
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-3 ${tones[tone]}`}>{value}</p>
      {sublabel && <p className="mt-2 text-xs text-steel-400">{sublabel}</p>}
    </div>
  );

  return to ? (
    <Link to={to} className="block rounded-xl">
      {content}
    </Link>
  ) : (
    content
  );
}

/** Card wrapper for the chart and list panels, so every block shares one rhythm. */
function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-bold tracking-tight text-steel-50">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: dashboard.summary });
  const trend = useQuery({ queryKey: ['dashboard', 'trend'], queryFn: () => dashboard.salesTrend(6) });
  const top = useQuery({ queryKey: ['dashboard', 'top'], queryFn: () => dashboard.topProducts(5) });
  const pipeline = useQuery({ queryKey: ['leads', 'pipeline'], queryFn: leads.pipeline });
  const workload = useQuery({ queryKey: ['production', 'workload'], queryFn: productionOrders.workload });
  const reorder = useQuery({ queryKey: ['stock', 'reorder'], queryFn: stock.reorder });
  const ageing = useQuery({ queryKey: ['invoices', 'ageing'], queryFn: invoices.ageing });

  if (summary.isLoading) return <Spinner label="Loading dashboard" />;

  const stats = summary.data || {};
  const overdue = ageing.data
    ? Object.entries(ageing.data.buckets)
        .filter(([bucket]) => bucket !== 'current')
        .reduce((total, [, value]) => total + value, 0)
    : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Sales, production and stock at a glance"
        actions={
          <span className="hidden items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-steel-400 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
            Live
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales this month"
          value={formatCompactCurrency(stats.salesThisMonth)}
          sublabel={`${formatNumber(stats.ordersThisMonth)} ${
            stats.ordersThisMonth === 1 ? 'order' : 'orders'
          } booked`}
          to="/sales-orders"
        />
        <StatCard
          label="Receivables"
          value={formatCompactCurrency(stats.receivables)}
          sublabel={overdue > 0 ? `${formatCompactCurrency(overdue)} overdue` : 'Nothing overdue'}
          tone={overdue > 0 ? 'danger' : 'success'}
          to="/invoices"
        />
        <StatCard
          label="Open sales orders"
          value={formatNumber(stats.openSalesOrders)}
          sublabel={`${formatNumber(stats.activeProductionOrders)} production ${
            stats.activeProductionOrders === 1 ? 'order' : 'orders'
          } running`}
          to="/sales-orders"
        />
        <StatCard
          label="Stock value"
          value={formatCompactCurrency(stats.stockValue)}
          sublabel={`${formatNumber(reorder.data?.length || 0)} ${
            reorder.data?.length === 1 ? 'item' : 'items'
          } below reorder level`}
          tone={reorder.data?.length ? 'warn' : 'neutral'}
          to="/inventory"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-steel-50">Order value — last 6 months</h2>
          {trend.isLoading ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend.data || []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="barFlame" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF8124" />
                    <stop offset="100%" stopColor="#D95A00" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={formatCompactCurrency}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Booked']}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#A3B3BD', fontWeight: 700, marginBottom: 2 }}
                  cursor={TOOLTIP_CURSOR}
                />
                <Bar dataKey="value" fill="url(#barFlame)" radius={[5, 5, 0, 0]} maxBarSize={52} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-steel-50">Lead pipeline</h2>
          {pipeline.isLoading ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={byFunnelOrder(pipeline.data)}
                layout="vertical"
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tickFormatter={humanise}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'value' ? [formatCurrency(value), 'Value'] : [value, 'Leads']
                  }
                  labelFormatter={humanise}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#A3B3BD', fontWeight: 700, marginBottom: 2 }}
                  cursor={TOOLTIP_CURSOR}
                />
                <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={22}>
                  {byFunnelOrder(pipeline.data).map((entry) => (
                    <Cell key={entry.stage} fill={STAGE_COLOURS[entry.stage] || '#3C5C6B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Top selling hangers">
          {top.data?.length ? (
            <ol className="space-y-3.5">
              {top.data.map((row, index) => (
                <li key={row.product?._id || row.product?.sku} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-steel-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-steel-100">
                      {row.product?.name || 'Unknown product'}
                    </p>
                    <p className="mt-0.5 text-xs text-steel-500">
                      {row.product?.sku} · {formatNumber(row.quantity)} pcs
                    </p>
                  </div>
                  <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums text-steel-100">
                    {formatCompactCurrency(row.value)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-steel-400">No orders booked yet.</p>
          )}
        </Panel>

        <Panel title="Production workload">
          {workload.data?.length ? (
            <ul className="space-y-4">
              {workload.data.map((row) => {
                const percent = row.plannedUnits
                  ? Math.min(Math.round((row.producedUnits / row.plannedUnits) * 100), 100)
                  : 0;
                return (
                  <li key={row.status}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <Badge status={row.status} />
                      <span className="text-xs tabular-nums text-steel-400">
                        {row.orders} {row.orders === 1 ? 'order' : 'orders'} ·{' '}
                        {formatNumber(row.producedUnits)}/{formatNumber(row.plannedUnits)}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-flame-500 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-steel-400">Nothing on the shop floor.</p>
          )}
        </Panel>

        <Panel
          title="Reorder alerts"
          action={
            reorder.data?.length ? (
              <Badge tone="progress">{reorder.data.length} low</Badge>
            ) : null
          }
        >
          {reorder.data?.length ? (
            <ul className="space-y-3.5">
              {reorder.data.slice(0, 6).map((row) => (
                <li key={`${row.itemType}-${row.id}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-semibold text-steel-100">{row.name}</p>
                    <p className="mt-0.5 text-xs text-steel-500">{row.code}</p>
                  </div>
                  <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums text-warn-400">
                    {formatNumber(row.quantity)}
                    <span className="font-medium text-steel-500">
                      {' '}
                      / {formatNumber(row.reorderLevel)} {row.uom}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-steel-400">Every item is above its reorder level.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
