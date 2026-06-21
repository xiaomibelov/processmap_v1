import { FILTER_OPTIONS } from "./userAccessConstants.js";

export function UserFilters({ query, onQueryChange, filter, onFilterChange }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange?.(e.target.value)}
        placeholder="Поиск по имени, email, должности, организации"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-80"
      />
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onFilterChange?.(option.value)}
              className={[
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
