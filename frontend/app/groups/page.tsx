"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchGroups, loadToolsIndex, GroupListItem } from "@/lib/api";
import GroupCard from "@/components/GroupCard";
import FilterBar, { Filters, FilterOptions } from "@/components/FilterBar";
import SearchBar from "@/components/SearchBar";

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    affiliation: params.get("affiliation") ?? "",
    actor_type:  params.get("actor_type")  ?? "",
    sector:      params.get("sector")      ?? "",
    sort:        params.get("sort")        ?? "name",
    tools:       params.getAll("tool"),
  };
}

function GroupsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromParams(searchParams)
  );
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    affiliations: [], actorTypes: [], sectors: [], tools: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchGroups({}), loadToolsIndex()]).then(([all, toolsIndex]) => {
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
        tools:        Object.keys(toolsIndex).sort(),
      });
    });
  }, []);

  const applyFilters = useCallback((f: Filters) => {
    setFilters(f);
    const params = new URLSearchParams();
    if (f.affiliation) params.set("affiliation", f.affiliation);
    if (f.actor_type)  params.set("actor_type",  f.actor_type);
    if (f.sector)      params.set("sector",       f.sector);
    if (f.sort && f.sort !== "name") params.set("sort", f.sort);
    for (const tool of f.tools) params.append("tool", tool);
    router.replace(`/groups?${params}`);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGroups(filters)
      .then((data) => { setGroups(data); })
      .catch(() => setError("Failed to load groups."))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">APT Directory</h1>
        <p className="text-sm text-gray-400">
          Structured intelligence on Chinese state-sponsored and affiliated threat groups.
        </p>
      </div>

      <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
        <FilterBar filters={filters} options={filterOptions} onChange={applyFilters} />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-gray-400 text-sm">No groups match the current filters.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-4">
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

export default function GroupsPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-gray-50/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link href="/" className="text-2xl font-bold leading-none text-gray-900 shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-800 transition-colors">Dashboard</Link>
            <Link href="/groups" className="text-gray-800 font-medium">APT Directory</Link>
            <Link href="/visualize" className="hover:text-gray-800 transition-colors">Visualize</Link>
            <Link href="/news" className="hover:text-gray-800 transition-colors">News Feed</Link>
            <Link href="/notes" className="hover:text-gray-800 transition-colors">Notes</Link>
          </nav>
          <div className="flex-1 flex justify-end">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </div>
        <nav className="sm:hidden px-4 py-2 overflow-x-auto border-t border-gray-100">
          <div className="flex items-center gap-5 text-sm whitespace-nowrap text-gray-500">
            <Link href="/" className="hover:text-gray-800 transition-colors">Dashboard</Link>
            <Link href="/groups" className="text-gray-800 font-medium">APT Directory</Link>
            <Link href="/visualize" className="hover:text-gray-800 transition-colors">Visualize</Link>
            <Link href="/news" className="hover:text-gray-800 transition-colors">News Feed</Link>
            <Link href="/notes" className="hover:text-gray-800 transition-colors">Notes</Link>
          </div>
        </nav>
      </header>
      <Suspense>
        <GroupsContent />
      </Suspense>
    </div>
  );
}
