"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { fetchNews, NewsItemData } from "@/lib/api";
import NewsItem from "@/components/NewsItem";
import SearchBar from "@/components/SearchBar";

export default function NewsFeedPage() {
  const [items, setItems] = useState<NewsItemData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const perPage = 20;
  const totalPages = Math.ceil(total / perPage);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchNews(page, perPage)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(() => setError("Failed to load news."))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6">
          <span className="text-2xl font-bold leading-none text-white shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </span>
          <nav className="flex items-center gap-4 text-sm text-zinc-400 mt-1.5">
            <Link href="/" className="hover:text-zinc-200 transition-colors">Dashboard</Link>
            <Link href="/groups" className="hover:text-zinc-200 transition-colors">APT Directory</Link>
            <Link href="/visualize" className="hover:text-zinc-200 transition-colors">Visualize</Link>
            <Link href="/news" className="text-zinc-200 font-medium">News Feed</Link>
            <Link href="/about" className="hover:text-zinc-200 transition-colors">About</Link>
          </nav>
          <div className="flex-1 flex justify-end">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">News Feed</h1>
          <p className="text-sm text-zinc-500">
            Latest cyber news related to China.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border-b border-zinc-800 py-4 animate-pulse">
                <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-zinc-800 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-sm">No news articles yet. The feed updates every 6 hours via GitHub Actions.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-600 mb-2">{total} article{total !== 1 ? "s" : ""}</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-5">
              {items.map((item) => (
                <NewsItem key={item.id} item={item} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-zinc-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
