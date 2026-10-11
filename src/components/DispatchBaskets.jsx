import { Link } from 'react-router-dom';
import { formatDate } from '../utils/format.js';

/**
 * Planning the vehicle: the open dispatch requests in baskets of buyers at the same place
 * [server: handoff.service `dispatchBaskets`]. Same landmark first (the bus stop or mill a driver
 * asks for), then the same area, then the same PIN — and each basket names the others in its PIN,
 * near enough to add to the trip. Buyers with no address come last, to be filled in.
 */

const BY = {
  landmark: 'Same landmark',
  area: 'Same area',
  pincode: 'Same PIN',
  city: 'Same city',
  none: 'No address',
};

export default function DispatchBaskets({ baskets = [] }) {
  if (!baskets.length) {
    return <p className="text-sm text-steel-400">No dispatch requests open — nothing to plan a vehicle for.</p>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {baskets.map((basket) => (
        <section
          key={basket.key}
          aria-label={`Basket ${basket.label}`}
          className={`rounded-xl border p-4 ${basket.by === 'none' ? 'border-warn-500/40 bg-warn-500/[0.05]' : basket.stops.length > 1 ? 'border-accent/40 bg-accent/[0.05]' : 'border-line/[0.1]'}`}
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-steel-50">{basket.label}</h3>
            <span className="text-xs text-steel-400">
              {BY[basket.by]} · {basket.stops.length} {basket.stops.length === 1 ? 'stop' : 'stops'}
              {basket.stops.length > 1 && basket.by !== 'none' ? ' — one vehicle' : ''}
            </span>
          </header>
          <ul className="mt-2 space-y-2">
            {basket.stops.map((stop) => (
              <li key={stop.task} className="rounded-lg border border-line/[0.06] px-3 py-2 text-sm">
                <p className="font-semibold text-steel-100">
                  {stop.customer?.name || 'Unknown buyer'}
                  {stop.enquiry && (
                    <Link to={`/enquiries/${stop.enquiry._id}`} className="ml-2 text-xs font-normal text-accent hover:underline">{stop.enquiry.number}</Link>
                  )}
                </p>
                {stop.address && <p className="text-xs text-steel-300">{stop.address}</p>}
                <p className="text-xs text-steel-400">
                  {[stop.schedule, stop.booking, stop.quantity && `${Number(stop.quantity).toLocaleString('en-IN')} pcs`, stop.status, stop.due && `due ${formatDate(stop.due)}`, stop.with && `with ${stop.with}`]
                    .filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
          {basket.nearby?.length > 0 && (
            <p className="mt-2 text-xs text-steel-400">Nearby, same PIN: {basket.nearby.join(' · ')}</p>
          )}
          {basket.by === 'none' && (
            <p className="mt-2 text-xs text-warn-400">Add the address, area and landmark on these customers so they can be grouped.</p>
          )}
        </section>
      ))}
    </div>
  );
}
