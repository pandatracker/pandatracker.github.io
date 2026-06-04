#!/usr/bin/env python3
"""
Fetch news/mentions via Google News RSS (no API key required).

Reads news_queries from each actors/*.yaml, queries Google News RSS,
and writes:
  frontend/public/data/news/index.json   -- all articles, newest first
  frontend/public/data/news/{slug}.json  -- per-group articles

Usage:
    python fetch_news.py \
        --actors /path/to/actors \
        --out    /path/to/frontend/public/data

Typically run by GitHub Actions every 6 hours.
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import yaml


RSS_BASE = "https://news.google.com/rss/search"
USER_AGENT = "Mozilla/5.0 (compatible; pandatracker-news-bot/1.0)"
REQUEST_DELAY = 2.0  # seconds between requests to avoid rate limiting
MAX_ITEMS_PER_QUERY = 20
MAX_ITEMS_PER_GROUP = 50


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def fetch_rss(query: str) -> list[dict]:
    """Fetch and parse Google News RSS for a query string."""
    params = urllib.parse.urlencode({
        "q": query,
        "hl": "en-US",
        "gl": "US",
        "ceid": "US:en",
        "num": MAX_ITEMS_PER_QUERY,
    })
    url = f"{RSS_BASE}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            xml_data = resp.read()
    except Exception as e:
        print(f"  Warning: failed to fetch '{query}': {e}", file=sys.stderr)
        return []

    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as e:
        print(f"  Warning: failed to parse RSS for '{query}': {e}", file=sys.stderr)
        return []

    items = []
    channel = root.find("channel")
    if channel is None:
        return []

    for item in channel.findall("item"):
        title = item.findtext("title") or ""
        link  = item.findtext("link")  or ""
        pub   = item.findtext("pubDate") or None
        desc  = item.findtext("description") or None
        source_el = item.find("source")
        source_name = source_el.text if source_el is not None else "Google News"

        # Parse pubDate to ISO format
        pub_iso = None
        if pub:
            try:
                dt = datetime.strptime(pub, "%a, %d %b %Y %H:%M:%S %Z")
                pub_iso = dt.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pub_iso = pub

        # Strip HTML from description
        summary = None
        if desc:
            summary = re.sub(r"<[^>]+>", " ", desc).replace("&nbsp;", " ").strip()
            summary = re.sub(r"\s+", " ", summary)[:300]

        if title and link:
            items.append({
                "title": title.strip(),
                "url": link.strip(),
                "source": source_name.strip() if source_name else "Google News",
                "published": pub_iso,
                "summary": summary,
                "query": query,
            })

    return items


def parse_actors(actors_dir: Path) -> list[dict]:
    actors = []
    for yaml_path in sorted(actors_dir.glob("*.yaml")):
        if yaml_path.name.startswith("."):
            continue
        try:
            data = yaml.safe_load(yaml_path.read_text())
        except Exception:
            continue
        name = data.get("name", yaml_path.stem)
        slug = slugify(name)
        queries = data.get("news_queries") or []
        if isinstance(queries, str):
            queries = [queries]
        actors.append({"name": name, "slug": slug, "queries": queries})
    return actors


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Google News RSS for APT groups")
    parser.add_argument("--actors", required=True, help="Path to actors/ directory")
    parser.add_argument("--out",    required=True, help="Path to frontend/public/data/")
    args = parser.parse_args()

    actors_dir = Path(args.actors)
    out_dir    = Path(args.out)
    news_dir   = out_dir / "news"
    news_dir.mkdir(parents=True, exist_ok=True)

    actors = parse_actors(actors_dir)
    print(f"Processing {len(actors)} groups...")

    all_items: list[dict] = []
    seen_urls: set[str] = set()

    for actor in actors:
        slug = actor["slug"]
        queries = actor["queries"]
        if not queries:
            print(f"  {actor['name']}: no news_queries defined, skipping")
            # Write empty file so the frontend doesn't 404
            (news_dir / f"{slug}.json").write_text("[]")
            continue

        print(f"  {actor['name']} ({len(queries)} queries)...")
        group_items: list[dict] = []
        group_seen: set[str] = set()

        for query in queries:
            results = fetch_rss(query)
            for item in results:
                url = item["url"]
                if url not in group_seen:
                    group_seen.add(url)
                    group_item = {**item, "groups": [slug]}
                    group_items.append(group_item)

                if url not in seen_urls:
                    seen_urls.add(url)
                    all_items.append({**item, "groups": [slug]})

            time.sleep(REQUEST_DELAY)

        # Sort by published date, newest first
        group_items.sort(key=lambda x: x.get("published") or "", reverse=True)
        group_items = group_items[:MAX_ITEMS_PER_GROUP]

        # Per-group file uses GroupNewsItem shape: {title, url, source, published, query}
        group_out = [
            {
                "title": it["title"],
                "url": it["url"],
                "source": it["source"],
                "published": it["published"],
                "query": it["query"],
            }
            for it in group_items
        ]
        (news_dir / f"{slug}.json").write_text(
            json.dumps(group_out, ensure_ascii=False, indent=2)
        )
        print(f"    {len(group_out)} articles")

    # Global index: all articles sorted newest first, deduplicated
    all_items.sort(key=lambda x: x.get("published") or "", reverse=True)
    index_out = [
        {
            "title": it["title"],
            "url": it["url"],
            "source": it["source"],
            "published": it["published"],
            "summary": it.get("summary"),
            "groups": it.get("groups", []),
        }
        for it in all_items
    ]
    (news_dir / "index.json").write_text(
        json.dumps(index_out, ensure_ascii=False, indent=2)
    )
    print(f"\nWrote index.json ({len(index_out)} total articles)")
    print(f"Done. News data written to: {news_dir}")


if __name__ == "__main__":
    main()
