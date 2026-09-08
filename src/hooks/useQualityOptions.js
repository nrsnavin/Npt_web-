import { useEffect, useState } from 'react';
import { quality as qualityApi } from '../api/endpoints.js';

/**
 * Quality's vocabulary, fetched from the server rather than kept here [§15].
 *
 * Sixteen defect names, and the model is the only place they should be written. `/quality/options`
 * exists for exactly this reason — so a form cannot offer a defect the reports do not know — and
 * a second copy in the browser would be a list that drifts the first time somebody adds one.
 *
 * The consequence, before this existed, was on the screen: an inspection stores a defect as its
 * key, so the register and the bench's day screen printed `short_shot` and `colour_variation` at
 * people. Correct data, unreadable.
 *
 * Returns a labelling function rather than the list, because that is all any caller wants — and
 * one that falls back to the key, so a defect added on the server before this fetch lands still
 * says something rather than nothing.
 */
export default function useQualityOptions() {
  const [defects, setDefects] = useState(null);

  useEffect(() => {
    let live = true;
    qualityApi
      .options()
      /* A vocabulary that will not load must not block a screen: the keys are ugly but true. */
      .then((options) => live && setDefects(options?.defects || []))
      .catch(() => live && setDefects([]));
    return () => {
      live = false;
    };
  }, []);

  const defectLabel = (key) =>
    defects?.find((defect) => defect.key === key)?.label || key;

  return { defects, defectLabel, ready: defects !== null };
}
