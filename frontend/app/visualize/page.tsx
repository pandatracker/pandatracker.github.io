"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGraph, GraphData, GraphNode } from "@/lib/api";
import SearchBar from "@/components/SearchBar";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const ORG_COLOR = "#ef4444";
const UNIT_COLOR = "#f97316";
const GROUP_COLOR = "#60a5fa";
const TOOL_EDGE_COLOR = "#c084fc";
const TECH_EDGE_COLOR = "#34d399";
const MIN_LABEL_PX = 2.5;

type EdgeMode = "software" | "techniques";

const CONFIDENCE_DASH: Record<string, number[]> = {
  high: [],
  likely: [6, 3],
  suspected: [3, 4]
};

// ---------------------------------------------------------------------------
// Module-level position cache
// ---------------------------------------------------------------------------

const nodePositionCache = new Map<string, { x: number; y: number }>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolInfo {
  name: string;
  software_id: string | null;
  software_url: string | null;
}

interface MergedToolLink {
  source: GraphNode & { x?: number; y?: number; id: string };
  target: GraphNode & { x?: number; y?: number; id: string };
  edge_type: "shared_tool" | "shared_technique";
  tools: ToolInfo[];
}

interface HierarchyLink {
  source: GraphNode & { x?: number; y?: number };
  target: GraphNode & { x?: number; y?: number };
  edge_type: "org_hierarchy";
  confidence: string | null;
}

type ResolvedLink = MergedToolLink | HierarchyLink;

function isTool(l: ResolvedLink): l is MergedToolLink {
  return l.edge_type === "shared_tool" || l.edge_type === "shared_technique";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Smarter match: word-boundary start; if query ends in a digit, require no trailing digit.
function matchesQuery(text: string, q: string): boolean {
  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suffix = /\d$/.test(q) ? "(?!\\d)" : "";
    return new RegExp(`\\b${escaped}${suffix}`, "i").test(text);
  } catch {
    return text.toLowerCase().includes(q.toLowerCase());
  }
}

function nodeColor(n: GraphNode) {
  return n.node_type === "org" ? ORG_COLOR : n.node_type === "unit" ? UNIT_COLOR : GROUP_COLOR;
}
function nodeRadius(n: GraphNode) {
  return n.node_type === "org" ? 16 : n.node_type === "unit" ? 9 : 6;
}

// Deterministic hash so initial positions are stable across reloads
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (((h << 5) + h) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function computeInitialPositions(data: GraphData): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  const orgs = data.nodes.filter((n) => n.node_type === "org");
  // Build parent → children map from hierarchy edges
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const e of data.edges) {
    if (e.edge_type !== "org_hierarchy") continue;
    parentOf.set(e.target, e.source);
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
  }

  // Walk up to find top-level org for any node
  function rootOrgPos(id: string): { x: number; y: number } | null {
    let cur = id;
    for (let i = 0; i < 6; i++) {
      const p = parentOf.get(cur);
      if (!p) break;
      cur = p;
    }
    return pos.get(cur) ?? null;
  }

  // Place orgs evenly around a circle
  const orgRadius = 320;
  orgs.forEach((org, i) => {
    const angle = (2 * Math.PI * i) / orgs.length - Math.PI / 2;
    pos.set(org.id, { x: orgRadius * Math.cos(angle), y: orgRadius * Math.sin(angle) });
  });

  // Recursively place children around their parent
  function placeChildren(parentId: string, parentPos: { x: number; y: number }, depth: number) {
    const children = childrenOf.get(parentId) ?? [];
    const r = depth === 1 ? 130 : 75;
    children.forEach((childId, ci) => {
      if (pos.has(childId)) return;
      const angle = (2 * Math.PI * ci) / Math.max(children.length, 1)
        + (hashId(childId) % 40 - 20) * (Math.PI / 180);
      const childPos = { x: parentPos.x + r * Math.cos(angle), y: parentPos.y + r * Math.sin(angle) };
      pos.set(childId, childPos);
      placeChildren(childId, childPos, depth + 1);
    });
  }
  for (const org of orgs) placeChildren(org.id, pos.get(org.id)!, 1);

  // Nodes not in hierarchy: try affiliation match, else scatter
  for (const n of data.nodes) {
    if (pos.has(n.id)) continue;
    let placed = false;
    if (n.affiliation) {
      for (const org of orgs) {
        if (n.affiliation.some((a) =>
          a.toLowerCase().includes(org.label.toLowerCase()) ||
          org.label.toLowerCase().includes(a.toLowerCase())
        )) {
          const orgPos = pos.get(org.id)!;
          const angle = (hashId(n.id) % 360) * (Math.PI / 180);
          pos.set(n.id, { x: orgPos.x + 70 * Math.cos(angle), y: orgPos.y + 70 * Math.sin(angle) });
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      const rp = rootOrgPos(n.id);
      const base = rp ?? { x: 0, y: 0 };
      const angle = (hashId(n.id) % 360) * (Math.PI / 180);
      pos.set(n.id, { x: base.x + 80 * Math.cos(angle), y: base.y + 80 * Math.sin(angle) });
    }
  }

  return pos;
}

function buildSharedEdges(rawData: GraphData, mode: EdgeMode): object[] {
  const edgeType = mode === "software" ? "shared_tool" : "shared_technique";
  const byPair = new Map<string, ToolInfo[]>();
  for (const e of rawData.edges) {
    if (e.edge_type !== edgeType) continue;
    const key = [e.source, e.target].sort().join("\0");
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key)!.push({
      name: e.tool ?? "Unknown",
      software_id: e.software_id,
      software_url: e.software_url
    });
  }
  return Array.from(byPair.entries()).map(([key, tools]) => {
    const [src, tgt] = key.split("\0");
    return { source: src, target: tgt, edge_type: edgeType, tools };
  });
}

