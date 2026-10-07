import { useEffect, useState } from 'react';
import { handoffs } from '../api/endpoints.js';

/*
 * The buttons and the twelve stages, from the server [config/handoffs.js], fetched once per
 * page load — they change with a deploy, not while somebody is working.
 */
let cached = null;

export function useHandoffCatalogue() {
  const [catalogue, setCatalogue] = useState(() => (cached && !cached.then ? cached : null));
  useEffect(() => {
    if (catalogue) return undefined;
    let live = true;
    if (!cached) {
      cached = handoffs.catalogue().then((data) => { cached = data; return data; }, (error) => { cached = null; throw error; });
    }
    Promise.resolve(cached).then((data) => live && setCatalogue(data)).catch(() => {});
    return () => { live = false; };
  }, [catalogue]);
  return catalogue;
}

export const buttonFor = (catalogue, kind) => catalogue?.buttons.find((button) => button.key === kind);
