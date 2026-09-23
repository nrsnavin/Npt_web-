/**
 * Google Maps, by link — no key, no embed, no third-party script.
 *
 * The Maps URLs API (`/maps/search/?api=1`, `/maps/dir/?api=1`) is Google's documented way to open
 * a place or a route from a link and needs no key. On a phone it opens the Maps app people already
 * navigate with; on a desk it opens a tab. An embedded map would need a billed key and would load
 * Google's script into every thread — see docs/QUERIES-CHAT-DESIGN.md §4 for why that is out.
 */

const point = ({ lat, lng }) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

/** The place itself, pinned. */
export const mapsUrl = (location) =>
  `https://www.google.com/maps/search/?api=1&query=${point(location)}`;

/** A route to it from wherever the reader is — what the next visitor to a buyer's gate wants. */
export const directionsUrl = (location) =>
  `https://www.google.com/maps/dir/?api=1&destination=${point(location)}`;

/** "near Tiruppur, Tamil Nadu" — or the coordinates, when nothing bundled is close. */
export const placeLabel = (location = {}) => {
  const place = location.place;
  if (place?.name) return `near ${place.name}${place.state ? `, ${place.state}` : ''}`;
  if (location.lat == null) return '';
  return `${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`;
};

/** The phone's own radius, said the way somebody would — "±12 m", "±1.4 km". */
export const accuracyLabel = (metres) => {
  if (metres == null) return '';
  return metres < 1000 ? `±${Math.round(metres)} m` : `±${(metres / 1000).toFixed(1)} km`;
};

/** The server's own ceiling — past this it is a cell-tower guess, not a place. */
export const WORST_ACCURACY_M = 5000;
