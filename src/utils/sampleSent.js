/**
 * What a sample sent the buyer, model by model [server: setSampleStatus `itemQuantities`] — for
 * the enquiry page, so marketing and Admin see what the buyer has in hand without opening the
 * sample. Null until something was sent.
 */
export function sampleSent(sample) {
  if (!sample?.dispatchedQuantity && !(sample?.items || []).some((row) => row.dispatchedQuantity)) return null;
  const rows = (sample.items || []).filter((row) => row.dispatchedQuantity != null);
  const models = rows.length
    ? rows.map((row) => ({ model: row.modelNumber || 'Model', pieces: row.dispatchedQuantity || 0 }))
    : [{ model: sample.modelNumber || 'Sample', pieces: sample.dispatchedQuantity || 0 }];
  const how = sample.deliveryMethod === 'direct'
    ? (sample.handedTo ? `handed to ${sample.handedTo}` : 'handed over')
    : [sample.courier, sample.awbNumber].filter(Boolean).join(' ');
  return { models, total: models.reduce((sum, row) => sum + row.pieces, 0), how: how || null, at: sample.dispatchedAt || null };
}

/**
 * What a piece still lacks before it goes [server: Sample `madeWith`, the photo at Sample Ready]:
 * "NPT-400S: photo, material" — the reminder on the Sample Sent forms. Takes the sample's own
 * rows (`photo` an attachment, `madeWith.materialRef`) or the work queue's (`photo` a key,
 * `madeWith.material` a flag). Empty when nothing is missing.
 */
export function readyGaps(rows = []) {
  return rows.map((row) => {
    const made = row.madeWith || {};
    const gaps = [
      !(row.photo?.key || (typeof row.photo === 'string' && row.photo)) && 'photo',
      !(made.materialRef || made.material) && 'material',
      !(made.hookRef || made.noHook || made.hook) && 'hook',
      !(Number(made.pieces) > 0) && 'pieces',
    ].filter(Boolean);
    return gaps.length ? `${row.modelNumber || row.model || 'A piece'}: ${gaps.join(', ')}` : null;
  }).filter(Boolean);
}
