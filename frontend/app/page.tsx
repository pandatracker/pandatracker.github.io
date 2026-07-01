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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Recently Active</h2>
        <span className="text-xs text-zinc-600">news mentions · last 14 days</span>
      </div>
      <div className="divide-y divide-zinc-800">
        {groups.map((g) => (
          <Link
            key={g.slug}
            href={`/group/${g.slug}`}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/50 transition-colors"
          >
            <span className="text-sm text-zinc-100 font-medium">{g.name}</span>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-xs text-zinc-600">{g.mention_count} mention{g.mention_count !== 1 ? "s" : ""}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">{timeAgo(g.last_mentioned)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LastKnownActivity({ groups }: { groups: DashboardActiveGroup[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Last Known Activity</h2>
        <span className="text-xs text-zinc-600">manually updated</span>
      </div>
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-xs text-zinc-600">No data yet.</p>
      ) : (
        <div className="divide-y divide-zinc-800">
          {groups.map((g) => (
            <Link
              key={g.slug}
              href={`/group/${g.slug}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="min-w-0">
                <span className="text-sm text-zinc-100 font-medium">{g.name}</span>
                <div className="mt-0.5">
                  <AffiliationBadge affiliation={g.affiliation} confidence={g.affiliation_confidence} />
                </div>
              </div>
              {g.last_seen && (
                <span className="text-xs text-zinc-500 shrink-0 ml-3">{g.last_seen}</span>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Recent News</h2>
        <Link href="/news" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          View all →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-zinc-600">No recent articles yet.</p>
      ) : (
        <div className="divide-y divide-zinc-800">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-3">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-100 hover:text-blue-400 transition-colors leading-snug block"
              >
                {item.title}
              </a>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-zinc-600">{item.source}</span>
                <span className="text-zinc-700">·</span>
                <span className="text-xs text-zinc-600">{timeAgo(item.published)}</span>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Recent OTX Activity</h2>
        <span className="text-xs text-zinc-600">by modified date</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-zinc-600">No OTX pulses yet.</p>
      ) : (
        <div className="divide-y divide-zinc-800">
          {items.map((p) => (
            <div key={p.pulse_id} className="px-4 py-2.5">
              <a
                href={`https://otx.alienvault.com/pulse/${p.pulse_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-100 hover:text-blue-400 transition-colors leading-snug block"
              >
                {p.name}
              </a>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Link href={`/group/${p.group_slug}`} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  {p.group_name}
                </Link>
                {p.indicator_count > 0 && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-xs text-zinc-600">{p.indicator_count} IOCs</span>
                  </>
                )}
                {p.modified && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-xs text-zinc-600">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">APT Mentions</h2>
        <p className="text-xs text-zinc-600 mt-0.5">Latest news tied to tracked groups</p>
      </div>
      <div className="divide-y divide-zinc-800">
        {items.map((m, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <Link
              href={`/group/${m.group_slug}`}
              className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25 transition-colors whitespace-nowrap mt-0.5"
            >
              {m.group_name}
            </Link>
            <div className="min-w-0">
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-100 hover:text-blue-400 transition-colors leading-snug block"
              >
                {m.title}
              </a>
              <div className="flex items-center gap-2 mt-0.5">
                {m.source && <span className="text-xs text-zinc-600">{m.source}</span>}
                {m.source && m.published && <span className="text-zinc-700">·</span>}
                {m.published && <span className="text-xs text-zinc-600">{timeAgo(m.published)}</span>}
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Recent Campaigns</h2>
        <p className="text-xs text-zinc-600 mt-0.5">Most recently reported operations</p>
      </div>
      <div className="divide-y divide-zinc-800">
        {campaigns.map((c, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-zinc-100 leading-snug">{c.name}</span>
              {c.year_published && (
                <span className="text-xs text-zinc-500 shrink-0 tabular-nums">{c.year_published}</span>
              )}
            </div>
            <Link href={`/group/${c.group_slug}`} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              {c.group_name}
            </Link>
            {c.description && (
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed line-clamp-2">{c.description}</p>
            )}
            {c.target_sectors.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {c.target_sectors.slice(0, 3).map((s) => (
                  <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                    {s}
                  </span>
                ))}
                {c.target_sectors.length > 3 && (
                  <span className="text-xs text-zinc-600">+{c.target_sectors.length - 3}</span>
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
      <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg h-32" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-lg h-80" />
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg h-80" />
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6">
          <Link href="/" className="text-2xl font-bold leading-none text-white shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-400 mt-1.5">
            <Link href="/" className="text-zinc-200 font-medium">Dashboard</Link>
            <Link href="/groups" className="hover:text-zinc-200 transition-colors">APT Directory</Link>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-sm text-zinc-500">Chinese APT activity — current snapshot</p>
        </div>
        <DashboardContent />
      </main>
    </div>
  );
}
