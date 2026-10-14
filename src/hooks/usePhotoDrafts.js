import { useRef, useState } from 'react';
import { buyerCards as cardsApi } from '../api/endpoints.js';
import { picturesOf } from '../utils/sharedPhotos.js';

/**
 * Draft enquiries from pictures — a visiting card, an enquiry slip, screenshots of a chat with
 * the buyer — picked from the phone's gallery or taken with its camera, or shared to the
 * installed app [public/sw.js `share-photo`].
 *
 * The picker has no `capture`: with it a phone opens the camera and nothing else, and the
 * screenshot already in the gallery — the common case — could not be picked at all. Without
 * it the phone offers the gallery, the camera and its files.
 *
 * Several at once go up one after another, in the order picked, so the later screenshots of one
 * chat fold into the draft its first one made [server: buyerCard.service `chatItContinues`].
 */
export function usePhotoDrafts({ onDone } = {}) {
  const input = useRef(null);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);

  const upload = async (files) => {
    const pictures = picturesOf(files);
    if (!pictures.length) {
      if (files?.length) setProblem('Pick a photo or a screenshot.');
      return [];
    }
    setProblem(null);
    const cards = [];
    try {
      for (const [index, file] of pictures.entries()) {
        setBusy({ at: index + 1, of: pictures.length });
        cards.push(await cardsApi.upload({ file }));
      }
    } catch (failure) {
      setProblem(cards.length ? `${cards.length} of ${pictures.length} sent — ${failure.message}` : failure.message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
    if (cards.length) onDone?.(cards);
    return cards;
  };

  return {
    busy,
    problem,
    upload,
    open: () => input.current?.click(),
    label: busy ? (busy.of > 1 ? `Reading ${busy.at} of ${busy.of}…` : 'Reading the photo…') : null,
    inputProps: {
      ref: input,
      type: 'file',
      accept: 'image/*',
      multiple: true,
      className: 'hidden',
      onChange: (event) => upload(event.target.files),
    },
  };
}
