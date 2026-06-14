#!/usr/bin/env python3
"""
Sync OTX (AlienVault Open Threat Exchange) pulse data for APT groups.

Reads group names/aliases from actors/*.yaml, fetches pulse feeds from
known OTX authors, filters locally, and writes:
  frontend/public/data/otx/{slug}.json   -- OtxPulseItem[]
  frontend/public/data/otx/recent.json   -- cross-group recent pulses

Uses /api/v1/pulses/user/{username} (author feed) instead of /search/pulses.
Author feeds are lightweight list endpoints not subject to the same
throttling as full-text search, which fails consistently from CI IPs.

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
from pathlib import Path

import requests
import yaml


OTX_BASE = "https://otx.alienvault.com/api/v1"
REQUEST_DELAY = 1.0
MAX_PULSES_PER_GROUP = 50
MAX_PAGES_PER_AUTHOR = 4   # 4 pages × 50 = 200 most-recent pulses per author

# OTX usernames that consistently publish Chinese APT content.
# Derived from the top contributors in our pulse database.
AUTHOR_FEEDS = [
    "AlienVault",
    "otxrobot",
    "343GuiltySpark",
    "nightingale",
    "Tr1sa111",
    "mohdrennis",
    "dorkingbeauty1",
    "zer0daydan",
    "Cyber_Hat",
    "CyberHunter_NL",
    "mitsoras",
    "cryptocti",
    "Provintell-Lab",
    "BITSecurity",
]

_session: requests.Session | None = None


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


def get_session(api_key: str) -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({
            "X-OTX-API-KEY": api_key,
            "Accept": "application/json",
            "User-Agent": "OTXv2 Python SDK",
        })
    return _session


def otx_get(path: str, api_key: str, params: dict | None = None) -> dict | None:
    session = get_session(api_key)
    url = f"{OTX_BASE}{path}"
    try:
        resp = session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.Timeout:
        print(f"  Timeout: {url}", file=sys.stderr)
        return None
    except requests.exceptions.HTTPError as e:
        print(f"  HTTP {e.response.status_code}: {url}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Error fetching {url}: {e}", file=sys.stderr)
        return None


def fetch_author_pulses(username: str, api_key: str) -> list[dict]:
    """Fetch recent pulses from a specific OTX author (up to MAX_PAGES_PER_AUTHOR pages)."""
    pulses: list[dict] = []
    for page in range(1, MAX_PAGES_PER_AUTHOR + 1):
        data = otx_get(f"/pulses/user/{username}", api_key, {"limit": 50, "page": page})
        if not data:
            break
        results = data.get("results", [])
        pulses.extend(results)
        if not data.get("next"):
            break
        time.sleep(REQUEST_DELAY)
    return pulses


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

    # Pre-compile patterns for every actor
    actor_patterns = {
        a["slug"]: [make_pattern(t) for t in a["search_terms"]]
        for a in actors
    }
    actor_by_slug = {a["slug"]: a for a in actors}

    # group_slug -> {pulse_id -> parsed_pulse}
    group_pulses: dict[str, dict[str, dict]] = {a["slug"]: {} for a in actors}

    # Fetch pulses from each author feed and distribute to matching groups
    print(f"Fetching pulses from {len(AUTHOR_FEEDS)} author feeds...")
    for username in AUTHOR_FEEDS:
        print(f"  {username}...")
        raw_pulses = fetch_author_pulses(username, api_key)
        matched = 0
        for pulse in raw_pulses:
            pid = pulse.get("id")
            if not pid:
                continue
            parsed = None
            for slug, patterns in actor_patterns.items():
                if pulse_matches(pulse, patterns):
                    if pid not in group_pulses[slug]:
                        if parsed is None:
                            parsed = parse_pulse(pulse)
                        group_pulses[slug][pid] = parsed
                        matched += 1
        time.sleep(REQUEST_DELAY)
        print(f"    {len(raw_pulses)} pulses fetched, {matched} group matches")

    # Write per-group files
    print(f"\nWriting per-group files for {len(actors)} groups...")
    all_recent: list[dict] = []

    for actor in actors:
        slug = actor["slug"]
        pulses = list(group_pulses[slug].values())

        # Deduplicate clones: same article published by multiple OTX authors
        # gets a unique pulse ID per clone, so dedup by normalised title instead.
        by_name: dict[str, dict] = {}
        for p in pulses:
            key = p.get("name", "").strip().lower()
            if key not in by_name or (p.get("modified") or "") > (by_name[key].get("modified") or ""):
                by_name[key] = p
        pulses = list(by_name.values())

        pulses.sort(key=lambda x: x.get("created") or "", reverse=True)
        pulses = pulses[:MAX_PULSES_PER_GROUP]

        (otx_dir / f"{slug}.json").write_text(
            json.dumps(pulses, ensure_ascii=False, indent=2)
        )
        print(f"  {actor['name']}: {len(pulses)} pulses")

        for p in pulses:
            if p.get("modified"):
                all_recent.append({
                    **p,
                    "group_name": actor["name"],
                    "group_slug": slug,
                })

    # Deduplicate recent.json by name across all groups too
    recent_by_name: dict[str, dict] = {}
    for p in all_recent:
        key = p.get("name", "").strip().lower()
        if key not in recent_by_name or (p.get("modified") or "") > (recent_by_name[key].get("modified") or ""):
            recent_by_name[key] = p
    all_recent = sorted(recent_by_name.values(), key=lambda x: x.get("modified") or "", reverse=True)

    (otx_dir / "recent.json").write_text(
        json.dumps(all_recent[:10], ensure_ascii=False, indent=2)
    )
    print(f"\nWrote recent.json ({min(len(all_recent), 10)} pulses)")
    print(f"Done. OTX data written to: {otx_dir}")


if __name__ == "__main__":
    main()
