"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchGroups, GroupSearchResult } from "@/lib/api";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    searchGroups(debounced)
      .then((r) => {
        setResults(r.groups);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function navigate(slug: string) {
    setQuery("");
    setOpen(false);
    router.push(`/group/${slug}`);
  }

  const matchLabel = (r: GroupSearchResult) => {
    if (r.match_field === "name") return null;
    if (r.match_field === "entity_name") return (
      <span className="text-xs text-zinc-500 ml-1">entity</span>
    );
    return (
      <span className="text-xs text-zinc-500 ml-1">
        {r.match_field === "alias" ? "alias:" : "malware:"}{" "}
        <span className="text-zinc-400">{r.match_value}</span>
      </span>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search groups, aliases, malware…"
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder-zinc-500 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">…</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full mt-1.5 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No groups found.</p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.slug}>
                  <button
                    onClick={() => navigate(r.slug)}
                    className="w-full text-left px-4 py-2.5 hover:bg-zinc-800 transition-colors flex items-center gap-1"
                  >
                    <span className="text-sm font-medium text-zinc-200">{r.name}</span>
                    {matchLabel(r)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
