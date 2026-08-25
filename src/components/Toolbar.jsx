/** Search box plus optional select filters, shared by every list page. */
export default function Toolbar({ search, onSearchChange, placeholder = 'Search…', filters = [], children }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2.5">
      <div className="relative max-w-xs flex-1 sm:min-w-[16rem]">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="input pl-9"
          value={search}
          placeholder={placeholder}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      {filters.map((filter) => (
        <select
          key={filter.key}
          className={`input max-w-[12rem] ${filter.value ? 'border-flame-500/40 text-flame-400' : ''}`}
          value={filter.value}
          onChange={(event) => filter.onChange(event.target.value)}
          aria-label={filter.label}
        >
          <option value="">{filter.label}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      <div className="ml-auto flex gap-2">{children}</div>
    </div>
  );
}
