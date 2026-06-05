#!/usr/bin/env python3
"""
Sync OTX (AlienVault Open Threat Exchange) pulse data for APT groups.

Reads group names/aliases from actors/*.yaml, searches OTX API,
and writes:
  frontend/public/data/otx/{slug}.json   -- OtxPulseItem[]

Requires:
  OTX_API_KEY environment variable

Usage:
    OTX_API_KEY=your_key python sync_otx.py \
        --actors /path/to/actors \
        --out    /path/to/frontend/public/data

Typically run by GitHub Actions weekly.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml


OTX_BASE = "https://otx.alienvault.com/api/v1"
REQUEST_DELAY = 1.0
MAX_PULSES_PER_GROUP = 50


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def make_pattern(term: str) -> re.Pattern:
    """Whole-word regex: 'APT1' must not match 'APT10'."""
    escaped = re.escape(term)
    return re.compile(
        rf"(?<![A-Za-z0-9\-]){escaped}(?![A-Za-z0-9\-])",
        re.IGNORECASE,
    )


def pulse_matches(pulse: dict, patterns: list) -> bool:
    title = pulse.get("name", "")
    tags = " ".join(pulse.get("tags", []))
    text = f"{title} {tags}"
    return any(p.search(text) for p in patterns)


def otx_get(path: str, api_key: str, params: dict | None = None) -> dict | None:
    url = f"{OTX_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"X-OTX-API-KEY": api_key})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} for {path}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Error fetching {path}: {e}", file=sys.stderr)
        return None


def search_pulses(query: str, api_key: str, limit: int = 20) -> list[dict]:
    data = otx_get("/search/pulses", api_key, {"q": query, "limit": limit})
    if not data:
        return []
    return data.get("results", [])


def extract_refs(pulse: dict) -> list[str]:
    refs = pulse.get("references", [])
    urls = []
    for r in refs:
        if isinstance(r, str):
            urls.append(r)
        elif isinstance(r, dict) and r.get("url"):
            urls.append(r["url"])
    return urls


def parse_pulse(pulse: dict) -> dict:
    return {
        "pulse_id": pulse.get("id", ""),
        "name": pulse.get("name", ""),
        "description": pulse.get("description"),
        "author_name": pulse.get("author_name"),
        "created": pulse.get("created"),
        "modified": pulse.get("modified"),
        "reference_urls": extract_refs(pulse),
        "targeted_countries": pulse.get("targeted_countries", []),
        "industries": pulse.get("industries", []),
        "tags": pulse.get("tags", []),
        "indicator_count": pulse.get("indicator_count", 0),
    }


def parse_actors(actors_dir: Path) -> list[dict]:
    actors = []
    for yaml_path in sorted(actors_dir.glob("*.yaml")):
        if yaml_path.name.startswith(".") or yaml_path.name == "template.yaml":
            continue
        try:
            data = yaml.safe_load(yaml_path.read_text())
        except Exception:
            continue
        name = data.get("name", yaml_path.stem)
        slug = slugify(name)

        aliases_raw = data.get("aliases") or []
        alias_names = []
        for a in aliases_raw:
            if isinstance(a, dict):
                alias_names.append(a.get("name", ""))
            elif isinstance(a, str):
                alias_names.append(a)

        # Deduplicate while preserving order, cap at 5 terms (same as DB version)
        seen: dict = {}
        for t in [name] + alias_names:
            seen[t] = None
        search_terms = list(seen.keys())[:5]
        actors.append({"name": name, "slug": slug, "search_terms": search_terms})
    return actors


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync OTX pulse data for APT groups")
    parser.add_argument("--actors", required=True, help="Path to actors/ directory")
    parser.add_argument("--out",    required=True, help="Path to frontend/public/data/")
    args = parser.parse_args()

    api_key = os.environ.get("OTX_API_KEY", "").strip()
    if not api_key:
        sys.exit("Error: OTX_API_KEY environment variable not set")

    actors_dir = Path(args.actors)
    out_dir    = Path(args.out)
    otx_dir    = out_dir / "otx"
    otx_dir.mkdir(parents=True, exist_ok=True)

    actors = parse_actors(actors_dir)
    print(f"Processing {len(actors)} groups...")

    for actor in actors:
        slug = actor["slug"]
        terms = actor["search_terms"]
        print(f"  {actor['name']}...")

        seen_ids: set[str] = set()
        pulses: list[dict] = []
        patterns = [make_pattern(t) for t in terms]

        for term in terms:
            results = search_pulses(term, api_key, limit=20)
            for p in results:
                pid = p.get("id", "")
                if pid and pid not in seen_ids and pulse_matches(p, patterns):
                    seen_ids.add(pid)
                    pulses.append(parse_pulse(p))
            time.sleep(REQUEST_DELAY)

        pulses.sort(key=lambda x: x.get("created") or "", reverse=True)
        pulses = pulses[:MAX_PULSES_PER_GROUP]

        (otx_dir / f"{slug}.json").write_text(
            json.dumps(pulses, ensure_ascii=False, indent=2)
        )
        print(f"    {len(pulses)} pulses")

    print(f"\nDone. OTX data written to: {otx_dir}")


if __name__ == "__main__":
    main()
