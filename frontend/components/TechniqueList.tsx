"use client";

import { useState } from "react";
import { AttackTechniqueItem, AttackSoftwareItem } from "@/lib/api";

// ---------------------------------------------------------------------------
// MITRE text → safe HTML
// Converts [text](url) markdown links to <a> tags, strips (Citation: ...)
// markers, and leaves existing HTML (e.g. <code>) intact for rendering.
// ---------------------------------------------------------------------------

function attackToHtml(text: string): string {
  return text
    // Strip markdown links, keep only the display text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Render citations as dimmed inline text
    .replace(
      /\(Citation:\s*([^)]+)\)/g,
      '<span class="text-zinc-600 text-xs"> [$1]</span>'
    )
    .trim();
}

function MitreHtml({ html, className }: { html: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: attackToHtml(html) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Collapsible software description
// ---------------------------------------------------------------------------

function SoftwareRow({ sw }: { sw: AttackSoftwareItem }) {
  const [expanded, setExpanded] = useState(false);
  const desc = sw.description ?? "";
  const long = desc.length > 300;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {sw.url ? (
          <a href={sw.url} target="_blank" rel="noopener noreferrer"
            className="font-semibold text-blue-400 hover:text-blue-300">
            {sw.name}
          </a>
        ) : (
          <span className="font-semibold text-white">{sw.name}</span>
        )}
        <span className="text-xs text-zinc-600">{sw.software_id}</span>
        <span className="px-2 py-0.5 rounded text-xs border bg-zinc-800 text-zinc-400 border-zinc-700">
          {sw.software_type ?? "unknown"}
        </span>
      </div>
      {desc && (
        <div className="text-sm text-zinc-400 leading-relaxed attack-prose">
          <MitreHtml
            html={expanded || !long ? desc : desc.slice(0, 300) + "…"}
          />
          {long && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="block text-xs text-zinc-500 hover:text-zinc-300 mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single technique row
// ---------------------------------------------------------------------------

function TechniqueRow({ t }: { t: AttackTechniqueItem }) {
  return (
    <div className="px-4 py-3 bg-zinc-950">
      <div className="flex items-start gap-3">
        <span className="text-xs text-zinc-600 font-mono mt-0.5 shrink-0">
          {t.technique_id}
        </span>
        <div className="min-w-0 flex-1">
          {t.url ? (
            <a href={t.url} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium text-blue-400 hover:text-blue-300">
              {t.name}
            </a>
          ) : (
            <span className="text-sm font-medium text-zinc-200">{t.name}</span>
          )}
          {t.use_description && (
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed attack-prose">
              <MitreHtml html={t.use_description} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible tactic section
// ---------------------------------------------------------------------------

function TacticSection({
  tactic,
  techniques,
}: {
  tactic: string;
  techniques: AttackTechniqueItem[];
}) {
  const [open, setOpen] = useState(true);
  const label = tactic.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-zinc-200">{label}</span>
        <span className="text-xs text-zinc-500">{open ? "▲" : "▼"} {techniques.length}</span>
      </button>

      {open && (
        <div className="divide-y divide-zinc-800/50">
          {techniques.map((t) => (
            <TechniqueRow key={t.technique_id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canonical MITRE ATT&CK tactic order
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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function TechniqueList({
  techniques,
  software,
  attackGroupId,
  attackGroupUrl,
}: {
  techniques: AttackTechniqueItem[];
  software: AttackSoftwareItem[];
  attackGroupId: string | null;
  attackGroupUrl: string | null;
}) {
  const [subTab, setSubTab] = useState<"techniques" | "software">("techniques");

  if (!attackGroupId) {
    return (
      <p className="text-zinc-500 text-sm">This group does not have an ATT&CK entry.</p>
    );
  }

  // Group techniques by primary tactic (first in comma-separated list)
  const byTactic = new Map<string, AttackTechniqueItem[]>();
  for (const t of techniques) {
    const primary = t.tactic ? t.tactic.split(", ")[0] : "unknown";
    if (!byTactic.has(primary)) byTactic.set(primary, []);
    byTactic.get(primary)!.push(t);
  }
  const tacticEntries = Array.from(byTactic.entries()).sort(tacticSort);

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-blue-500 text-blue-400"
        : "border-transparent text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <div className="space-y-6">
      {/* ATT&CK attribution notice */}
      <div className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
        ATT&CK® data © The MITRE Corporation. Reproduced with permission. See{" "}
        <a href="https://attack.mitre.org/resources/terms-of-use/" target="_blank"
          rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
          license
        </a>
        .
      </div>

      {/* Group link */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-500">ATT&CK group:</span>
        <span className="font-mono text-zinc-300">{attackGroupId}</span>
        {attackGroupUrl && (
          <a href={attackGroupUrl} target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300">
            View on ATT&CK ↗
          </a>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-zinc-800 flex gap-1">
        <button className={tabCls(subTab === "techniques")} onClick={() => setSubTab("techniques")}>
          Techniques ({techniques.length})
        </button>
        <button className={tabCls(subTab === "software")} onClick={() => setSubTab("software")}>
          Software ({software.length})
        </button>
      </div>

      {/* Techniques pane */}
      {subTab === "techniques" && (
        <div className="space-y-2">
          {tacticEntries.length > 0 ? (
            tacticEntries.map(([tactic, techs]) => (
              <TacticSection key={tactic} tactic={tactic} techniques={techs} />
            ))
          ) : (
            <p className="text-zinc-500 text-sm">No techniques recorded.</p>
          )}
        </div>
      )}

      {/* Software pane */}
      {subTab === "software" && (
        <div className="space-y-3">
          {software.length > 0 ? (
            software.map((sw) => <SoftwareRow key={sw.software_id} sw={sw} />)
          ) : (
            <p className="text-zinc-500 text-sm">No software recorded.</p>
          )}
        </div>
      )}
    </div>
  );
}
