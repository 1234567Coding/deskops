#!/usr/bin/env python3
"""Generate search-index.json for the DeskOps site from the 7 articles.

Run from anywhere:  python3 build-search-index.py
Writes search-index.json next to this script (the site root).

Each entry: { "title", "url" ("articles/<slug>.html"), "excerpt"
(first ~160 chars of the first paragraph), "headings" (list of h2 texts) }.
"""
import json
import os
import re
from html import unescape
from html.parser import HTMLParser

SITE_DIR = os.path.dirname(os.path.abspath(__file__))
ARTICLES_DIR = os.path.join(SITE_DIR, "articles")
OUT_PATH = os.path.join(SITE_DIR, "search-index.json")

SLUGS = [
    "best-ai-meeting-transcription-tools",
    "best-ergonomic-office-chairs-remote-workers",
    "herman-miller-vs-steelcase-vs-branch",
    "notion-vs-obsidian-vs-capacities",
    "the-1500-ergonomic-home-office",
    "the-200-desk-makeover",
    "ultimate-cable-management-guide",
]

CHROME_HEADINGS = {"faq", "keep reading"}


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._tag = None
        self._buf = []
        self.title = ""
        self.first_para = ""
        self.headings = []
        self._seen_h1 = False
        self._seen_para = False

    def handle_starttag(self, tag, attrs):
        if tag in ("h1", "h2", "h3", "p"):
            self._tag = tag
            self._buf = []
            self._cls = dict(attrs).get("class", "")

    def handle_endtag(self, tag):
        if tag == self._tag:
            text = unescape(" ".join("".join(self._buf).split()))
            if tag == "h1" and not self.title:
                self.title = text
                self._seen_h1 = True
            elif tag == "h2":
                self.headings.append(text)
            elif tag == "p" and self._seen_h1 and not self._seen_para:
                # skip chrome paragraphs (breadcrumb / meta)
                if getattr(self, "_cls", "") not in ("breadcrumb", "article-meta"):
                    self._seen_para = True
                    self.first_para = text
            self._tag = None
            self._buf = []

    def handle_data(self, data):
        if self._tag:
            self._buf.append(data)


def clean(s):
    return unescape(" ".join(s.split()))


def main():
    entries = []
    for slug in SLUGS:
        path = os.path.join(ARTICLES_DIR, slug + ".html")
        if not os.path.isfile(path):
            raise SystemExit(f"missing article file: {path}")
        with open(path, encoding="utf-8") as f:
            html = f.read()
        p = ArticleParser()
        p.feed(html)

        if not p.title:
            m = re.search(r"<title>(.*?)</title>", html, re.S)
            p.title = clean(re.sub(r"<[^>]+>", "", m.group(1))).split(" | ")[0] if m else slug
        p.title = clean(p.title)

        excerpt = clean(p.first_para)
        if len(excerpt) > 160:
            excerpt = excerpt[:157].rsplit(" ", 1)[0] + "..."

        headings = [clean(h) for h in p.headings if clean(h).lower() not in CHROME_HEADINGS]

        entries.append(
            {
                "title": p.title,
                "url": f"articles/{slug}.html",
                "excerpt": excerpt,
                "headings": headings,
            }
        )

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # validate: JSON parses, every URL resolves to a real local file
    with open(OUT_PATH, encoding="utf-8") as f:
        data = json.load(f)
    assert len(data) == len(SLUGS), f"expected {len(SLUGS)} entries, got {len(data)}"
    for entry in data:
        assert entry["title"] and entry["url"] and entry["excerpt"], f"empty field in {entry}"
        local = os.path.join(SITE_DIR, entry["url"])
        assert os.path.isfile(local), f"URL does not resolve to a file: {entry['url']}"
    print(f"OK: wrote {OUT_PATH} with {len(data)} entries; all URLs resolve.")


if __name__ == "__main__":
    main()
