"use client";

import { useEffect, useRef, useState } from "react";

export interface Filters {
  affiliation: string;
  actor_type: string;
  sector: string;
  sort: string;
  tools: string[];
}

export interface FilterOptions {
  affiliations: string[];
  actorTypes: string[];
  sectors: string[];
  tools: string[];
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
      <label className="text-xs text-gray-400 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-gray-400"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function ToolMultiSelect({
  selected,
  options,
  onChange,
}: {
  selected: string[];
  options: string[];
  onChange: (tools: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = options.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(tool: string) {
    onChange(
      selected.includes(tool)
        ? selected.filter((t) => t !== tool)
        : [...selected, tool]
    );
  }

  const label =
    selected.length === 0
      ? "All"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label className="text-xs text-gray-400 uppercase tracking-wider">Tools / malware</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center justify-between gap-2 bg-gray-100 border text-sm rounded px-2.5 py-1.5 focus:outline-none min-w-[140px] ${
            selected.length > 0
              ? "border-blue-400 text-gray-800"
              : "border-gray-300 text-gray-700"
          }`}
        >
          <span className="truncate max-w-[140px]">{label}</span>
          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 w-56 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tools…"
                className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400"
              />
            </div>
            <ul className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400">No matches</li>
              ) : (
                filtered.map((tool) => {
                  const checked = selected.includes(tool);
                  return (
                    <li key={tool}>
                      <button
                        type="button"
                        onClick={() => toggle(tool)}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                          checked ? "bg-blue-50 text-blue-800" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
                          checked ? "bg-blue-500 border-blue-500" : "border-gray-300"
                        }`}>
                          {checked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {tool}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {selected.length > 0 && (
              <div className="border-t border-gray-100 p-2">
                <button
                  type="button"
                  onClick={() => { onChange([]); setOpen(false); }}
                  className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  Clear tools
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FilterBar({ filters, options, onChange }: Props) {
  const set = (key: keyof Omit<Filters, "tools" | "sort">) => (v: string) =>
    onChange({ ...filters, [key]: v });

  const activeFilters: { label: string; clear: () => void }[] = [];
  if (filters.affiliation) activeFilters.push({ label: `affiliation: ${filters.affiliation}`, clear: () => set("affiliation")("") });
  if (filters.actor_type)  activeFilters.push({ label: `type: ${filters.actor_type}`,         clear: () => set("actor_type")("") });
  if (filters.sector)      activeFilters.push({ label: `sector: ${filters.sector}`,            clear: () => set("sector")("") });
  for (const tool of filters.tools) {
    activeFilters.push({ label: tool, clear: () => onChange({ ...filters, tools: filters.tools.filter((t) => t !== tool) }) });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 items-end">
        <Select label="Affiliation" value={filters.affiliation} options={options.affiliations} onChange={set("affiliation")} />
        <Select label="Actor type"  value={filters.actor_type}  options={options.actorTypes}   onChange={set("actor_type")} />
        <Select label="Sector"      value={filters.sector}      options={options.sectors}       onChange={set("sector")} />
        <ToolMultiSelect
          selected={filters.tools}
          options={options.tools}
          onChange={(tools) => onChange({ ...filters, tools })}
        />

        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-xs text-gray-400 uppercase tracking-wider">Sort</label>
          <select
            value={filters.sort}
            onChange={(e) => onChange({ ...filters, sort: e.target.value })}
            className="bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded px-2.5 py-1.5 focus:outline-none focus:border-gray-400"
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
          {activeFilters.map(({ label, clear }) => (
            <button
              key={label}
              onClick={clear}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              {label}
              <span className="ml-0.5 text-gray-500">×</span>
            </button>
          ))}
          <button
            onClick={() => onChange({ affiliation: "", actor_type: "", sector: "", sort: "name", tools: [] })}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
