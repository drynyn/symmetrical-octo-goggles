#!/usr/bin/env python3
"""Collect Google News RSS feeds into a static JSON dataset for GitHub Pages."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "news-timeline" / "news.json"
USER_AGENT = "OctogogglesNewsTimeline/1.0 (+https://drynyn.github.io/symmetrical-octo-goggles/)"

QUERIES = [
    "top news",
    "UK news",
    "world news",
    "politics",
    "economy",
    "technology",
    "science",
    "climate change",
    "health",
    "business",
    "artificial intelligence",
    "Ukraine",
    "Middle East",
]

def text_of(node: ET.Element, path: str) -> str:
    found = node.find(path)
    return (found.text or "").strip() if found is not None else ""

def fetch_feed(query: str) -> list[dict]:
    params = urllib.parse.urlencode({
        "q": query,
        "hl": "en-GB",
        "gl": "GB",
        "ceid": "GB:en",
    })
    url = "https://news.google.com/rss/search?" + params
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read()
    root = ET.fromstring(data)
    rows = []
    for item in root.findall(".//item"):
        title = text_of(item, "title")
        link = text_of(item, "link")
        pub_date = text_of(item, "pubDate")
        source_node = item.find("source")
        source = (source_node.text or "").strip() if source_node is not None else ""
        description = text_of(item, "description")
        if not title or not link or not pub_date:
            continue
        rows.append({
            "title": title,
            "link": link,
            "pubDate": pub_date,
            "source": source,
            "description": description,
            "feedQuery": query,
        })
    return rows

def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    by_link: dict[str, dict] = {}
    failures: list[str] = []
    # Preserve previously collected items so the archive grows across scheduled runs.
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
            for item in previous.get("articles", []):
                if isinstance(item, dict) and item.get("link"):
                    by_link[item["link"]] = item
        except (OSError, ValueError, TypeError) as exc:
            print(f"Could not read previous dataset; starting a fresh collection: {exc}")
    for query in QUERIES:
        try:
            for item in fetch_feed(query):
                # Deduplicate exact article URLs, keeping the first matching feed label.
                by_link.setdefault(item["link"], item)
        except Exception as exc:
            failures.append(f"{query}: {type(exc).__name__}: {exc}")
        time.sleep(1)

    # Keep articles with parseable dates, newest first; the page applies its own lookback.
    from email.utils import parsedate_to_datetime
    articles = []
    for item in by_link.values():
        try:
            dt = parsedate_to_datetime(item["pubDate"])
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            item["timestamp"] = int(dt.timestamp())
            articles.append(item)
        except (TypeError, ValueError, OverflowError):
            continue
    articles.sort(key=lambda item: item["timestamp"], reverse=True)

    # Retain up to 12,000 articles so the dataset can accumulate over time.
    articles = articles[:12000]
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "articleCount": len(articles),
        "feedsAttempted": len(QUERIES),
        "feedsFailed": failures,
        "articles": articles,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(articles)} unique articles to {OUTPUT}")
    if failures:
        print("Feed failures:")
        for failure in failures:
            print(" - " + failure)
    if not articles:
        raise SystemExit("No articles collected; refusing to publish an empty dataset.")

if __name__ == "__main__":
    main()
