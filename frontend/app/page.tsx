"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchDashboard,
  DashboardData,
  DashboardNewsItem,
  DashboardActiveGroup,
  ActiveFromMentions,
  AptMentionItem,
  DashboardCampaign,
  RecentOtxItem,
} from "@/lib/api";
import { AffiliationBadge } from "@/components/badges";
import SearchBar from "@/components/SearchBar";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 48) return "yesterday";
  if (h < 24 * 7) return `${Math.floor(h / 24)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RecentlyActive({ groups }: { groups: ActiveFromMentions[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Recently Mentioned</h2>
        <span className="text-xs text-gray-400">news mentions · last 14 days</span>
      </div>
      <div className="divide-y divide-gray-200">
        {groups.map((g) => (
          <Link
            key={g.slug}
            href={`/group/${g.slug}`}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm text-gray-900">{g.name}</span>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-xs text-gray-400">{g.mention_count} mention{g.mention_count !== 1 ? "s" : ""}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">{timeAgo(g.last_mentioned)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LastKnownActivity({ groups }: { groups: DashboardActiveGroup[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Last Known Activity</h2>
        <span className="text-xs text-gray-400">manually updated</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-xs text-gray-400">No data yet.</p>
      ) : (
        <div className="divide-y divide-gray-200">
          {groups.map((g) => (
            <Link
              key={g.slug}
              href={`/group/${g.slug}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <span className="text-sm text-gray-900">{g.name}</span>
                <div className="mt-0.5">
                  <AffiliationBadge affiliation={g.affiliation} confidence={g.affiliation_confidence} />
                </div>
              </div>
              {g.last_seen && (
                <span className="text-xs text-gray-400 shrink-0 ml-3">{g.last_seen}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentNews({ items }: { items: DashboardNewsItem[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Recent News</h2>
        <Link href="/news" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          View all →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-gray-400">No recent articles yet.</p>
      ) : (
        <div className="divide-y divide-gray-200">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-3">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-900 hover:text-blue-600 transition-colors leading-snug block"
              >
                {item.title}
              </a>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">{item.source}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-400">{timeAgo(item.published)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentOtxActivity({ items }: { items: RecentOtxItem[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Recent OTX Activity</h2>
        <span className="text-xs text-gray-400">by modified date</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-gray-400">No OTX pulses yet.</p>
      ) : (
        <div className="divide-y divide-gray-200">
          {items.map((p) => (
            <div key={p.pulse_id} className="px-4 py-2.5">
              <a
                href={`https://otx.alienvault.com/pulse/${p.pulse_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-900 hover:text-blue-600 transition-colors leading-snug block"
              >
                {p.name}
              </a>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Link href={`/group/${p.group_slug}`} className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
                  {p.group_name}
                </Link>
                {p.indicator_count > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{p.indicator_count} IOCs</span>
                  </>
                )}
                {p.modified && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      {new Date(p.modified).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AptMentions({ items }: { items: AptMentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">APT Mentions</h2>
        <p className="text-xs text-gray-400 mt-0.5">Latest news tied to tracked groups</p>
      </div>
      <div className="divide-y divide-gray-200">
        {items.map((m, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <Link
              href={`/group/${m.group_slug}`}
              className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors whitespace-nowrap mt-0.5"
            >
              {m.group_name}
            </Link>
            <div className="min-w-0">
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-900 hover:text-blue-600 transition-colors leading-snug block"
              >
                {m.title}
              </a>
              <div className="flex items-center gap-2 mt-0.5">
                {m.source && <span className="text-xs text-gray-400">{m.source}</span>}
                {m.source && m.published && <span className="text-gray-300">·</span>}
                {m.published && <span className="text-xs text-gray-400">{timeAgo(m.published)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentCampaigns({ campaigns }: { campaigns: DashboardCampaign[] }) {
  if (campaigns.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">Recent Campaigns</h2>
        <p className="text-xs text-gray-400 mt-0.5">Most recently reported operations</p>
      </div>
      <div className="divide-y divide-gray-200">
        {campaigns.map((c, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900 leading-snug">{c.name}</span>
              {c.year_published && (
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">{c.year_published}</span>
              )}
            </div>
            <Link href={`/group/${c.group_slug}`} className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
              {c.group_name}
            </Link>
            {c.description && (
              <p className="text-xs text-gray-400 mt-2 leading-relaxed line-clamp-2">{c.description}</p>
            )}
            {c.target_sectors.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {c.target_sectors.slice(0, 3).map((s) => (
                  <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 border border-gray-300">
                    {s}
                  </span>
                ))}
                {c.target_sectors.length > 3 && (
                  <span className="text-xs text-gray-400">+{c.target_sectors.length - 3}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch(() => setError("Failed to load dashboard data."));
  }, []);

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-white border border-gray-200 rounded-lg h-32" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg h-80" />
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RecentlyActive groups={data.active_from_mentions} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <RecentNews items={data.recent_news} />
        </div>
        <div className="lg:col-span-2">
          <RecentOtxActivity items={data.recent_otx} />
        </div>
      </div>

      <AptMentions items={data.apt_mentions} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <RecentCampaigns campaigns={data.recent_campaigns} />
        </div>
        <div className="lg:col-span-2">
          <LastKnownActivity groups={data.recently_active} />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-gray-50/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link href="/" className="text-2xl font-bold leading-none text-gray-900 shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
            <Link href="/" className="text-gray-800 font-medium">Dashboard</Link>
            <Link href="/groups" className="hover:text-gray-800 transition-colors">APT Directory</Link>
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
            <Link href="/" className="text-gray-800 font-medium">Dashboard</Link>
            <Link href="/groups" className="hover:text-gray-800 transition-colors">APT Directory</Link>
            <Link href="/visualize" className="hover:text-gray-800 transition-colors">Visualize</Link>
            <Link href="/news" className="hover:text-gray-800 transition-colors">News Feed</Link>
            <Link href="/notes" className="hover:text-gray-800 transition-colors">Notes</Link>
          </div>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
          <p className="text-sm text-gray-400">China-associated threat groups activity</p>
        </div>
        <DashboardContent />
      </main>
    </div>
  );
}
