"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchGroups, GroupListItem } from "@/lib/api";
import GroupCard from "@/components/GroupCard";
import FilterBar, { Filters, FilterOptions } from "@/components/FilterBar";
import SearchBar from "@/components/SearchBar";

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    affiliation: params.get("affiliation") ?? "",
    actor_type:  params.get("actor_type")  ?? "",
    sector:      params.get("sector")      ?? "",
    sort:        params.get("sort")        ?? "name",
  };
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromParams(searchParams)
  );
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    affiliations: [], actorTypes: [], sectors: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all groups once on mount to derive filter option lists
  useEffect(() => {
    fetchGroups({}).then((all) => {
      const uniq = (arr: (string | null | undefined)[]) =>
        [...new Set(arr.filter(Boolean) as string[])].sort();
      const affiliationSet = new Set<string>();
      for (const g of all) {
        for (const a of g.affiliation ?? []) affiliationSet.add(a);
      }
      setFilterOptions({
        affiliations: [...affiliationSet].sort(),
        actorTypes:   uniq(all.map((g) => g.actor_type)),
        sectors:      uniq(all.flatMap((g) => g.target_sectors)),
      });
    });
  }, []);

  const applyFilters = useCallback((f: Filters) => {
    setFilters(f);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v && !(k === "sort" && v === "name")) params.set(k, v);
    }
    router.replace(`/?${params}`);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGroups(filters)
      .then((data) => {
        setGroups(data);
      })
      .catch(() => setError("Failed to load groups."))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">APT Directory</h1>
        <p className="text-sm text-zinc-500">
          Structured intelligence on Chinese state-sponsored and affiliated threat groups.
        </p>
      </div>

      <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
        <FilterBar filters={filters} options={filterOptions} onChange={applyFilters} />
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 animate-pulse">
              <div className="h-5 bg-zinc-800 rounded w-1/3 mb-3" />
              <div className="h-3 bg-zinc-800 rounded w-2/3 mb-4" />
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-zinc-500 text-sm">No groups match the current filters.</p>
      ) : (
        <>
          <p className="text-xs text-zinc-600 mb-4">
            {groups.length} group{groups.length !== 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => (
              <GroupCard key={g.slug} group={g} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6">
          <span className="text-2xl font-bold leading-none text-white shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </span>
          <nav className="flex items-center gap-4 text-sm text-zinc-400 mt-1.5">
            <Link href="/" className="text-zinc-200 font-medium">APT Directory</Link>
            <Link href="/visualize" className="hover:text-zinc-200 transition-colors">Visualize</Link>
            <Link href="/news" className="hover:text-zinc-200 transition-colors">News Feed</Link>
            <Link href="/about" className="hover:text-zinc-200 transition-colors">About</Link>
          </nav>
          <div className="flex-1 flex justify-end">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </div>
      </header>
      <Suspense>
        <HomeContent />
      </Suspense>
    </div>
  );
}
