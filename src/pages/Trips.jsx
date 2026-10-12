import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tripsApi } from '../api/endpoints.js';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { TripsLane } from '../components/TripPlanner.jsx';

/** Every trip in a span of days — the week around today unless another is picked. */
const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));

export default function Trips() {
  const [from, setFrom] = useState(indiaDay(-7));
  const [to, setTo] = useState(indiaDay(7));
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => tripsApi.list({ from, to }).then((rows) => { setTrips(rows); setError(null); }).catch(setError), [from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trips"
        subtitle="Every trip made from Plan trips — planned, on the road, completed and cancelled."
        actions={<Link to="/dispatch/plan" className="btn-primary">Plan trips</Link>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-steel-300">From <input type="date" className="input mt-1 w-auto" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="text-sm text-steel-300">To <input type="date" className="input mt-1 w-auto" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!trips && !error && <Spinner label="Loading trips" />}
      {trips && !trips.length && <EmptyState title="No trips in these days" description="Make one from a group on Plan trips." />}
      {trips?.length > 0 && <TripsLane trips={trips} today={indiaDay()} title={`${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`} />}
    </div>
  );
}