// ---------------------------------------------------------------------------
// Node panel
// ---------------------------------------------------------------------------

function NodePanel({ node, rawData, edgeMode, onClose }: { node: GraphNode; rawData: GraphData | null; edgeMode: EdgeMode; onClose: () => void }) {
  const sharedItems = useMemo(() => {
    if (!rawData || node.node_type !== "group") return [];

    const edgeType = edgeMode === "software" ? "shared_tool" : "shared_technique";
    const nodeMap = new Map(rawData.nodes.map((n) => [n.id, n]));
    const byItem = new Map<string, { groups: string[]; url: string | null }>();

    for (const edge of rawData.edges) {
      if (edge.edge_type !== edgeType) continue;
      if (edge.source !== node.id && edge.target !== node.id) continue;

      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = nodeMap.get(otherId);
      const name = edge.tool ?? "Unknown";

      if (!byItem.has(name)) byItem.set(name, { groups: [], url: edge.software_url });
      if (other) byItem.get(name)!.groups.push(other.label);
    }

    return Array.from(byItem.entries());
  }, [rawData, node, edgeMode]);

  return (
    <div className="absolute top-4 right-4 w-72 bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-xl z-20 max-h-[80vh] overflow-y-auto">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {node.node_type === "org" ? "Organisation" : node.node_type === "unit" ? "Unit" : "APT Group"}
        </span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">×</button>
      </div>

      <h2 className="text-base font-bold text-white mb-2">{node.label}</h2>

      {node.node_type === "group" && node.aliases && node.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {node.aliases.map((a) => (
            <span key={a} className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">{a}</span>
          ))}
        </div>
      )}

      {node.affiliation && node.affiliation.length > 0 && node.node_type !== "org" && (
        <p className="text-xs text-zinc-400 mb-1">
          <span className="text-zinc-500">Affiliation: </span>
          {node.affiliation.join(", ")}
        </p>
      )}

      {node.affiliation_confidence && (
        <p className="text-xs text-zinc-400 mb-3">
          <span className="text-zinc-500">Confidence: </span>
          {node.affiliation_confidence}
        </p>
      )}

      {sharedItems.length > 0 && (
        <div className="mt-1 mb-3 border-t border-zinc-800 pt-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Shared ATT&CK {edgeMode === "software" ? "Tools" : "Techniques"}
          </p>
          <div className="space-y-2">
            {sharedItems.map(([name, { groups, url }]) => (
              <div key={name}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs font-medium hover:underline ${edgeMode === "software" ? "text-purple-300 hover:text-purple-100" : "text-emerald-300 hover:text-emerald-100"}`}
                  >
                    {name} ↗
                  </a>
                ) : (
                  <p className={`text-xs font-medium ${edgeMode === "software" ? "text-purple-300" : "text-emerald-300"}`}>{name}</p>
                )}
                <p className="text-xs text-zinc-500">shared with {groups.join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {node.slug && (
        <Link
          href={`/group/${node.slug}`}
          className="block text-center text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          View profile →
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link panel
// ---------------------------------------------------------------------------

function LinkPanel({ link, onClose }: { link: MergedToolLink; onClose: () => void }) {
  const src = typeof link.source === "object" ? link.source : null;
  const tgt = typeof link.target === "object" ? link.target : null;

  return (
    <div className="absolute top-4 right-4 w-72 bg-zinc-900 border border-purple-800/60 rounded-xl p-4 shadow-xl z-20 max-h-[80vh] overflow-y-auto">
      <div className="flex items-start justify-between mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wider ${link.edge_type === "shared_technique" ? "text-emerald-400" : "text-purple-400"}`}>
          {link.edge_type === "shared_technique" ? "Shared Techniques" : "Shared Tools"} · {link.tools.length}
        </span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">×</button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {([src, tgt].flatMap((n) => (n ? [n] : [])) as (GraphNode & { x?: number; y?: number })[]).map((n, i, arr) => (
          <span key={n.id} className="flex items-center gap-2">
            {n.slug ? (
              <Link href={`/group/${n.slug}`} className="text-sm font-bold text-blue-300 hover:underline">
                {n.label}
              </Link>
            ) : (
              <span className="text-sm font-bold text-blue-300">{n.label}</span>
            )}
            {i < arr.length - 1 && <span className="text-zinc-600 text-xs">↔</span>}
          </span>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-3 space-y-2">
        {link.tools.map((t) => {
          const isTech = link.edge_type === "shared_technique";
          return (
            <div key={t.software_id ?? t.name} className="flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${isTech ? "text-emerald-300" : "text-purple-300"}`}>{t.name}</span>
              {t.software_url && (
                <a
                  href={t.software_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 text-xs px-2 py-0.5 rounded transition-colors ${isTech ? "bg-emerald-800/50 hover:bg-emerald-700/60 text-emerald-200" : "bg-purple-800/50 hover:bg-purple-700/60 text-purple-200"}`}
                >
                  ATT&CK ↗
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend({ edgeMode }: { edgeMode: EdgeMode }) {
  const sharedEdgeColor = edgeMode === "software" ? TOOL_EDGE_COLOR : TECH_EDGE_COLOR;
  const sharedEdgeLabel = edgeMode === "software" ? "Shared tools" : "Shared techniques";

  return (
    <div className="absolute bottom-4 left-4 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 text-xs space-y-2 z-20">
      <p className="font-semibold text-zinc-400 uppercase tracking-wider mb-1">Legend</p>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ background: ORG_COLOR }} />
        <span className="text-zinc-300">Top-level org</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ background: UNIT_COLOR }} />
        <span className="text-zinc-300">Affiliated unit</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full" style={{ background: GROUP_COLOR }} />
        <span className="text-zinc-300">APT group</span>
      </div>

      <div className="border-t border-zinc-800 my-1" />

      <div className="flex items-center gap-2">
        <svg width="24" height="8">
          <line x1="0" y1="4" x2="24" y2="4" stroke="#71717a" strokeWidth="1.5" />
        </svg>
        <span className="text-zinc-300">Confirmed</span>
      </div>

      <div className="flex items-center gap-2">
        <svg width="24" height="8">
          <line x1="0" y1="4" x2="24" y2="4" stroke="#71717a" strokeWidth="1.5" strokeDasharray="6,3" />
        </svg>
        <span className="text-zinc-300">Likely</span>
      </div>

      <div className="flex items-center gap-2">
        <svg width="24" height="8">
          <line x1="0" y1="4" x2="24" y2="4" stroke="#71717a" strokeWidth="1.5" strokeDasharray="3,4" />
        </svg>
        <span className="text-zinc-300">Suspected</span>
      </div>

      <div className="flex items-center gap-2">
        <svg width="24" height="8">
          <line x1="0" y1="4" x2="24" y2="4" stroke={sharedEdgeColor} strokeWidth="1.5" strokeDasharray="4,2" />
        </svg>
        <span className="text-zinc-300">{sharedEdgeLabel} (select node)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphRef = any;

export default function VisualizePage() {
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<MergedToolLink | null>(null);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("software");
  const [attackOnly, setMitreOnly] = useState(true);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphRef>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"groups" | "tools">("groups");

  const selectedNodeRef  = useRef(selectedNode);
  const selectedLinkRef  = useRef(selectedLink);
  const neighborsRef     = useRef<Set<string>>(new Set());
  const searchQueryRef   = useRef(searchQuery);
  const matchingNodesRef = useRef<Set<string>>(new Set());

  selectedNodeRef.current = selectedNode;
  selectedLinkRef.current = selectedLink;
  searchQueryRef.current  = searchQuery;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new ResizeObserver(() =>
      setDims({ width: el.clientWidth, height: el.clientHeight })
    );

    obs.observe(el);

    setDims({ width: el.clientWidth, height: el.clientHeight });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    fetchGraph()
      .then(setRawData)
      .catch(() => setError("Failed to load graph. Is the API running?"))
      .finally(() => setLoading(false));
  }, []);

  // Rebuild matching nodes set when search query or mode changes.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !rawData) {
      matchingNodesRef.current = new Set();
      return;
    }
    const s = new Set<string>();
    if (searchMode === "groups") {
      for (const n of rawData.nodes) {
        if (matchesQuery(n.label, q) || n.aliases?.some((a) => matchesQuery(a, q))) s.add(n.id);
      }
    } else {
      for (const e of rawData.edges) {
        if (e.edge_type !== "shared_tool" || !e.tool) continue;
        if (matchesQuery(e.tool, q)) { s.add(e.source); s.add(e.target); }
      }
    }
    matchingNodesRef.current = s;
  }, [searchQuery, searchMode, rawData]);

  type NodeHint = { kind: "node"; node: GraphNode; matchedAlias: string | null };
  type ToolHint = { kind: "tool"; name: string; url: string | null; groupCount: number };
  type Hint = NodeHint | ToolHint;

  const hints = useMemo((): Hint[] => {
    const q = searchQuery.trim();
    if (!q || !rawData) return [];

    if (searchMode === "groups") {
      return rawData.nodes
        .flatMap((n): Hint[] => {
          if (matchesQuery(n.label, q)) return [{ kind: "node", node: n, matchedAlias: null }];
          const alias = n.aliases?.find((a) => matchesQuery(a, q));
          if (alias) return [{ kind: "node", node: n, matchedAlias: alias }];
          return [];
        })
        .slice(0, 8);
    } else {
      const toolMap = new Map<string, { url: string | null; groups: Set<string> }>();
      for (const e of rawData.edges) {
        if (e.edge_type !== "shared_tool" || !e.tool) continue;
        if (!matchesQuery(e.tool, q)) continue;
        if (!toolMap.has(e.tool)) toolMap.set(e.tool, { url: e.software_url, groups: new Set() });
        toolMap.get(e.tool)!.groups.add(e.source);
        toolMap.get(e.tool)!.groups.add(e.target);
      }
      return Array.from(toolMap.entries())
        .map(([name, { url, groups }]): Hint => ({ kind: "tool", name, url, groupCount: groups.size }))
        .slice(0, 8);
    }
  }, [searchQuery, searchMode, rawData]);

  const [inputFocused, setInputFocused] = useState(false);

  const handleHintClick = useCallback((hint: { kind: "node"; node: GraphNode } | { kind: "tool"; name: string }) => {
    setSelectedNode(null);
    setSelectedLink(null);
    setInputFocused(false);
    if (hint.kind === "node") {
      setSearchQuery(hint.node.label);
      const liveNode = (stableGraphDataRef.current.nodes as Array<GraphNode & { x?: number; y?: number }>)
        .find((n) => n.id === hint.node.id);
      if (liveNode?.x != null && liveNode?.y != null) {
        graphRef.current?.centerAt(liveNode.x, liveNode.y, 600);
        graphRef.current?.zoom(2.5, 600);
      }
    } else {
      setSearchQuery(hint.name);
    }
  }, []);

  // Rebuild the neighbour set whenever the selected node or active edge mode changes.
  // Only include edges that are currently visible (hierarchy + active mode's shared edges).
  // paintNode reads this ref so the canvas always paints the correct highlight state.
  useEffect(() => {
    if (!selectedNode || !rawData) {
      neighborsRef.current = new Set();
      return;
    }
    const activeEdgeType = edgeMode === "software" ? "shared_tool" : "shared_technique";
    const s = new Set<string>();
    for (const e of rawData.edges) {
      if (e.edge_type !== "org_hierarchy" && e.edge_type !== activeEdgeType) continue;
      if (e.source === selectedNode.id) s.add(e.target);
      if (e.target === selectedNode.id) s.add(e.source);
    }
    neighborsRef.current = s;
  }, [selectedNode, rawData, edgeMode]);

  const stableGraphData = useMemo(() => {
    if (!rawData) return { nodes: [], links: [] };

    // Filter out groups without MITRE entries when attackOnly is on.
    const hiddenIds = new Set<string>();
    if (attackOnly) {
      for (const n of rawData.nodes) {
        if (n.node_type === "group" && !n.attack_group_id) hiddenIds.add(n.id);
      }
    }

    const filteredData: GraphData = {
      nodes: rawData.nodes.filter((n) => !hiddenIds.has(n.id)),
      edges: rawData.edges.filter(
        (e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target)
      ),
    };

    // Compute cluster-based initial positions for uncached nodes
    const initPos = computeInitialPositions(filteredData);

    const nodes = filteredData.nodes.map((n) => {
      const cached = nodePositionCache.get(n.id);
      if (cached) {
        return { ...n, x: cached.x, y: cached.y, fx: cached.x, fy: cached.y };
      }
      const init = initPos.get(n.id);
      if (init) return { ...n, x: init.x, y: init.y };
      return { ...n };
    });

    const hierLinks = filteredData.edges
      .filter((e) => e.edge_type === "org_hierarchy")
      .map((e) => ({
        source: e.source,
        target: e.target,
        edge_type: "org_hierarchy",
        confidence: e.confidence
      }));

    return {
      nodes,
      links: [...hierLinks, ...buildSharedEdges(filteredData, edgeMode)]
    };
  // layoutVersion intentionally included so Reset clears cached positions and recomputes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, edgeMode, attackOnly, layoutVersion]);

  const stableGraphDataRef = useRef(stableGraphData);
  stableGraphDataRef.current = stableGraphData;

  const savePositions = useCallback(() => {
    for (const node of stableGraphDataRef.current.nodes as Array<{
      id: string;
      x?: number;
      y?: number;
    }>) {
      if (node.x != null && node.y != null) {
        nodePositionCache.set(node.id, { x: node.x, y: node.y });
      }
    }
  }, []);

  useEffect(() => {
    return savePositions;
  }, [savePositions]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !rawData) return;

    fg.d3Force("link")?.distance((l: { edge_type: string }) =>
      l.edge_type === "org_hierarchy" ? 85 : 280
    );

    fg.d3Force("link")?.strength((l: { edge_type: string }) =>
      l.edge_type === "org_hierarchy" ? 0.7 : 0
    );

    fg.d3Force("charge")?.strength((n: { node_type: string }) =>
      n.node_type === "org" ? -600 : n.node_type === "unit" ? -250 : -160
    );
  }, [rawData]);

  const paintNode = useCallback(
    (
      node: GraphNode & { x?: number; y?: number },
      ctx: CanvasRenderingContext2D,
      globalScale: number
    ) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node);
      const selNode = selectedNodeRef.current;
      const selLink = selectedLinkRef.current;
      const q = searchQueryRef.current.trim();
      const searchActive = q.length > 0;
      const isSelectedOrNeighbor = node.id === selNode?.id || neighborsRef.current.has(node.id);

      let dimmed: boolean;
      if (selLink !== null) {
        // Link selected: only the two endpoint nodes stay lit.
        dimmed = node.id !== selLink.source?.id && node.id !== selLink.target?.id;
      } else if (selNode !== null) {
        dimmed = !isSelectedOrNeighbor;
      } else if (searchActive) {
        dimmed = !matchingNodesRef.current.has(node.id);
      } else {
        dimmed = false;
      }

      if (dimmed) ctx.globalAlpha = 0.2;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = nodeColor(node);
      ctx.fill();

      if (selNode?.id === node.id) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      const basePx = node.node_type === "org" ? 11 : node.node_type === "unit" ? 9 : 8;
      const fontSize = Math.max(MIN_LABEL_PX, basePx / globalScale);

      ctx.font = `${node.node_type === "org" ? "bold " : ""}${fontSize}px sans-serif`;
      ctx.fillStyle = "#e4e4e7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.label, x, y + r + fontSize * 0.9);

      ctx.globalAlpha = 1;
    },
    []
  );

  const paintPointerArea = useCallback(
    (node: object, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode & { x?: number; y?: number };
      const selNode = selectedNodeRef.current;
      const selLink = selectedLinkRef.current;
      const q = searchQueryRef.current.trim();
      const searchActive = q.length > 0;
      const isSelectedOrNeighbor = n.id === selNode?.id || neighborsRef.current.has(n.id);

      let dimmed: boolean;
      if (selLink !== null) {
        dimmed = n.id !== selLink.source?.id && n.id !== selLink.target?.id;
      } else if (selNode !== null) {
        dimmed = !isSelectedOrNeighbor;
      } else if (searchActive) {
        dimmed = !matchingNodesRef.current.has(n.id);
      } else {
        dimmed = false;
      }

      if (dimmed) return;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, nodeRadius(n) + 4, 0, 2 * Math.PI);
      ctx.fill();
    },
    []
  );

  const paintLinkPointerArea = useCallback(
    (rawLink: object, color: string, ctx: CanvasRenderingContext2D) => {
      const link = rawLink as ResolvedLink;
      const selNode = selectedNodeRef.current;
      const sel = selectedLinkRef.current;

      if (isTool(link)) {
        const isThisSelected = sel !== null
          && link.source?.id === sel.source?.id
          && link.target?.id === sel.target?.id;
        if (!isThisSelected) {
          if (!selNode) return;
          if (link.source?.id !== selNode.id && link.target?.id !== selNode.id) return;
        }
      } else {
        const connected = selNode !== null
          && (link.source?.id === selNode.id || link.target?.id === selNode.id);
        const linkDimmed = sel !== null || (selNode !== null && !connected);
        if (linkDimmed) return;
      }

      const sx = link.source.x ?? 0;
      const sy = link.source.y ?? 0;
      const tx = link.target.x ?? 0;
      const ty = link.target.y ?? 0;

      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    },
    []
  );

  const paintLink = useCallback(
    (rawLink: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = rawLink as ResolvedLink;

      const selNode = selectedNodeRef.current;

      if (isTool(link)) {
        const selLinkNow = selectedLinkRef.current;
        const isThisSelected = selLinkNow !== null
          && link.source?.id === selLinkNow.source?.id
          && link.target?.id === selLinkNow.target?.id;
        if (!isThisSelected) {
          if (!selNode) return;
          if (link.source?.id !== selNode.id && link.target?.id !== selNode.id) return;
        }
      }

      const sx = link.source.x ?? 0;
      const sy = link.source.y ?? 0;
      const tx = link.target.x ?? 0;
      const ty = link.target.y ?? 0;

      const sel = selectedLinkRef.current;
      const connected = selNode !== null
        && (link.source?.id === selNode.id || link.target?.id === selNode.id);

      let linkDimmed: boolean;
      if (sel !== null) {
        // Link selected: dim all hierarchy links; tool links are already filtered above.
        linkDimmed = !isTool(link);
      } else {
        linkDimmed = selNode !== null && !connected;
      }

      if (linkDimmed) ctx.globalAlpha = 0.15;

      const isSelected =
        isTool(link) &&
        sel !== null &&
        link.source?.id === sel.source?.id &&
        link.target?.id === sel.target?.id;

      if (isTool(link)) {
        const isTechEdge = link.edge_type === "shared_technique";
        const baseColor = isTechEdge ? TECH_EDGE_COLOR : TOOL_EDGE_COLOR;
        const selectedColor = isTechEdge ? "#6ee7b7" : "#e879f9";
        ctx.strokeStyle = isSelected ? selectedColor : baseColor;
        ctx.lineWidth = (isSelected ? 2.5 : 1.5) / globalScale;
        ctx.setLineDash([4 / globalScale, 2 / globalScale]);
      } else {
        ctx.strokeStyle = connected ? "#a1a1aa" : "#52525b";
        ctx.lineWidth = (connected ? 2 : 1.5) / globalScale;

        const rawDash = CONFIDENCE_DASH[(link as HierarchyLink).confidence ?? "high"] ?? [];
        ctx.setLineDash(rawDash.map((v) => v / globalScale));
      }

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      if (isTool(link) && globalScale >= 0.7) {
        const tools = link.tools;
        const isTechEdge3 = link.edge_type === "shared_technique";
        const label = tools.length === 1
          ? tools[0].name
          : `${tools.length} ${isTechEdge3 ? "techniques" : "tools"}`;

        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;

        const labelPx = Math.max(MIN_LABEL_PX, 7 / globalScale);

        ctx.font = `${labelPx}px sans-serif`;

        const tw = ctx.measureText(label).width;
        const pad = 3 / globalScale;

        ctx.fillStyle = "rgba(39,39,42,0.95)";
        ctx.fillRect(mx - tw / 2 - pad, my - labelPx * 0.8, tw + pad * 2, labelPx * 1.6);

        const isTechEdge2 = link.edge_type === "shared_technique";
        ctx.fillStyle = isSelected
          ? (isTechEdge2 ? "#6ee7b7" : "#f0abfc")
          : (isTechEdge2 ? "#6ee7b7" : "#d8b4fe");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, mx, my);
      }
    },
    []
  );

  const handleNodeClick = useCallback((node: object) => {
    const n = node as GraphNode;

    setSelectedLink(null);

    setSelectedNode((prev) => (prev?.id === n.id ? null : n));
  }, []);

  const handleLinkClick = useCallback((rawLink: object) => {
    const link = rawLink as ResolvedLink;
    if (!isTool(link)) return;
    // Do NOT clear selectedNode — tool edges are only drawn when a node is selected,
    // so clearing it would make them disappear before the link panel can show.
    setSelectedLink((prev) =>
      prev?.source?.id === link.source?.id && prev?.target?.id === link.target?.id
        ? null
        : link
    );
  }, []);

  const closePanel = useCallback(() => {
    setSelectedNode(null);
    setSelectedLink(null);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/90 sticky top-0 z-40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6">
          <span
            className="text-2xl font-bold leading-none text-white shrink-0"
            style={{ fontFamily: "var(--font-brand)" }}
          >
            pandatracker
          </span>

          <nav className="flex items-center gap-4 text-sm text-zinc-400 mt-1.5">
            <Link href="/dashboard" className="hover:text-zinc-200 transition-colors">Dashboard</Link>
            <Link href="/" className="hover:text-zinc-200 transition-colors">APT Directory</Link>
            <Link href="/visualize" className="text-zinc-200 font-medium">Visualize</Link>
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

      <div className="flex-1 relative" ref={containerRef}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
            Loading graph…
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
              {error}
            </p>
          </div>
        )}

        {!loading && !error && (
          <ForceGraph2D
            ref={graphRef}
            width={dims.width}
            height={dims.height}
            graphData={stableGraphData as { nodes: object[]; links: object[] }}
            nodeId="id"
            warmupTicks={0}
            cooldownTicks={200}
            nodeCanvasObject={paintNode as (
              node: object,
              ctx: CanvasRenderingContext2D,
              globalScale: number
            ) => void}
            nodeCanvasObjectMode={() => "replace"}
            nodePointerAreaPaint={paintPointerArea}
            linkCanvasObject={paintLink}
            linkCanvasObjectMode={() => "replace"}
            linkPointerAreaPaint={paintLinkPointerArea}
            onNodeClick={handleNodeClick}
            onLinkClick={handleLinkClick}
            onBackgroundClick={closePanel}
            nodeLabel={(n: object) => (n as GraphNode).label}
            backgroundColor="#09090b"
            linkDirectionalParticles={0}
            d3AlphaDecay={0.04}
            d3VelocityDecay={0.4}
            onEngineStop={savePositions}
            onNodeDragEnd={(node: object) => {
              const n = node as GraphNode & {
                fx?: number;
                fy?: number;
                x?: number;
                y?: number;
              };

              n.fx = n.x;
              n.fy = n.y;

              if (n.id && n.x != null && n.y != null) {
                nodePositionCache.set(n.id as string, { x: n.x, y: n.y });
              }
            }}
          />
        )}

        {selectedLink && (
          <LinkPanel link={selectedLink} onClose={closePanel} />
        )}

        {selectedNode && !selectedLink && (
          <NodePanel node={selectedNode} rawData={rawData} edgeMode={edgeMode} onClose={closePanel} />
        )}

        {!loading && !error && (
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Edge mode toggle */}
              <div className="flex items-center bg-zinc-900/95 border border-zinc-700 rounded-lg overflow-hidden text-[10px]">
                <button
                  onClick={() => { setEdgeMode("software"); setSelectedLink(null); }}
                  className={`px-3 py-1.5 font-medium transition-colors ${edgeMode === "software" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Software
                </button>
                <button
                  onClick={() => { setEdgeMode("techniques"); setSelectedLink(null); }}
                  className={`px-3 py-1.5 font-medium transition-colors ${edgeMode === "techniques" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Techniques
                </button>
              </div>

              {/* Reset layout */}
              <button
                onClick={() => {
                  nodePositionCache.clear();
                  for (const n of (stableGraphDataRef.current.nodes as Array<{ fx?: number; fy?: number }>) ) {
                    delete n.fx; delete n.fy;
                  }
                  setSelectedNode(null);
                  setSelectedLink(null);
                  setLayoutVersion((v) => v + 1);
                  setTimeout(() => graphRef.current?.d3ReheatSimulation(), 50);
                }}
                className="px-3 py-1.5 text-[10px] font-medium bg-zinc-900/95 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                Reset layout
              </button>

              {/* MITRE only toggle */}
              <label className="flex items-center gap-1.5 bg-zinc-900/95 border border-zinc-700 rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={attackOnly}
                  onChange={(e) => { setMitreOnly(e.target.checked); setSelectedNode(null); setSelectedLink(null); }}
                  className="w-3 h-3 accent-blue-500"
                />
                <span className="text-[10px] text-zinc-400">Groups with ATT&CK entry only</span>
              </label>
            </div>

            <div className="relative">
              {/* Combined mode + search bar */}
              <div className="flex items-center bg-zinc-900/95 border border-zinc-700 rounded-lg overflow-visible focus-within:border-zinc-500 transition-colors">
                <select
                  value={searchMode}
                  onChange={(e) => {
                    setSearchMode(e.target.value as "groups" | "tools");
                    setSearchQuery("");
                    setSelectedNode(null);
                    setSelectedLink(null);
                  }}
                  className="bg-transparent border-r border-zinc-700 text-[10px] text-zinc-400 pl-2.5 pr-5 py-1.5 focus:outline-none appearance-none cursor-pointer shrink-0"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center" }}
                >
                  <option value="groups">Groups</option>
                  <option value="tools">Tools</option>
                </select>

                <div className="relative flex items-center">
                  <svg className="absolute left-2 w-3.5 h-3.5 text-zinc-500 pointer-events-none shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedNode(null);
                      setSelectedLink(null);
                    }}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                    placeholder={searchMode === "groups" ? "Search groups…" : "Search tools…"}
                    className="w-44 pl-7 pr-6 py-1.5 text-xs bg-transparent text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-sm leading-none"
                    >×</button>
                  )}
                </div>
              </div>

              {inputFocused && hints.length > 0 && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                  {hints.map((hint) => hint.kind === "node" ? (
                    <button
                      key={hint.node.id}
                      onMouseDown={() => handleHintClick(hint)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: hint.node.node_type === "org" ? "#ef4444" : hint.node.node_type === "unit" ? "#f97316" : "#60a5fa" }}
                      />
                      <span className="text-xs text-zinc-200 truncate">{hint.node.label}</span>
                      {hint.matchedAlias && (
                        <span className="text-[10px] text-zinc-500 truncate italic">aka {hint.matchedAlias}</span>
                      )}
                      <span className="ml-auto text-[10px] text-zinc-600 shrink-0">{hint.node.node_type}</span>
                    </button>
                  ) : (
                    <button
                      key={hint.name}
                      onMouseDown={() => handleHintClick(hint)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                    >
                      <span className="w-2 h-2 rounded shrink-0 bg-purple-500/70" />
                      <span className="text-xs text-zinc-200 truncate">{hint.name}</span>
                      <span className="ml-auto text-[10px] text-zinc-600 shrink-0">{hint.groupCount} groups</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && !error && <Legend edgeMode={edgeMode} />}
      </div>
    </div>
  );
}
