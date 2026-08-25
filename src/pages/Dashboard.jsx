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

const STAGE_COLOURS = {
  new: '#94a3b8',
  contacted: '#38bdf8',
  qualified: '#6366f1',
  quoted: '#8b5cf6',
  won: '#10b981',
  lost: '#f43f5e',
};

function StatCard({ label, value, sublabel, to, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  };

  const content = (
    <div className="card h-full p-5 transition-shadow hover:shadow-md">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-400">{sublabel}</p>}
    </div>
  );

  return to ? <Link to={to}>{content}</Link> : content;
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
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales this month"
          value={formatCompactCurrency(stats.salesThisMonth)}
          sublabel={`${formatNumber(stats.ordersThisMonth)} orders booked`}
          to="/sales-orders"
        />
        <StatCard
          label="Receivables"
          value={formatCompactCurrency(stats.receivables)}
          sublabel={overdue > 0 ? `${formatCompactCurrency(overdue)} overdue` : 'Nothing overdue'}
          tone={overdue > 0 ? 'rose' : 'emerald'}
          to="/invoices"
        />
        <StatCard
          label="Open sales orders"
          value={formatNumber(stats.openSalesOrders)}
          sublabel={`${formatNumber(stats.activeProductionOrders)} production orders running`}
          to="/sales-orders"
        />
        <StatCard
          label="Stock value"
          value={formatCompactCurrency(stats.stockValue)}
          sublabel={`${formatNumber(reorder.data?.length || 0)} items below reorder level`}
          tone={reorder.data?.length ? 'amber' : 'slate'}
          to="/inventory"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Order value — last 6 months</h2>
          {trend.isLoading ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend.data || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={formatCompactCurrency}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Bar dataKey="value" fill="#3182f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Lead pipeline</h2>
          {pipeline.isLoading ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipeline.data || []} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tickFormatter={humanise}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value, name) => (name === 'value' ? formatCurrency(value) : value)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {(pipeline.data || []).map((entry) => (
                    <Cell key={entry.stage} fill={STAGE_COLOURS[entry.stage] || '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Top selling hangers</h2>
          {top.data?.length ? (
            <ul className="space-y-3">
              {top.data.map((row) => (
                <li key={row.product?._id || row.product?.sku} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {row.product?.name || 'Unknown product'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {row.product?.sku} · {formatNumber(row.quantity)} pcs
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-700">
                    {formatCompactCurrency(row.value)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No orders booked yet.</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Production workload</h2>
          {workload.data?.length ? (
            <ul className="space-y-3">
              {workload.data.map((row) => (
                <li key={row.status} className="flex items-center justify-between gap-3">
                  <Badge status={row.status} />
                  <span className="text-sm text-slate-600">
                    {row.orders} orders · {formatNumber(row.producedUnits)}/{formatNumber(row.plannedUnits)} pcs
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nothing on the shop floor.</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Reorder alerts</h2>
          {reorder.data?.length ? (
            <ul className="space-y-3">
              {reorder.data.slice(0, 6).map((row) => (
                <li key={`${row.itemType}-${row.id}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{row.name}</p>
                    <p className="text-xs text-slate-400">{row.code}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-amber-600">
                    {formatNumber(row.quantity)} / {formatNumber(row.reorderLevel)} {row.uom}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Every item is above its reorder level.</p>
          )}
        </div>
      </div>
    </div>
  );
}
