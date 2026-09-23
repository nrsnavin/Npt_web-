import { accuracyLabel, directionsUrl, mapsUrl, placeLabel } from '../utils/maps.js';

/**
 * A shared location, as it appears in a thread.
 *
 * **It says whose phone, never "verified".** A browser cannot prove where a device is; this is a
 * record of what the phone reported (docs/QUERIES-CHAT-DESIGN.md §6). So the card names the
 * place and the phone's own accuracy, and the links let anybody check it against the map rather
 * than take the card's word for it.
 *
 * Two links rather than one, because they are two different jobs: *Open in Google Maps* is "where
 * is this", and *Directions* is what the next person going to that gate actually wants.
 *
 * `onPin` is offered only to someone who may edit the buyer — see `customerSite.controller.js` —
 * and turns this one check-in into the buyer's site, so the next visitor gets the gate rather than
 * the town centre.
 */
export default function LocationCard({ location, from, onPin, pinned, pinning }) {
  if (!location || location.lat == null) return null;

  return (
    <div className="mt-2 rounded-lg border border-line/[0.1] bg-line/[0.03] p-3 text-left">
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flame-500/15 text-base"
          aria-hidden
        >
          📍
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-steel-100">
            {location.place?.name ? placeLabel(location) : 'Shared a location'}
          </p>
          <p className="text-xs text-steel-500">
            {[
              accuracyLabel(location.accuracyM),
              location.place?.distanceKm != null ? `${location.place.distanceKm} km from the town` : null,
              from ? `shared from ${from}’s phone` : null,
            ].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-0.5 font-mono text-[0.7rem] text-steel-600">
            {Number(location.lat).toFixed(5)}, {Number(location.lng).toFixed(5)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold">
        <a
          href={mapsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Open in Google Maps ↗
        </a>
        <a
          href={directionsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Directions ↗
        </a>
        {pinned ? (
          <span className="text-success-400">✓ The buyer’s site</span>
        ) : onPin ? (
          <button
            type="button"
            className="text-steel-400 hover:text-accent"
            onClick={onPin}
            disabled={pinning}
          >
            {pinning ? 'Pinning…' : 'Pin as the buyer’s site'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
