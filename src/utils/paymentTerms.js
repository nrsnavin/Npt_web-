/**
 * The payment terms the plant uses, as presets [server: services/paymentGates.service.js].
 *
 * Each is two numbers: the share of the order that must be received before production starts,
 * and the share (in total) received before the goods may leave.
 */
export const PAYMENT_PRESETS = [
  { key: 'credit', label: 'Credit — nothing before dispatch', advancePercent: 0, beforeDispatchPercent: 0 },
  { key: 'advance_100', label: '100% advance', advancePercent: 100, beforeDispatchPercent: 100 },
  { key: 'advance_50_delivery_50', label: '50% advance, 50% against delivery', advancePercent: 50, beforeDispatchPercent: 50 },
  { key: 'advance_50_dispatch_50', label: '50% advance, 50% before dispatch', advancePercent: 50, beforeDispatchPercent: 100 },
  { key: 'advance_30_dispatch_70', label: '30% advance, 70% before dispatch', advancePercent: 30, beforeDispatchPercent: 100 },
  { key: 'dispatch_100', label: '100% against dispatch', advancePercent: 0, beforeDispatchPercent: 100 },
];

/** The preset these numbers are, or null for custom terms. */
export const presetFor = ({ advancePercent = 0, beforeDispatchPercent = 0 } = {}) =>
  PAYMENT_PRESETS.find((preset) =>
    preset.advancePercent === Number(advancePercent) && preset.beforeDispatchPercent === Number(beforeDispatchPercent)) || null;

/** The terms in words, for the order screen. */
export const describePlan = (plan = {}) => {
  const preset = presetFor(plan);
  if (preset) return preset.label;
  return `${plan.advancePercent || 0}% before production, ${plan.beforeDispatchPercent || 0}% before dispatch`;
};
