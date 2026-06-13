#!/usr/bin/env python3
"""
Export static JSON data from actors/*.yaml and enterprise-attack.json.

Usage:
    python export_static.py \
        --actors  /path/to/actors \
        --stix    /path/to/enterprise-attack.json \
        --out     /path/to/frontend/public/data

Output layout:
    groups.json           GroupListItem[]
    groups/{slug}.json    GroupDetail + relations[]
    attack/{GXXXX}.json    { techniques, software }
    graph.json            { nodes, edges }
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def ensure(x, default=None):
    """Return x if truthy, else default."""
    return x if x is not None else default


def as_list(x) -> list:
    if x is None:
        return []
    if isinstance(x, list):
        return x
    return [x]


def strip_comments(items: list) -> list:
    """Strip inline YAML comments that sneak through as part of string values."""
    cleaned = []
    for item in items:
        if isinstance(item, str):
            item = item.split("#")[0].strip()
            if item:
                cleaned.append(item)
        else:
            cleaned.append(item)
    return cleaned


# ---------------------------------------------------------------------------
# Parse YAML actors
# ---------------------------------------------------------------------------

def parse_yaml_actors(actors_dir: Path) -> list[dict]:
    groups = []
    for i, yaml_path in enumerate(sorted(actors_dir.glob("*.yaml"))):
        if yaml_path.name.startswith(".") or yaml_path.name == "template.yaml":
            continue
        try:
            data = yaml.safe_load(yaml_path.read_text())
        except Exception as e:
            print(f"Warning: failed to parse {yaml_path.name}: {e}", file=sys.stderr)
            continue

        name = data.get("name") or yaml_path.stem
        if not name:
            continue
        slug = slugify(name)

        affiliation_raw = data.get("affiliation")
        affiliation = as_list(affiliation_raw) if affiliation_raw else None

        entity_name_raw = data.get("entity_name")
        entity_name = as_list(entity_name_raw) if entity_name_raw else None

        target_sectors = strip_comments(as_list(data.get("target_sectors", [])))
        target_regions = strip_comments(as_list(data.get("target_regions", [])))

        mitre_block = data.get("mitre") or {}
        attack_group_id = mitre_block.get("group_id")
        attack_group_url = mitre_block.get("group_url")

        # aliases: list of {name, vendor, source}
        aliases_raw = as_list(data.get("aliases", []))
        aliases = []
        for a in aliases_raw:
            if isinstance(a, dict):
                aliases.append({
                    "name": a.get("name", ""),
                    "vendor": a.get("vendor"),
                    "source": a.get("source"),
                })
            elif isinstance(a, str) and a.strip():
                aliases.append({"name": a, "vendor": None, "source": None})

        # attribution_evidence
        evidence = []
        for e in as_list(data.get("attribution_evidence", [])):
            if isinstance(e, dict):
                evidence.append({
                    "type": e.get("type"),
                    "title": e.get("title"),
                    "publisher": e.get("publisher"),
                    "date": str(e["date"]) if e.get("date") else None,
                    "url": e.get("url"),
                })

        # references (assessment_basis in YAML)
        references = []
        for r in as_list(data.get("assessment_basis", [])):
            if isinstance(r, dict):
                references.append({
                    "title": r.get("title"),
                    "publisher": r.get("publisher"),
                    "date": str(r["date"]) if r.get("date") else None,
                    "url": r.get("url"),
                    "notes": r.get("notes"),
                })

        # campaigns
        campaigns = []
        for c in as_list(data.get("campaigns", [])):
            if not isinstance(c, dict):
                continue
            targets = c.get("targets") or {}
            sources_raw = as_list(c.get("sources", []))
            sources = []
            for s in sources_raw:
                if isinstance(s, dict):
                    sources.append({
                        "url": s.get("url"),
                        "title": s.get("title"),
                        "publisher": s.get("publisher"),
                    })
            campaigns.append({
                "name": c.get("name", ""),
                "year_published": str(c["year_published"]) if c.get("year_published") else None,
                "description": c.get("description"),
                "target_sectors": strip_comments(as_list(targets.get("sectors", []))),
                "target_regions": strip_comments(as_list(targets.get("regions", []))),
                "sources": sources,
            })

        alias_names = [a["name"] for a in aliases]

        groups.append({
            "id": i + 1,
            "name": name,
            "slug": slug,
            "actor_type": data.get("actor_type"),
            "affiliation": affiliation,
            "affiliation_unit": data.get("affiliation_unit"),
            "affiliation_detail": data.get("affiliation_detail"),
            "affiliation_confidence": data.get("affiliation_confidence"),
            "entity_name": entity_name,
            "last_seen": str(data["last_seen"]) if data.get("last_seen") else None,
            "first_seen": str(data["first_seen"]) if data.get("first_seen") else None,
            "first_described": str(data["first_described"]) if data.get("first_described") else None,
            "description": data.get("description"),
            "attack_group_id": attack_group_id,
            "attack_group_url": attack_group_url,
            "news_queries": as_list(data.get("news_queries", [])) or None,
            "coordinates": data.get("coordinates"),  # [lat, lng] or None
            "aliases": aliases,
            "aliases_flat": alias_names,
            "attribution_evidence": evidence,
            "references": references,
            "target_sectors": target_sectors,
            "target_regions": target_regions,
            "campaigns": campaigns,
        })

    return groups


# ---------------------------------------------------------------------------
# Parse STIX enterprise-attack.json
# ---------------------------------------------------------------------------

def parse_stix(stix_path: Path) -> dict:
    """
    Returns:
        {
          attack_group_id -> {
            "techniques": [...MitreTechniqueItem],
            "software":   [...MitreSoftwareItem],
          }
        }
    """
    bundle = json.loads(stix_path.read_text())
    objects = bundle.get("objects", [])

    by_id: dict[str, dict] = {o["id"]: o for o in objects if "id" in o}

    def mitre_id(obj: dict) -> str | None:
        for ref in obj.get("external_references", []):
            if ref.get("source_name") == "mitre-attack":
                return ref.get("external_id")
        return None

    def mitre_url(obj: dict) -> str | None:
        for ref in obj.get("external_references", []):
            if ref.get("source_name") == "mitre-attack":
                return ref.get("url")
        return None

    # Map attack_group_id (e.g. G0006) -> intrusion-set STIX id
    group_stix_id: dict[str, str] = {}
    for obj in objects:
        if obj.get("type") == "intrusion-set":
            mid = mitre_id(obj)
            if mid:
                group_stix_id[mid] = obj["id"]

    # Group relationships by source
    rels_by_source: dict[str, list] = defaultdict(list)
    for obj in objects:
        if obj.get("type") == "relationship":
            rels_by_source[obj.get("source_ref", "")].append(obj)

    result: dict[str, dict] = {}

    for group_id, stix_id in group_stix_id.items():
        techniques: list[dict] = []
        software: list[dict] = []

        for rel in rels_by_source.get(stix_id, []):
            target = by_id.get(rel.get("target_ref", ""))
            if not target:
                continue

            t_type = target.get("type")
            use_desc = rel.get("description")

            if t_type == "attack-pattern":
                tid = mitre_id(target)
                if not tid:
                    continue
                phases = target.get("kill_chain_phases", [])
                tactic = ", ".join(
                    p["phase_name"] for p in phases
                    if p.get("kill_chain_name") == "mitre-attack"
                ) or None
                techniques.append({
                    "technique_id": tid,
                    "name": target.get("name", ""),
                    "tactic": tactic,
                    "description": target.get("description"),
                    "url": mitre_url(target),
                    "use_description": use_desc,
                })

            elif t_type in ("malware", "tool"):
                sid = mitre_id(target)
                if not sid:
                    continue
                software.append({
                    "software_id": sid,
                    "name": target.get("name", ""),
                    "description": target.get("description"),
                    "software_type": t_type,
                    "url": mitre_url(target),
                })

        result[group_id] = {
            "techniques": techniques,
            "software": software,
        }

    return result


# ---------------------------------------------------------------------------
# Compute relations between groups
# ---------------------------------------------------------------------------

def compute_relations(groups: list[dict], attack_data: dict) -> dict[str, list]:
    """
    For each group, find other groups that share tools, techniques, sectors, or regions.
    Returns slug -> list[GroupRelation]
    """
    # Build lookup structures
    slug_to_group = {g["slug"]: g for g in groups}
    slug_to_attack = {}
    for g in groups:
        gid = g.get("attack_group_id")
        if gid and gid in attack_data:
            slug_to_attack[g["slug"]] = attack_data[gid]

    # Index: tool/technique -> set of slugs using it
    tool_to_slugs: dict[str, set] = defaultdict(set)
    tech_to_slugs: dict[str, set] = defaultdict(set)
    for g in groups:
        slug = g["slug"]
        md = slug_to_attack.get(slug, {})
        for sw in md.get("software", []):
            tool_to_slugs[sw["software_id"]].add(slug)
        for t in md.get("techniques", []):
            tech_to_slugs[t["technique_id"]].add(slug)

    # For each group, find overlapping groups
    relations: dict[str, list] = {}

    for g in groups:
        slug = g["slug"]
        md = slug_to_attack.get(slug, {})
        my_tools = {sw["software_id"]: sw for sw in md.get("software", [])}
        my_techs = {t["technique_id"]: t for t in md.get("techniques", [])}
        my_sectors = set(g.get("target_sectors", []))
        my_regions = set(g.get("target_regions", []))

        # Collect candidate slugs
        candidates: set[str] = set()
        for tid in my_tools:
            candidates |= tool_to_slugs[tid]
        for tid in my_techs:
            candidates |= tech_to_slugs[tid]
        candidates.discard(slug)

        group_relations = []
        for other_slug in candidates:
            other = slug_to_group.get(other_slug)
            if not other:
                continue
            other_md = slug_to_attack.get(other_slug, {})
            other_tools = {sw["software_id"]: sw for sw in other_md.get("software", [])}
            other_techs = {t["technique_id"]: t for t in other_md.get("techniques", [])}
            other_sectors = set(other.get("target_sectors", []))
            other_regions = set(other.get("target_regions", []))

            shared_tool_ids = set(my_tools) & set(other_tools)
            shared_tech_ids = set(my_techs) & set(other_techs)
            shared_sectors = list(my_sectors & other_sectors)
            shared_regions = list(my_regions & other_regions)

            if not (shared_tool_ids or shared_tech_ids):
                continue

            group_relations.append({
                "group_name": other["name"],
                "group_slug": other_slug,
                "shared_tools": [
                    {
                        "name": my_tools[sid]["name"],
                        "software_id": sid,
                        "software_type": my_tools[sid].get("software_type"),
                        "url": my_tools[sid].get("url"),
                    }
                    for sid in sorted(shared_tool_ids)
                ],
                "shared_techniques": [
                    {
                        "technique_id": tid,
                        "name": my_techs[tid]["name"],
                        "tactic": my_techs[tid].get("tactic"),
                        "url": my_techs[tid].get("url"),
                    }
                    for tid in sorted(shared_tech_ids)
                ],
                "shared_sectors": shared_sectors,
                "shared_regions": shared_regions,
            })

        relations[slug] = group_relations

    return relations


# ---------------------------------------------------------------------------
# Build graph JSON
# ---------------------------------------------------------------------------

def build_graph(groups: list[dict], attack_data: dict, relations: dict[str, list]) -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []
    node_ids: set[str] = set()

    # Collect unique affiliations and units for org/unit nodes
    affiliations: dict[str, set] = defaultdict(set)  # affil -> set of units
    for g in groups:
        for a in as_list(g.get("affiliation") or []):
            unit = g.get("affiliation_unit")
            affiliations[a].add(unit if unit else "")

    # Add org nodes
    for affil in affiliations:
        nid = f"org:{affil}"
        if nid not in node_ids:
            nodes.append({
                "id": nid,
                "label": affil,
                "node_type": "org",
                "slug": None,
                "attack_group_id": None,
                "affiliation": [affil],
                "affiliation_confidence": None,
                "aliases": [],
            })
            node_ids.add(nid)

    # Add unit nodes and org→unit edges
    unit_affil: dict[str, str] = {}
    for g in groups:
        unit = g.get("affiliation_unit")
        if not unit:
            continue
        nid = f"unit:{unit}"
        if nid not in node_ids:
            nodes.append({
                "id": nid,
                "label": unit,
                "node_type": "unit",
                "slug": None,
                "attack_group_id": None,
                "affiliation": g.get("affiliation"),
                "affiliation_confidence": None,
                "aliases": [],
            })
            node_ids.add(nid)
            for a in as_list(g.get("affiliation") or []):
                org_nid = f"org:{a}"
                if org_nid in node_ids:
                    edges.append({
                        "source": org_nid,
                        "target": nid,
                        "edge_type": "org_hierarchy",
                        "confidence": g.get("affiliation_confidence"),
                        "tool": None,
                        "software_id": None,
                        "software_url": None,
                    })
                    unit_affil[unit] = a
                    break

    # Add group nodes and unit→group edges
    for g in groups:
        nid = g["slug"]
        if nid not in node_ids:
            nodes.append({
                "id": nid,
                "label": g["name"],
                "node_type": "group",
                "slug": g["slug"],
                "attack_group_id": g.get("attack_group_id"),
                "affiliation": g.get("affiliation"),
                "affiliation_confidence": g.get("affiliation_confidence"),
                "aliases": g.get("aliases_flat", []),
            })
            node_ids.add(nid)

        unit = g.get("affiliation_unit")
        if unit:
            unit_nid = f"unit:{unit}"
            if unit_nid in node_ids:
                edges.append({
                    "source": unit_nid,
                    "target": nid,
                    "edge_type": "org_hierarchy",
                    "confidence": g.get("affiliation_confidence"),
                    "tool": None,
                    "software_id": None,
                    "software_url": None,
                })
        else:
            for a in as_list(g.get("affiliation") or []):
                org_nid = f"org:{a}"
                if org_nid in node_ids:
                    edges.append({
                        "source": org_nid,
                        "target": nid,
                        "edge_type": "org_hierarchy",
                        "confidence": g.get("affiliation_confidence"),
                        "tool": None,
                        "software_id": None,
                        "software_url": None,
                    })
                    break

    # Add shared tool/technique edges (deduplicated)
    edge_set: set[tuple] = set()
    for slug, rels in relations.items():
        for rel in rels:
            other_slug = rel["group_slug"]
            if not other_slug:
                continue
            for tool in rel["shared_tools"]:
                key = tuple(sorted([slug, other_slug])) + ("shared_tool", tool["software_id"])
                if key not in edge_set:
                    edge_set.add(key)
                    edges.append({
                        "source": slug,
                        "target": other_slug,
                        "edge_type": "shared_tool",
                        "confidence": None,
                        "tool": tool["name"],
                        "software_id": tool["software_id"],
                        "software_url": tool.get("url"),
                    })
            for tech in rel["shared_techniques"]:
                key = tuple(sorted([slug, other_slug])) + ("shared_technique", tech["technique_id"])
                if key not in edge_set:
                    edge_set.add(key)
                    edges.append({
                        "source": slug,
                        "target": other_slug,
                        "edge_type": "shared_technique",
                        "confidence": None,
                        "tool": tech["name"],
                        "software_id": tech["technique_id"],
                        "software_url": tech.get("url"),
                    })

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Export static JSON for pandatracker GitHub Pages")
    parser.add_argument("--actors", required=True, help="Path to actors/ directory")
    parser.add_argument("--stix",   required=True, help="Path to enterprise-attack.json")
    parser.add_argument("--out",    required=True, help="Path to frontend/public/data/")
    args = parser.parse_args()

    actors_dir = Path(args.actors)
    stix_path  = Path(args.stix)
    out_dir    = Path(args.out)

    if not actors_dir.is_dir():
        sys.exit(f"Error: actors directory not found: {actors_dir}")
    if not stix_path.is_file():
        sys.exit(f"Error: STIX file not found: {stix_path}")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "groups").mkdir(exist_ok=True)
    (out_dir / "attack").mkdir(exist_ok=True)
    (out_dir / "otx").mkdir(exist_ok=True)
    (out_dir / "news").mkdir(exist_ok=True)

    print("Parsing YAML actors...")
    groups = parse_yaml_actors(actors_dir)
    print(f"  {len(groups)} groups loaded")

    print("Parsing STIX enterprise-attack.json...")
    attack_data = parse_stix(stix_path)
    print(f"  {len(attack_data)} ATT&CK groups indexed")

    print("Computing relations...")
    relations = compute_relations(groups, attack_data)

    print("Building graph...")
    graph = build_graph(groups, attack_data, relations)

    # Write groups.json (list view — no aliases detail, no relations)
    list_items = []
    for g in groups:
        list_items.append({
            "id": g["id"],
            "name": g["name"],
            "slug": g["slug"],
            "actor_type": g.get("actor_type"),
            "affiliation": g.get("affiliation"),
            "affiliation_confidence": g.get("affiliation_confidence"),
            "last_seen": g.get("last_seen"),
            "first_seen": g.get("first_seen"),
            "first_described": g.get("first_described"),
            "description": g.get("description"),
            "aliases": g.get("aliases_flat", []),
            "target_sectors": g.get("target_sectors", []),
            "target_regions": g.get("target_regions", []),
            "attack_group_id": g.get("attack_group_id"),
        })
    (out_dir / "groups.json").write_text(json.dumps(list_items, ensure_ascii=False, indent=2))
    print(f"  Wrote groups.json ({len(list_items)} groups)")

    # Write per-group detail JSON
    for g in groups:
        slug = g["slug"]
        detail = {
            "id": g["id"],
            "name": g["name"],
            "slug": slug,
            "actor_type": g.get("actor_type"),
            "affiliation": g.get("affiliation"),
            "affiliation_unit": g.get("affiliation_unit"),
            "affiliation_detail": g.get("affiliation_detail"),
            "affiliation_confidence": g.get("affiliation_confidence"),
            "entity_name": g.get("entity_name"),
            "last_seen": g.get("last_seen"),
            "first_seen": g.get("first_seen"),
            "first_described": g.get("first_described"),
            "description": g.get("description"),
            "attack_group_id": g.get("attack_group_id"),
            "attack_group_url": g.get("attack_group_url"),
            "news_queries": g.get("news_queries"),
            "aliases": g.get("aliases", []),
            "attribution_evidence": g.get("attribution_evidence", []),
            "references": g.get("references", []),
            "target_sectors": g.get("target_sectors", []),
            "target_regions": g.get("target_regions", []),
            "campaigns": g.get("campaigns", []),
            # These are fetched separately client-side:
            "attack_techniques": [],
            "attack_software": [],
            "otx_pulses": [],
            # Pre-computed relations:
            "relations": relations.get(slug, []),
        }
        (out_dir / "groups" / f"{slug}.json").write_text(
            json.dumps(detail, ensure_ascii=False, indent=2)
        )

    print(f"  Wrote {len(groups)} group detail files")

    # Write per-group MITRE JSON
    attack_count = 0
    for g in groups:
        gid = g.get("attack_group_id")
        if gid and gid in attack_data:
            (out_dir / "attack" / f"{gid}.json").write_text(
                json.dumps(attack_data[gid], ensure_ascii=False, indent=2)
            )
            attack_count += 1
    print(f"  Wrote {attack_count} ATT&CK group files")

    # Write dashboard.json (recently_active + recent_campaigns — static parts)
    recently_active = sorted(
        [g for g in groups if g.get("last_seen")],
        key=lambda g: g["last_seen"],
        reverse=True,
    )[:8]
    all_campaigns = []
    for g in groups:
        for c in g.get("campaigns", []):
            all_campaigns.append({**c, "group_name": g["name"], "group_slug": g["slug"]})
    all_campaigns.sort(key=lambda c: c.get("year_published") or "", reverse=True)
    dashboard = {
        "recently_active": [
            {
                "name": g["name"],
                "slug": g["slug"],
                "last_seen": g["last_seen"],
                "affiliation": g.get("affiliation"),
                "affiliation_confidence": g.get("affiliation_confidence"),
            }
            for g in recently_active
        ],
        "recent_campaigns": all_campaigns[:6],
    }
    (out_dir / "dashboard.json").write_text(json.dumps(dashboard, ensure_ascii=False, indent=2))
    print("  Wrote dashboard.json")

    # Write graph.json
    (out_dir / "graph.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2))
    print(f"  Wrote graph.json ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

    # Write empty news/index.json if it doesn't exist (placeholder)
    news_index = out_dir / "news" / "index.json"
    if not news_index.exists():
        news_index.write_text("[]")
        print("  Created empty news/index.json placeholder")

    print("\nDone. Static data exported to:", out_dir)


if __name__ == "__main__":
    main()
