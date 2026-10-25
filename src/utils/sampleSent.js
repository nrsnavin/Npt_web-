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
