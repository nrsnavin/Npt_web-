/**
 * List or board, for a screen that offers both.
 *
 * Deliberately not a filter and deliberately not in the address bar. It is a preference about
 * how somebody reads this screen, remembered per screen [see `useViewMode`], and the filters
 * around it are shared by both arrangements — switching between them shows the same records
 * differently rather than showing different records.
 *
 * Two words rather than two icons. A table glyph and a column glyph are indistinguishable at
 * this size to anybody who has not already learnt them, and this control appears on three
 * screens that people use all day.
 */
export default function ViewSwitch({ mode, onChange, boardLabel = 'Board' }) {
  const options = [
    { value: 'list', label: 'List' },
    { value: 'board', label: boardLabel },
  ];

  return (
    <div role="tablist" aria-label="How to show this" className="tab-track grid-flow-col">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={mode === option.value}
          onClick={() => onChange(option.value)}
          className="tab py-1.5"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
