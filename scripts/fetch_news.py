#!/usr/bin/env python3
"""
Fetch news for pandatracker static site.

Global feed:  reads scripts/feeds.yaml — security vendor blogs + broad Google
              News searches filtered by "china"/"chinese" keywords.
Group mentions: Google News RSS per group, filtered with smart regex (handles
                APT1 / APT-1 / APT 1 variations, checks title + summary).

Writes:
  frontend/public/data/news/index.json   -- global feed (NewsItemData[])
  frontend/public/data/news/{slug}.json  -- per-group mentions (GroupNewsItem[])

Usage:
    python fetch_news.py \
        --actors actors \
        --feeds  scripts/feeds.yaml \
        --out    frontend/public/data
"""

import argparse
import html
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import feedparser
import yaml


REQUEST_DELAY = 1.5
MAX_ITEMS_PER_GROUP = 50
MAX_GLOBAL_ITEMS = 300


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def clean_text(raw: str) -> str:
    text = html.unescape(raw)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_published(entry) -> str | None:
    if getattr(entry, "published_parsed", None):
        try:
            dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
    return None


def source_name(entry, feed_name: str) -> str:
    if hasattr(entry, "source") and isinstance(entry.source, dict):
        return entry.source.get("title") or feed_name
    return feed_name


# ---------------------------------------------------------------------------
# Relevance filtering (ported from fetch_mentions.py)
# ---------------------------------------------------------------------------

def build_filter_terms(group_name: str, alias_names: list[str]) -> list[str]:
    terms = [group_name]
    for name in alias_names:
        if len(name) > 4:
            terms.append(name)
    return terms


def term_to_pattern(term: str) -> str:
    """Regex tolerating hyphens/spaces at letter↔digit boundaries.
    'APT1' matches 'APT1', 'APT-1', 'APT 1'.
    """
    segments = re.split(r'[\s\-]+', term.strip())
    escaped = []
    for seg in segments:
        p = re.escape(seg)
        p = re.sub(r'([A-Za-z])(\d)', r'\1[\\s\\-]?\2', p)
        p = re.sub(r'(\d)([A-Za-z])', r'\1[\\s\\-]?\2', p)
        escaped.append(p)
    return r'\b' + r'[\s\-]+'.join(escaped) + r'\b'


def is_relevant(title: str, summary: str, terms: list[str]) -> bool:
    text = (title + " " + summary).lower()
    for term in terms:
        if re.search(term_to_pattern(term.lower()), text):
            return True
    return False


# ---------------------------------------------------------------------------
# Parse actors YAML
# ---------------------------------------------------------------------------

def parse_actors(actors_dir: Path) -> list[dict]:
    actors = []
    for yaml_path in sorted(actors_dir.glob("*.yaml")):
        if yaml_path.name.startswith(".") or yaml_path.name == "template.yaml":
            continue
        try:
            data = yaml.safe_load(yaml_path.read_text())
        except Exception:
            continue
        name = data.get("name") or yaml_path.stem
        if not name:
            continue
        slug = slugify(name)
        queries = data.get("news_queries") or []
        if isinstance(queries, str):
            queries = [queries]
        aliases_raw = data.get("aliases") or []
        alias_names = []
        for a in aliases_raw:
            if isinstance(a, dict):
                alias_names.append(a.get("name", ""))
            elif isinstance(a, str):
                alias_names.append(a)
        actors.append({
            "name": name,
            "slug": slug,
            "queries": queries,
            "alias_names": alias_names,
        })
    return actors


# ---------------------------------------------------------------------------
# Global feed (from feeds.yaml)
# ---------------------------------------------------------------------------

def fetch_global_feed(feeds_path: Path) -> list[dict]:
    if not feeds_path.exists():
        print(f"Warning: {feeds_path} not found, skipping global feed", file=sys.stderr)
        return []

    config = yaml.safe_load(feeds_path.read_text())
    feeds = config.get("feeds", [])
    items: list[dict] = []
    seen_urls: set[str] = set()

    for feed in feeds:
        name = feed["name"]
        url = feed["url"]
        feed_type = feed.get("type", "vendor_blog")
        keywords = [k.lower() for k in feed.get("keywords", [])]

        print(f"  [{feed_type}] {name}...")
        parsed = feedparser.parse(url)
        if parsed.bozo and not parsed.entries:
            print(f"    WARN: failed to parse", file=sys.stderr)
            continue

        for entry in parsed.entries[:30]:
            link = entry.get("link", "").strip()
            if not link or link in seen_urls:
                continue

            title = clean_text(entry.get("title", ""))
            summary_raw = entry.get("summary", "")
            summary = clean_text(summary_raw) if summary_raw else None
            if summary and len(summary) > 300:
                summary = summary[:300].rstrip() + "…"

            if feed_type == "vendor_blog" and keywords:
                text = (title + " " + (summary or "")).lower()
                if not any(kw in text for kw in keywords):
                    continue

            seen_urls.add(link)
            items.append({
                "title": title,
                "url": link,
                "source": source_name(entry, name),
                "published": parse_published(entry),
                "summary": summary,
                "groups": [],
            })

        time.sleep(REQUEST_DELAY)

    items.sort(key=lambda x: x.get("published") or "", reverse=True)
    return items[:MAX_GLOBAL_ITEMS]


