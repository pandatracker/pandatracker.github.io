"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchGroup, fetchGroups, fetchGroupNews, fetchRelations, GroupDetail, GroupListItem, GroupNewsItem, GroupRelation } from "@/lib/api";
import { AffiliationBadge } from "@/components/badges";
import AliasBar from "@/components/AliasBar";
import TabNavigation, { useActiveTab } from "@/components/TabNavigation";
import TechniqueList from "@/components/TechniqueList";
import OtxPulseList from "@/components/OtxPulseList";
import SearchBar from "@/components/SearchBar";

// ---------------------------------------------------------------------------
// Evidence type badge
// ---------------------------------------------------------------------------

const EVIDENCE_COLORS: Record<string, string> = {
  indictment:           "bg-red-500/15 text-red-400 border-red-500/30",
  "vendor-report":      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "government-advisory":"bg-amber-500/15 text-amber-400 border-amber-500/30",
  "leaked-docs":        "bg-purple-500/15 text-purple-400 border-purple-500/30",
  circumstantial:       "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function EvidenceBadge({ type }: { type: string | null }) {
  const cls = (type && EVIDENCE_COLORS[type]) ?? EVIDENCE_COLORS.circumstantial;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {type ?? "unknown"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Campaign confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  const map: Record<string, string> = {
    high:   "bg-green-500/15 text-green-400 border-green-500/30",
    medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    low:    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  };
  const cls = (confidence && map[confidence]) ?? map.low;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {confidence ?? "unknown"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Overview
// ---------------------------------------------------------------------------

function OverviewTab({ group }: { group: GroupDetail }) {
  const confidenceColor: Record<string, string> = {
    high:      "text-green-400",
    likely:    "text-yellow-400",
    suspected: "text-orange-400",
  };
  const confCls = (group.affiliation_confidence && confidenceColor[group.affiliation_confidence])
    ?? "text-zinc-400";

  return (
    <div className="space-y-8">
      {/* Description */}
      {group.description && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Description</h2>
          <div className="space-y-3">
            {group.description.split("\n").filter(p => p.trim()).map((p, i) => (
              <p key={i} className="text-zinc-300 leading-relaxed">{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* Attribution */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Attribution</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <p className="text-sm text-zinc-300">
            <span className="text-zinc-500">Affiliation: </span>
            {group.affiliation && group.affiliation.length > 0
              ? group.affiliation.join(", ")
              : "Unknown"}
            {group.affiliation_confidence && (
              <span className={`ml-2 text-xs font-medium ${confCls}`}>
                ({group.affiliation_confidence})
              </span>
            )}
          </p>
          {group.affiliation_unit && (
            <p className="text-sm text-zinc-300">
              <span className="text-zinc-500">Unit: </span>
              {group.affiliation_unit}
            </p>
          )}
          {group.entity_name && group.entity_name.length > 0 && (
            <div>
              <span className="text-zinc-500 text-sm">
                {group.entity_name.length === 1 ? "Entity: " : "Entities: "}
              </span>
              {group.entity_name.length === 1 ? (
                <span className="text-sm text-zinc-300">{group.entity_name[0]}</span>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {group.entity_name.map((e, i) => (
                    <li key={i} className="text-sm text-zinc-300 pl-3 before:content-['·'] before:mr-2 before:text-zinc-600">{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {group.affiliation_detail && (
            <div className="space-y-2">
              {group.affiliation_detail.split("\n").filter(p => p.trim()).map((p, i) => (
                <p key={i} className="text-sm text-zinc-400 leading-relaxed">{p}</p>
              ))}
            </div>
          )}

          {group.attribution_evidence.length > 0 && (
            <div className="pt-2 space-y-3 border-t border-zinc-800">
              {group.attribution_evidence.map((e, i) => (
                <div key={i} className="flex gap-3">
                  <div className="pt-0.5"><EvidenceBadge type={e.type} /></div>
                  <div className="min-w-0">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-400 hover:text-blue-300 leading-snug">
                        {e.title}
                      </a>
                    ) : (
                      <p className="text-sm text-zinc-300">{e.title}</p>
                    )}
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {[e.publisher, e.date].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Campaigns Associated */}
      {group.campaigns.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Campaigns Associated
          </h2>
          <div className="space-y-4">
            {group.campaigns.map((c, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{c.name}</span>
                  {c.year_published && (
                    <span className="text-xs text-zinc-500">{c.year_published}</span>
                  )}
                </div>

                {c.description && (
                  <div className="space-y-2">
                    {c.description.split("\n").filter(p => p.trim()).map((p, i) => (
                      <p key={i} className="text-sm text-zinc-400 leading-relaxed">{p}</p>
                    ))}
                  </div>
                )}

                {c.sources.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {c.sources.map((s, j) => s.url && (
                      <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300">
                        {s.title ?? s.publisher ?? "Source"} ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Key References */}
      {group.references.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Key References
          </h2>
          <div className="space-y-3">
            {group.references.map((r, i) => (
              <div key={i} className="border-l-2 border-zinc-800 pl-4">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium">
                    {r.title}
                  </a>
                ) : (
                  <p className="text-sm text-zinc-300 font-medium">{r.title}</p>
                )}
                <p className="text-xs text-zinc-500 mt-0.5">
                  {[r.publisher, r.date].filter(Boolean).join(" · ")}
                </p>
                {r.notes && <p className="text-xs text-zinc-600 mt-1">{r.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Relations
// ---------------------------------------------------------------------------

const TACTIC_ORDER = [
  "reconnaissance",
  "resource-development",
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "defense-evasion",
  "credential-access",
  "discovery",
  "lateral-movement",
  "collection",
  "command-and-control",
  "exfiltration",
  "impact",
];

function tacticSort([a]: [string, unknown], [b]: [string, unknown]): number {
  const ai = TACTIC_ORDER.indexOf(a);
  const bi = TACTIC_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

function SharedTechniquesSection({ techniques }: { techniques: { technique_id: string; name: string; url: string | null; tactic: string | null }[] }) {
  const [open, setOpen] = useState(false);

  const byTactic = new Map<string, typeof techniques>();
  for (const t of techniques) {
    const tactic = t.tactic ? t.tactic.split(", ")[0] : "unknown";
    if (!byTactic.has(tactic)) byTactic.set(tactic, []);
    byTactic.get(tactic)!.push(t);
  }
  const tacticEntries = Array.from(byTactic.entries()).sort(tacticSort);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5 hover:text-zinc-300 transition-colors"
      >
        <span>Shared techniques ({techniques.length})</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 mt-1.5">
          {tacticEntries.map(([tactic, techs]) => (
            <div key={tactic}>
              <p className="text-xs text-zinc-600 mb-1 capitalize">
                {tactic.replace(/-/g, " ")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {techs.map((t) =>
                  t.url ? (
                    <a key={t.technique_id} href={t.url} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded text-xs bg-teal-500/15 text-teal-300 border border-teal-500/25 hover:bg-teal-500/25 transition-colors">
                      {t.technique_id} {t.name} ↗
                    </a>
                  ) : (
                    <span key={t.technique_id} className="px-2 py-0.5 rounded text-xs bg-teal-500/15 text-teal-300 border border-teal-500/25">
                      {t.technique_id} {t.name}
                    </span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function SharedTargetsSection({ sectors, regions }: { sectors: string[]; regions: string[] }) {
  const [open, setOpen] = useState(false);
  const total = sectors.length + regions.length;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5 hover:text-zinc-300 transition-colors"
      >
        <span>Shared targets ({total})</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-2 mt-1.5">
          {sectors.length > 0 && (
            <div>
              <p className="text-xs text-zinc-600 mb-1">Industries</p>
              <div className="flex flex-wrap gap-1.5">
                {sectors.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-300 border border-amber-500/25">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {regions.length > 0 && (
            <div>
              <p className="text-xs text-zinc-600 mb-1">Countries / Regions</p>
              <div className="flex flex-wrap gap-1.5">
                {regions.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded text-xs bg-sky-500/15 text-sky-300 border border-sky-500/25">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RelationsTab({ slug }: { slug: string }) {
  const [relations, setRelations] = useState<GroupRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"total" | "tools" | "techniques" | "targets">("total");

  useEffect(() => {
    fetchRelations(slug)
      .then((r) => setRelations(r.relations))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <p className="text-zinc-500 text-sm">Loading…</p>;
  if (relations.length === 0) {
    return <p className="text-zinc-500 text-sm">No known relations with other tracked groups.</p>;
  }

  const sorted = [...relations].sort((a, b) => {
    if (sortBy === "tools") return b.shared_tools.length - a.shared_tools.length;
    if (sortBy === "techniques") return b.shared_techniques.length - a.shared_techniques.length;
    if (sortBy === "targets") return (b.shared_sectors.length + b.shared_regions.length) - (a.shared_sectors.length + a.shared_regions.length);
    return (
      b.shared_tools.length + b.shared_techniques.length + b.shared_sectors.length + b.shared_regions.length -
      (a.shared_tools.length + a.shared_techniques.length + a.shared_sectors.length + a.shared_regions.length)
    );
  });

  const btnCls = (active: boolean) =>
    `px-3 py-1 rounded text-xs font-medium border transition-colors ${
      active
        ? "bg-zinc-700 text-zinc-100 border-zinc-600"
        : "bg-transparent text-zinc-500 border-zinc-800 hover:text-zinc-300"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-600">Sort by:</span>
        <button className={btnCls(sortBy === "total")} onClick={() => setSortBy("total")}>Most shared</button>
        <button className={btnCls(sortBy === "tools")} onClick={() => setSortBy("tools")}>Most tools</button>
        <button className={btnCls(sortBy === "techniques")} onClick={() => setSortBy("techniques")}>Most TTPs</button>
        <button className={btnCls(sortBy === "targets")} onClick={() => setSortBy("targets")}>Most targets</button>
      </div>
      {sorted.map((rel) => {
        const totalShared = rel.shared_tools.length + rel.shared_techniques.length + rel.shared_sectors.length + rel.shared_regions.length;
        return (
          <div key={rel.group_slug ?? rel.group_name} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              {rel.group_slug ? (
                <Link href={`/group/${rel.group_slug}`} className="text-base font-semibold text-blue-400 hover:text-blue-300 hover:underline">
                  {rel.group_name}
                </Link>
              ) : (
                <span className="text-base font-semibold text-zinc-200">{rel.group_name}</span>
              )}
              <span className="text-xs text-zinc-600">{totalShared} shared</span>
            </div>

            {rel.shared_tools.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Shared tools ({rel.shared_tools.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {rel.shared_tools.map((t) => (
                    t.url ? (
                      <a key={t.software_id} href={t.url} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-0.5 rounded text-xs bg-purple-500/15 text-purple-300 border border-purple-500/25 hover:bg-purple-500/25 transition-colors">
                        {t.name} ↗
                      </a>
                    ) : (
                      <span key={t.software_id} className="px-2 py-0.5 rounded text-xs bg-purple-500/15 text-purple-300 border border-purple-500/25">
                        {t.name}
                      </span>
                    )
                  ))}
                </div>
              </div>
            )}

            {rel.shared_techniques.length > 0 && (
              <div className="mb-3">
                <SharedTechniquesSection techniques={rel.shared_techniques} />
              </div>
            )}

            {(rel.shared_sectors.length > 0 || rel.shared_regions.length > 0) && (
              <SharedTargetsSection sectors={rel.shared_sectors} regions={rel.shared_regions} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5: Mentions
// ---------------------------------------------------------------------------

function GroupMentionsTab({ slug }: { slug: string }) {
  const [items, setItems] = useState<GroupNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGroupNews(slug)
      .then(r => setItems(r.items))
      .catch(() => setError("Failed to load mentions."))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <p className="text-zinc-500 text-sm">Loading mentions…</p>;
  if (error)   return <p className="text-red-400 text-sm">{error}</p>;
  if (items.length === 0) return (
    <p className="text-zinc-500 text-sm">No mentions observed.</p>
  );

  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={i} className="border-b border-zinc-800/60 pb-4 mb-4 last:border-0 last:mb-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 font-medium leading-snug"
          >
            {item.title}
          </a>
          <p className="text-xs text-zinc-600 mt-1">
            {[item.source, item.published ? item.published.slice(0, 10) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content router (needs useSearchParams → must be in Suspense)
// ---------------------------------------------------------------------------

function TabContent({ group }: { group: GroupDetail }) {
  const active = useActiveTab();

  if (active === "attack") {
    return (
      <TechniqueList
        techniques={group.attack_techniques}
        software={group.attack_software}
        attackGroupId={group.attack_group_id}
        attackGroupUrl={group.attack_group_url}
      />
    );
  }

  if (active === "relations") {
    return <RelationsTab slug={group.slug} />;
  }

  if (active === "mentions") {
    return <GroupMentionsTab slug={group.slug} />;
  }

  if (active === "otx") {
    return <OtxPulseList pulses={group.otx_pulses} />;
  }

  return <OverviewTab group={group} />;
}

// ---------------------------------------------------------------------------
// Profile page inner (uses hooks that need Suspense)
// ---------------------------------------------------------------------------

function GroupProfileInner({ slug }: { slug: string }) {
  
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [allGroups, setAllGroups] = useState<GroupListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGroup(slug)
      .then(setGroup)
      .catch(() => setError("Group not found or data not yet exported."));
    fetchGroups({ sort: "name" }).then(setAllGroups).catch(() => {});
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-zinc-400 mb-4">{error}</p>
        <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">← Back to directory</Link>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4 animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-32" />
        <div className="h-4 bg-zinc-800 rounded w-64" />
        <div className="h-4 bg-zinc-800 rounded w-48" />
      </div>
    );
  }

  // Prev / next in alphabetical order
  const idx = allGroups.findIndex((g) => g.slug === slug);
  const prev = idx > 0 ? allGroups[idx - 1] : null;
  const next = idx >= 0 && idx < allGroups.length - 1 ? allGroups[idx + 1] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-6 inline-block">
        ← All groups
      </Link>

      {/* ---- Header ---- */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-white">{group.name}</h1>
          {group.last_seen && (
            <span className="text-sm text-zinc-500">Last seen {group.last_seen}</span>
          )}
        </div>

        {/* Aliases */}
        <AliasBar aliases={group.aliases} />

        {/* Affiliation line */}
        <p className="text-sm text-zinc-400">
          {group.actor_type && <span className="capitalize">{group.actor_type}</span>}
          {group.actor_type && group.affiliation && <span className="text-zinc-600"> · </span>}
          {group.affiliation && (
            <AffiliationBadge affiliation={group.affiliation} confidence={group.affiliation_confidence} />
          )}
        </p>

        {/* Timeline */}
        {(group.first_seen || group.first_described) && (
          <p className="text-sm text-zinc-500">
            {group.first_seen && <span>First seen {group.first_seen}</span>}
            {group.first_seen && group.first_described && <span className="text-zinc-700"> · </span>}
            {group.first_described && <span>First reported {group.first_described}</span>}
          </p>
        )}

        {/* Target sectors */}
        {group.target_sectors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {group.target_sectors.map((s) => (
              <span key={s} className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Target regions */}
        {group.target_regions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {group.target_regions.map((r) => (
              <span key={r} className="px-2 py-0.5 rounded text-xs bg-zinc-800/50 text-zinc-500 border border-zinc-800">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ---- Tabs ---- */}
      <TabNavigation slug={slug} />

      <div className="pt-6">
        <TabContent group={group} />
      </div>

      {/* ---- Prev / Next ---- */}
      <div className="flex justify-between mt-12 pt-6 border-t border-zinc-800 text-sm">
        {prev ? (
          <Link href={`/group/${prev.slug}`} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            ← {prev.name}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/group/${next.slug}`} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            {next.name} →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function GroupDetailClient() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6">
          <span className="text-2xl font-bold leading-none text-white shrink-0" style={{ fontFamily: "var(--font-brand)" }}>
            pandatracker
          </span>
          <nav className="flex items-center gap-4 text-sm text-zinc-400 mt-1.5">
            <Link href="/" className="hover:text-zinc-200 transition-colors">APT Directory</Link>
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
        <GroupProfileInner slug={slug} />
      </Suspense>
    </div>
  );
}
