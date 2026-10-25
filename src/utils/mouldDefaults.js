/**
 * A mould set up from the plant's default values by floor planning [server: config/mouldDefaults.js],
 * named field by field until each is measured and corrected on the mould.
 */
const FIELD_WORDS = {
  cavities: 'cavities',
  cycleTimeSeconds: 'cycle time',
  partWeightGrams: 'part weight',
  runnerWeightGrams: 'runner weight',
  'machine.tonnage': 'tonnage',
  changeoverMinutes: 'mould-change time',
  efficiencyPercent: 'efficiency',
};

/** "cycle time, cavities and part weight" — the defaulted fields in words; empty when none are. */
export function defaultedWords(fields = []) {
  const words = fields.map((field) => FIELD_WORDS[field] || field);
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0] || '';
}
