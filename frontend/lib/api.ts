// ---------------------------------------------------------------------------
// Static data fetching — all data lives under /data/ in the public directory.
// ---------------------------------------------------------------------------

function base(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Group list
// ---------------------------------------------------------------------------

export interface GroupListItem {
  id: number;
  name: string;
  slug: string;
  actor_type: string | null;
  affiliation: string[] | null;
  affiliation_confidence: string | null;
  last_seen: string | null;
  first_seen: string | null;
  first_described: string | null;
  description: string | null;
  aliases: string[];
  target_sectors: string[];
  target_regions: string[];
  attack_group_id: string | null;
}

let _groupsCache: GroupListItem[] | null = null;

async function loadGroups(): Promise<GroupListItem[]> {
  if (_groupsCache) return _groupsCache;
  _groupsCache = await loadJson<GroupListItem[]>("/data/groups.json");
  return _groupsCache;
}

function naturalSortKey(name: string): [string, number] {
  const m = name.match(/^(.*?)(\d+)$/);
  return m ? [m[1].toLowerCase(), parseInt(m[2], 10)] : [name.toLowerCase(), 0];
}

function sortGroups(groups: GroupListItem[], sort: string): GroupListItem[] {
  const sorted = [...groups];
  if (sort === "last_seen") {
    sorted.sort((a, b) => (b.last_seen ?? "").localeCompare(a.last_seen ?? ""));
  } else if (sort === "last_seen_asc") {
    sorted.sort((a, b) => (a.last_seen ?? "").localeCompare(b.last_seen ?? ""));
  } else if (sort === "first_seen") {
    sorted.sort((a, b) => (b.first_seen ?? "").localeCompare(a.first_seen ?? ""));
  } else if (sort === "first_seen_asc") {
    sorted.sort((a, b) => (a.first_seen ?? "").localeCompare(b.first_seen ?? ""));
  } else {
    sorted.sort((a, b) => {
      const [apfx, anum] = naturalSortKey(a.name);
      const [bpfx, bnum] = naturalSortKey(b.name);
      if (apfx !== bpfx) return apfx.localeCompare(bpfx);
      return anum - bnum;
    });
  }
  return sorted;
}

export async function fetchGroups(params: {
  search?: string;
  affiliation?: string;
  actor_type?: string;
  sector?: string;
  sort?: string;
}): Promise<GroupListItem[]> {
  let groups = await loadGroups();

  const search = params.search?.toLowerCase().trim();
  if (search) {
    groups = groups.filter((g) =>
      g.name.toLowerCase().includes(search) ||
      g.aliases.some((a) => a.toLowerCase().includes(search)) ||
      g.description?.toLowerCase().includes(search)
    );
  }

  if (params.affiliation) {
    groups = groups.filter((g) =>
      g.affiliation?.some((a) =>
        a.toLowerCase().includes(params.affiliation!.toLowerCase())
      )
    );
  }

  if (params.actor_type) {
    groups = groups.filter((g) => g.actor_type === params.actor_type);
  }

  if (params.sector) {
    groups = groups.filter((g) => g.target_sectors.includes(params.sector!));
  }

  return sortGroups(groups, params.sort ?? "name");
}

// ---------------------------------------------------------------------------
// Group detail
// ---------------------------------------------------------------------------

export interface AliasDetail {
  name: string;
  vendor: string | null;
  source: string | null;
}

export interface AttributionEvidence {
  type: string | null;
  title: string | null;
  publisher: string | null;
  date: string | null;
  url: string | null;
}

export interface Reference {
  title: string | null;
  publisher: string | null;
  date: string | null;
  url: string | null;
  notes: string | null;
}

export interface CampaignSource {
  url: string | null;
  title: string | null;
  publisher: string | null;
}

export interface Campaign {
  name: string;
  year_published: string | null;
  description: string | null;
  target_sectors: string[];
  target_regions: string[];
  sources: CampaignSource[];
}

export interface AttackTechniqueItem {
  technique_id: string;
  name: string;
  tactic: string | null;
  description: string | null;
  url: string | null;
  use_description: string | null;
}

export interface AttackSoftwareItem {
  software_id: string;
  name: string;
  description: string | null;
  software_type: string | null;
  url: string | null;
}

export interface OtxPulseItem {
  pulse_id: string;
  name: string;
  description: string | null;
  author_name: string | null;
  created: string | null;
  modified: string | null;
  reference_urls: string[];
  targeted_countries: string[];
  industries: string[];
  tags: string[];
  indicator_count: number;
}

export interface MalwareEntry {
  name: string;
  software_id: string | null;
  software_type: string | null;
  url: string | null;
}

export interface GroupDetail {
  id: number;
  name: string;
  slug: string;
  actor_type: string | null;
  affiliation: string[] | null;
  affiliation_unit: string | null;
  affiliation_detail: string | null;
  affiliation_confidence: string | null;
  entity_name: string[] | null;
  last_seen: string | null;
  first_seen: string | null;
  first_described: string | null;
  description: string | null;
  attack_group_id: string | null;
  attack_group_url: string | null;
  news_queries: string[] | null;
  aliases: AliasDetail[];
  attribution_evidence: AttributionEvidence[];
  references: Reference[];
  target_sectors: string[];
  target_regions: string[];
  campaigns: Campaign[];
  attack_techniques: AttackTechniqueItem[];
  attack_software: AttackSoftwareItem[];
  otx_pulses: OtxPulseItem[];
}

interface GroupJson extends GroupDetail {
  relations?: GroupRelation[];
}

interface AttackJson {
  techniques: AttackTechniqueItem[];
  software: AttackSoftwareItem[];
}

const _groupDetailCache = new Map<string, GroupDetail>();

export async function fetchGroup(slug: string): Promise<GroupDetail> {
  if (_groupDetailCache.has(slug)) return _groupDetailCache.get(slug)!;

  const group = await loadJson<GroupJson>(`/data/groups/${slug}.json`);

  const [attackData, otxData] = await Promise.allSettled([
    group.attack_group_id
      ? loadJson<AttackJson>(`/data/attack/${group.attack_group_id}.json`)
      : Promise.resolve({ techniques: [], software: [] } as AttackJson),
    loadJson<OtxPulseItem[]>(`/data/otx/${slug}.json`),
  ]);

  const detail: GroupDetail = {
    ...group,
    attack_techniques: attackData.status === "fulfilled" ? attackData.value.techniques : [],
    attack_software:   attackData.status === "fulfilled" ? attackData.value.software   : [],
    otx_pulses:       otxData.status   === "fulfilled" ? otxData.value              : [],
  };

  _groupDetailCache.set(slug, detail);
  return detail;
}

// ---------------------------------------------------------------------------
// Search (client-side over groups cache)
// ---------------------------------------------------------------------------

export interface GroupSearchResult {
  name: string;
  slug: string;
  match_field: string;
  match_value: string;
}

export interface SearchResponse {
  groups: GroupSearchResult[];
}

export async function searchGroups(q: string): Promise<SearchResponse> {
  const query = q.toLowerCase().trim();
  if (!query) return { groups: [] };

  const groups = await loadGroups();
  const results: GroupSearchResult[] = [];

  for (const g of groups) {
    if (g.name.toLowerCase().includes(query)) {
      results.push({ name: g.name, slug: g.slug, match_field: "name", match_value: g.name });
      continue;
    }
    const alias = g.aliases.find((a) => a.toLowerCase().includes(query));
    if (alias) {
      results.push({ name: g.name, slug: g.slug, match_field: "alias", match_value: alias });
      continue;
    }
    if (g.description?.toLowerCase().includes(query)) {
      results.push({ name: g.name, slug: g.slug, match_field: "description", match_value: q });
    }
  }

  return { groups: results.slice(0, 10) };
}

// ---------------------------------------------------------------------------
// News feed
// ---------------------------------------------------------------------------

export interface NewsItemData {
  id: number;
  title: string;
  url: string;
  source: string;
  published: string | null;
  summary: string | null;
}

export interface NewsResponse {
  items: NewsItemData[];
  total: number;
  page: number;
  per_page: number;
}

interface StaticNewsItem {
  title: string;
  url: string;
  source: string;
  published: string | null;
  summary: string | null;
  groups?: string[];
}

let _newsCache: StaticNewsItem[] | null = null;

async function loadNews(): Promise<StaticNewsItem[]> {
  if (_newsCache) return _newsCache;
  try {
    _newsCache = await loadJson<StaticNewsItem[]>("/data/news/index.json");
  } catch {
    _newsCache = [];
  }
  return _newsCache;
}

export async function fetchNews(page = 1, perPage = 20): Promise<NewsResponse> {
  const all = await loadNews();
  const start = (page - 1) * perPage;
  const items = all.slice(start, start + perPage).map((item, i) => ({
    ...item,
    id: start + i,
    summary: item.summary ?? null,
  }));
  return { items, total: all.length, page, per_page: perPage };
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export interface SharedTool {
  name: string;
  software_id: string;
  software_type: string | null;
  url: string | null;
}

export interface SharedTechnique {
  technique_id: string;
  name: string;
  tactic: string | null;
  url: string | null;
}

export interface GroupRelation {
  group_name: string;
  group_slug: string | null;
  shared_tools: SharedTool[];
  shared_techniques: SharedTechnique[];
  shared_sectors: string[];
  shared_regions: string[];
}

export interface RelationsResponse {
  relations: GroupRelation[];
}

export async function fetchRelations(slug: string): Promise<RelationsResponse> {
  const group = await loadJson<GroupJson>(`/data/groups/${slug}.json`);
  return { relations: group.relations ?? [] };
}

// ---------------------------------------------------------------------------
// Graph visualization
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  node_type: "org" | "unit" | "group";
  slug: string | null;
  attack_group_id: string | null;
  affiliation: string[] | null;
  affiliation_confidence: string | null;
  aliases: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  edge_type: "org_hierarchy" | "shared_tool" | "shared_technique";
  confidence: string | null;
  tool: string | null;
  software_id: string | null;
  software_url: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function fetchGraph(): Promise<GraphData> {
  return loadJson<GraphData>("/data/graph.json");
}

// ---------------------------------------------------------------------------
// Group news / mentions
// ---------------------------------------------------------------------------

export interface GroupNewsItem {
  title: string;
  url: string;
  source: string;
  published: string | null;
  query: string;
}

export interface GroupNewsResponse {
  items: GroupNewsItem[];
}

export async function fetchGroupNews(slug: string): Promise<GroupNewsResponse> {
  try {
    const items = await loadJson<GroupNewsItem[]>(`/data/news/${slug}.json`);
    return { items };
  } catch {
    return { items: [] };
  }
}
