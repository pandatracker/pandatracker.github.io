"use client";

import { NewsItemData } from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return "Yesterday";
  if (diffHours < 24 * 7) return `${Math.floor(diffHours / 24)}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NewsItem({ item }: { item: NewsItemData }) {
  return (
    <article className="border-b border-zinc-800 py-4 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-zinc-100 hover:text-blue-400 transition-colors leading-snug"
          >
            {item.title}
          </a>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              {item.source}
            </span>
            <span className="text-xs text-zinc-600">{formatDate(item.published)}</span>
          </div>

          {item.summary && (
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed line-clamp-3">
              {item.summary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
