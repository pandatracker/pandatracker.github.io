"use client";

import { useState } from "react";
import { OtxPulseItem } from "@/lib/api";

const PAGE_SIZE = 10;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function PulseCard({ pulse }: { pulse: OtxPulseItem }) {
  const [expanded, setExpanded] = useState(false);
  const desc = pulse.description ?? "";
  const long = desc.length > 300;
  const httpRefs = pulse.reference_urls.filter(isHttpUrl);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Title + date */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <a
          href={`https://otx.alienvault.com/pulse/${pulse.pulse_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue-600 hover:text-blue-700 leading-snug"
        >
          {pulse.name}
        </a>
        <span className="text-xs text-gray-400 shrink-0">
          {formatDate(pulse.modified || pulse.created)}
        </span>
      </div>

      {/* Author + indicator count */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
        {pulse.author_name && <span>{pulse.author_name}</span>}
        {pulse.indicator_count > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-300 text-gray-500">
            {pulse.indicator_count} IOCs
          </span>
        )}
      </div>

      {/* Description */}
      {desc && (
        <div className="text-sm text-gray-500 leading-relaxed">
          <p>{expanded || !long ? desc : desc.slice(0, 300) + "…"}</p>
          {long && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-400 hover:text-gray-700 mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Tags */}
      {pulse.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pulse.tags.slice(0, 12).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded bg-gray-100 border border-gray-300 text-gray-500"
            >
              {tag}
            </span>
          ))}
          {pulse.tags.length > 12 && (
            <span className="text-xs text-gray-400">+{pulse.tags.length - 12} more</span>
          )}
        </div>
      )}

      {/* Targeted countries + industries */}
      {(pulse.targeted_countries.length > 0 || pulse.industries.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          {pulse.targeted_countries.length > 0 && (
            <span>
              <span className="text-gray-400 mr-1">Countries:</span>
              {pulse.targeted_countries.join(", ")}
            </span>
          )}
          {pulse.industries.length > 0 && (
            <span>
              <span className="text-gray-400 mr-1">Industries:</span>
              {pulse.industries.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Reference URLs — http/https only */}
      {httpRefs.length > 0 && (
        <div className="space-y-0.5">
          {httpRefs.slice(0, 5).map((url, i) => (
            <div key={i} className="text-xs">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-blue-600 break-all"
              >
                ↗ {url}
              </a>
            </div>
          ))}
          {httpRefs.length > 5 && (
            <span className="text-xs text-gray-400">
              +{httpRefs.length - 5} more references
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function OtxPulseList({ pulses }: { pulses: OtxPulseItem[] }) {
  const [sortByIocs, setSortByIocs] = useState(false);
  const [page, setPage] = useState(0);

  if (!pulses || pulses.length === 0) {
    return (
      <p className="text-gray-400 text-sm">No OTX pulses found for this group.</p>
    );
  }

  const sorted = sortByIocs
    ? [...pulses].sort((a, b) => b.indicator_count - a.indicator_count)
    : pulses;

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const page_pulses = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-3">
        Threat intelligence pulses sourced from{" "}
        <a
          href="https://otx.alienvault.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700"
        >
          AlienVault OTX
        </a>
        . Synced via community-contributed pulses matching this group's name and known aliases.
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{sorted.length} pulses</span>
        <button
          onClick={() => { setSortByIocs(!sortByIocs); setPage(0); }}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            sortByIocs
              ? "bg-gray-200 border-gray-400 text-gray-800"
              : "bg-white border-gray-300 text-gray-500 hover:text-gray-800"
          }`}
        >
          Sort by IOCs {sortByIocs ? "↓" : ""}
        </button>
      </div>

      {page_pulses.map((p) => (
        <PulseCard key={p.pulse_id} pulse={p} />
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-400">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