# ---------------------------------------------------------------------------
# Per-group mentions
# ---------------------------------------------------------------------------

def fetch_group_mentions(actor: dict) -> list[dict]:
    slug = actor["slug"]
    queries = actor["queries"]
    filter_terms = build_filter_terms(actor["name"], actor["alias_names"])
    seen_urls: set[str] = set()
    items: list[dict] = []

    for query in queries:
        feed_url = (
            f"https://news.google.com/rss/search"
            f"?q={quote(query)}&hl=en-US&gl=US&ceid=US:en"
        )
        parsed = feedparser.parse(feed_url)
        if parsed.bozo and not parsed.entries:
            continue

        for entry in parsed.entries[:20]:
            link = entry.get("link", "").strip()
            if not link or link in seen_urls:
                continue

            title = clean_text(entry.get("title", ""))
            summary = clean_text(entry.get("summary", ""))

            if not is_relevant(title, summary, filter_terms):
                continue

            seen_urls.add(link)
            items.append({
                "title": title,
                "url": link,
                "source": source_name(entry, "Google News"),
                "published": parse_published(entry),
                "query": query,
            })

        time.sleep(REQUEST_DELAY)

    items.sort(key=lambda x: x.get("published") or "", reverse=True)
    return items[:MAX_ITEMS_PER_GROUP]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_global(feeds_path: Path, news_dir: Path) -> None:
    import json
    print("Fetching global news feed...")
    global_items = fetch_global_feed(feeds_path)
    (news_dir / "index.json").write_text(
        json.dumps(global_items, ensure_ascii=False, indent=2)
    )
    print(f"  Wrote index.json ({len(global_items)} articles)")


def run_mentions(actors_dir: Path, news_dir: Path) -> None:
    import json
    from datetime import timedelta
    actors = parse_actors(actors_dir)
    print(f"Fetching mentions for {len(actors)} groups...")
    all_mentions = []
    active_groups = []
    cutoff_14 = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()

    for actor in actors:
        slug = actor["slug"]
        if not actor["queries"]:
            print(f"  {actor['name']}: no queries, skipping")
            (news_dir / f"{slug}.json").write_text("[]")
            continue
        print(f"  {actor['name']} ({len(actor['queries'])} queries)...")
        items = fetch_group_mentions(actor)
        (news_dir / f"{slug}.json").write_text(
            json.dumps(items, ensure_ascii=False, indent=2)
        )
        print(f"    {len(items)} mentions")
        for item in items:
            all_mentions.append({**item, "group_name": actor["name"], "group_slug": slug})

        recent = [m for m in items if (m.get("published") or "") >= cutoff_14]
        if recent:
            last_mentioned = max(m.get("published") or "" for m in recent)
            active_groups.append({
                "name": actor["name"],
                "slug": slug,
                "last_mentioned": last_mentioned,
                "mention_count": len(recent),
            })

    all_mentions.sort(key=lambda x: x.get("published") or "", reverse=True)
    (news_dir / "mentions.json").write_text(
        json.dumps(all_mentions[:50], ensure_ascii=False, indent=2)
    )
    print(f"  Wrote mentions.json ({min(len(all_mentions), 50)} items)")

    active_groups.sort(key=lambda x: x["last_mentioned"], reverse=True)
    (news_dir / "active_groups.json").write_text(
        json.dumps(active_groups, ensure_ascii=False, indent=2)
    )
    print(f"  Wrote active_groups.json ({len(active_groups)} groups)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--actors", required=True)
    parser.add_argument("--feeds",  required=True, help="Path to feeds.yaml")
    parser.add_argument("--out",    required=True)
    parser.add_argument("--mode",   choices=["global", "mentions", "all"], default="all",
                        help="global: news feed only; mentions: per-group only; all: both")
    args = parser.parse_args()

    actors_dir = Path(args.actors)
    feeds_path = Path(args.feeds)
    out_dir    = Path(args.out)
    news_dir   = out_dir / "news"
    news_dir.mkdir(parents=True, exist_ok=True)

    if args.mode in ("global", "all"):
        run_global(feeds_path, news_dir)

    if args.mode in ("mentions", "all"):
        run_mentions(actors_dir, news_dir)

    print(f"\nDone. News written to: {news_dir}")


if __name__ == "__main__":
    main()
