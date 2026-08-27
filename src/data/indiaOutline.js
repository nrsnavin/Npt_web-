/**
 * A coarse outline of India, as `[longitude, latitude]` pairs.
 *
 * Deliberately hand-cut and low-resolution — about eighty points where a real boundary file has
 * tens of thousands. Three reasons, and none of them is laziness.
 *
 * **It is a backdrop, not a document.** The map exists so a cluster of dots reads as "the
 * garment belt" rather than "some dots". At the size this is drawn — a card on a page of
 * charts — the coastline of Konkan is four pixels of noise, and a district-accurate border
 * would render as the same shape while costing a megabyte.
 *
 * **No tiles, no key, no network.** A tile service would mean an outbound request per pane
 * from every browser in the plant, an account to keep alive, and a map that is blank on the
 * day the internet is. This draws itself from numbers already in the bundle.
 *
 * **It is not a statement about borders.** A coarse trace of a boundary is not a position on
 * one, and nothing on this screen turns on where the line runs to the kilometre — it is behind
 * the data, in a faint grey, so that dots have somewhere to sit.
 */

export const INDIA_OUTLINE = [
  [77.0, 35.5], [78.9, 34.3], [79.5, 33.0], [79.0, 32.5], [78.7, 31.3],
  [81.0, 30.3], [82.8, 30.0], [84.0, 29.3], [86.0, 28.1], [88.0, 27.9],
  [88.2, 27.0], [88.9, 27.3], [89.1, 26.8], [92.0, 26.9], [92.5, 27.9],
  [94.0, 27.6], [96.0, 28.5], [97.4, 28.2], [97.0, 27.1], [96.5, 27.3],
  [96.2, 26.5], [95.2, 26.6], [95.1, 26.0], [94.6, 25.2], [94.3, 24.2],
  [93.4, 24.1], [93.3, 23.0], [92.6, 22.2], [92.3, 23.0], [91.4, 23.0],
  [91.2, 24.0], [89.9, 25.3], [88.1, 24.5], [88.7, 24.3], [88.0, 23.2],
  [88.9, 21.7], [87.0, 21.5], [86.5, 20.1], [85.0, 19.5], [83.5, 18.3],
  [82.3, 17.0], [80.9, 16.0], [80.2, 15.7], [80.3, 13.5], [79.9, 11.9],
  [79.8, 10.3], [79.2, 9.3], [78.2, 8.9], [77.5, 8.1], [76.9, 8.5],
  [76.2, 9.9], [75.7, 11.3], [74.8, 12.9], [74.1, 14.8], [73.8, 15.5],
  [73.2, 17.0], [72.9, 18.9], [72.6, 20.0], [72.8, 21.7], [72.2, 21.6],
  [71.5, 20.8], [70.0, 20.9], [69.0, 22.1], [68.9, 22.5], [69.6, 22.9],
  [70.5, 23.0], [69.8, 23.6], [68.5, 23.9], [68.4, 24.5], [70.0, 24.6],
  [71.0, 24.7], [70.6, 25.7], [70.1, 26.6], [69.5, 27.2],
  [70.6, 28.0], [72.3, 28.8], [73.4, 29.9], [74.6, 31.0], [74.5, 32.5],
  [74.7, 34.0], [76.0, 34.6],
];

/**
 * The frame the outline is drawn in.
 *
 * Longitude is squeezed by the cosine of the middle latitude, which is the whole of the
 * projection: a degree of longitude at 22°N is about 93% of a degree of latitude, and drawing
 * them as squares would give a country noticeably too wide. Nothing more elaborate is earned
 * over a span this small — a proper conic projection would move a dot by less than its radius.
 */
export const BOUNDS = { west: 68.0, east: 97.5, south: 7.9, north: 35.7 };
export const SQUEEZE = Math.cos((22 * Math.PI) / 180);
