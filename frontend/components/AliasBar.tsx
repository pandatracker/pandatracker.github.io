"use client";

import { useState } from "react";
import { AliasDetail } from "@/lib/api";

export default function AliasBar({ aliases }: { aliases: AliasDetail[] }) {
  const [tooltip, setTooltip] = useState<number | null>(null);

  if (aliases.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {aliases.map((alias, i) => (
        // Mouse events on the wrapper so moving from button → popup doesn't close it
        <div
          key={i}
          className="relative"
          onMouseEnter={() => setTooltip(i)}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="px-2.5 py-1 rounded-full text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500 transition-colors cursor-default inline-block">
            {alias.name}
          </span>

          {tooltip === i && (
            <div className="absolute z-50 left-0 top-full mt-1 min-w-52 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3 text-xs space-y-1.5">
              <p className="text-zinc-400">
                <span className="text-zinc-500">Vendor: </span>
                {alias.vendor ?? "Community / unknown"}
              </p>
              {alias.source ? (
                <a
                  href={alias.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-400 hover:text-blue-300 truncate"
                >
                  Source ↗
                </a>
              ) : (
                <p className="text-zinc-600">No source available</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
