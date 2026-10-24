/**
 * How an enquiry's goods go out [server: utils/dispatchPlan.js]: the enquiry's own choice, else
 * each model on its own way when it has several, else together. Read from an enquiry carrying
 * `dispatchPlan` and `items`.
 */
export function dispatchModeOf(enquiry) {
  const chosen = enquiry?.dispatchPlan?.mode;
  if (chosen === 'by_model' || chosen === 'together') return chosen;
  const models = (enquiry?.items || []).filter((item) => item && (String(item.modelNumber || '').trim() || item.mould));
  return models.length > 1 ? 'by_model' : 'together';
}
