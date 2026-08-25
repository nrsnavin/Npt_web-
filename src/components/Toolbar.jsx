/** Search box plus optional select filters, shared by every list page. */
export default function Toolbar({ search, onSearchChange, placeholder = 'Search…', filters = [], children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <input
        type="search"
        className="input max-w-xs"
        value={search}
        placeholder={placeholder}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      {filters.map((filter) => (
        <select
          key={filter.key}
          className="input max-w-[12rem]"
          value={filter.value}
          onChange={(event) => filter.onChange(event.target.value)}
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
