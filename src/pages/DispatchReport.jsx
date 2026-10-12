import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatchPlanning } from '../api/endpoints.js';
import { EmptyState, ErrorState, Meter, PageHeader, Spinner } from '../components/ui.jsx';

/**
 * How dispatch went [server: trip.service `dispatchReport`]: the headline figures first, then
 * trips by day, how full each vehicle went, and the stops that were not delivered with why.
 * Numbers and tables rather than charts: each figure is one value, and the tables are short.
 */

const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));
const MODE = { own_vehicle: 'Our vehicle', transport: 'Transport booking', party_collects: 'Party collects', courier: 'Courier' };
const shortDay = (date) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function Figure({ label, value, note }) {
  return (
    <div className="rounded-xl border border-line/[0.08] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-steel-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-steel-50">{value}</p>
      {note && <p className="mt-0.5 text-xs text-steel-400">{note}</p>}
    </div>
  );
}

export default function DispatchReport() {
  const [from, setFrom] = useState(indiaDay(-29));
  const [to, setTo] = useState(indiaDay(7));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => dispatchPlanning.report({ from, to }).then((answer) => { setData(answer); setError(null); }).catch(setError), [from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dispatch report" subtitle="Trips, deliveries and how full the vehicles went." actions={<Link to="/dispatch/trips" className="btn-secondary">Trips</Link>} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-steel-300">From <input type="date" className="input mt-1 w-auto" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm text-steel-300">To <input type="date" className="input mt-1 w-auto" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <Spinner label="Adding it up" />}
      {data && !data.trips && <EmptyState title="No trips in these days" description="Trips made from Plan trips are counted here." />}
      {data?.trips > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Figure label="Trips" value={data.trips} note={data.cancelled ? `${data.cancelled} cancelled, not counted` : undefined} />
            <Figure label="Stops a trip" value={data.stopsPerTrip} note={`${data.stops} stops in all`} />
            <Figure label="Delivered" value={data.delivered} note={data.stillOut ? `${data.stillOut} still on the road` : undefined} />
            <Figure label="Not delivered" value={data.notDelivered} />
            <Figure
              label="Left on time"
              value={data.onTime.rate == null ? '—' : `${data.onTime.rate}%`}
              note={`${data.onTime.onTime} on time · ${data.onTime.late} late${data.onTime.undated ? ` · ${data.onTime.undated} with no date asked` : ''}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5" aria-label="Trips by day">
              <h2 className="mb-3 text-sm font-bold text-steel-100">By day</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-steel-400"><th className="pb-2 font-semibold">Day</th><th className="pb-2 text-right font-semibold">Trips</th><th className="pb-2 text-right font-semibold">Stops</th></tr></thead>
                <tbody className="divide-y divide-line/[0.06]">
                  {data.byDay.map((row) => (
                    <tr key={row.date}><td className="py-1.5 text-steel-200">{shortDay(row.date)}</td><td className="py-1.5 text-right tabular-nums text-steel-100">{row.trips}</td><td className="py-1.5 text-right tabular-nums text-steel-100">{row.stops}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-steel-400">{Object.entries(data.byMode).map(([mode, count]) => `${MODE[mode] || mode}: ${count}`).join(' · ')}</p>
            </section>

            <section className="card p-5" aria-label="Vehicles">
              <h2 className="mb-3 text-sm font-bold text-steel-100">Vehicles</h2>
              {data.vehicles.length ? (
                <ul className="space-y-3">
                  {data.vehicles.map((row) => (
                    <li key={row.vehicle}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold text-steel-100">{row.vehicle}{row.kind ? <span className="font-normal text-steel-400"> · {row.kind}</span> : null}</span>
                        <span className="tabular-nums text-steel-300">{row.trips} {row.trips === 1 ? 'trip' : 'trips'}{row.averageCartons != null ? ` · ${row.averageCartons} cartons a trip` : ''}</span>
                      </div>
                      {row.fill != null ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Meter percent={row.fill} label={`${row.vehicle} filled ${row.fill}%`} tone={row.fill > 100 ? 'danger' : 'accent'} className="flex-1" />
                          <span className="w-24 text-right text-xs tabular-nums text-steel-400">{row.fill}% full{row.fill > 100 ? ' — over' : ''}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-steel-500">Cartons not recorded, so how full it went is not known</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-steel-400">No trip on our own vehicles in these days.</p>}
            </section>
          </div>

          {data.missed.length > 0 && (
            <section className="card p-5" aria-label="Not delivered">
              <h2 className="mb-2 text-sm font-bold text-steel-100">Not delivered, and why</h2>
              <ul className="space-y-1 text-sm">
                {data.missed.map((row, index) => <li key={index} className="text-steel-300"><span className="font-semibold text-steel-100">{row.trip}</span> · {shortDay(row.date)} — {row.note || 'no reason given'}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
