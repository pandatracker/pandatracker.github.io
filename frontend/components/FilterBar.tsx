"use client";

export interface Filters {
  affiliation: string;
  actor_type: string;
  sector: string;
  sort: string;
}

export interface FilterOptions {
  affiliations: string[];
  actorTypes: string[];
  sectors: string[];
}

interface Props {
  filters: Filters;
  options: FilterOptions;
  onChange: (filters: Filters) => void;
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-500 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-zinc-500"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export default function FilterBar({ filters, options, onChange }: Props) {
  const set = (key: keyof Filters) => (v: string) => onChange({ ...filters, [key]: v });

  const activeFilters = Object.entries(filters).filter(
    ([k, v]) => v && k !== "sort"
  ) as [keyof Filters, string][];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 items-end">
        <Select label="Affiliation" value={filters.affiliation} options={options.affiliations} onChange={set("affiliation")} />
        <Select label="Actor type"  value={filters.actor_type}  options={options.actorTypes}   onChange={set("actor_type")} />
        <Select label="Sector"      value={filters.sector}      options={options.sectors}       onChange={set("sector")} />

        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">Sort</label>
          <select
            value={filters.sort}
            onChange={(e) => set("sort")(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-zinc-500"
          >
            <option value="name">Name (A–Z)</option>
            <option value="last_seen">Last seen (newest)</option>
            <option value="last_seen_asc">Last seen (oldest)</option>
            <option value="first_seen">First seen (newest)</option>
            <option value="first_seen_asc">First seen (oldest)</option>
          </select>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map(([key, value]) => (
            <button
              key={key}
              onClick={() => set(key)("")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              <span className="text-zinc-500">{key.replace("_", " ")}:</span> {value}
              <span className="ml-0.5 text-zinc-400">×</span>
            </button>
          ))}
          <button
            onClick={() => onChange({ affiliation: "", actor_type: "", sector: "", sort: "name" })}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
