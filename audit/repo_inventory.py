#!/usr/bin/env python3
"""Repo inventory audit (static).

Purpose:
- Ensure we do not "miss" routes/pages as the codebase grows.
- Catch nav links that point to non-existent pages.
- Identify staff pages that do not call any StacksOS adapter API.
- Identify adapter modules that are unused by staff pages.

This script does NOT require the dev server to be running.

Output:
- audit/REPO_INVENTORY.md
"""

from __future__ import annotations

import re
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audit" / "REPO_INVENTORY.md"

STAFF_DIR = ROOT / "src" / "app" / "staff"
API_DIR = ROOT / "src" / "app" / "api" / "evergreen"
SIDEBAR = ROOT / "src" / "components" / "layout" / "sidebar.tsx"

HREF_RE = re.compile(r"href:\s*\"([^\"]+)\"")
API_USAGE_RE = re.compile(r"/api/evergreen/([a-z0-9-]+)")
TODO_RE = re.compile(r"\b(TODO|FIXME|XXX)\b")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z"


def route_from_page(page_path: Path) -> str:
    rel = page_path.relative_to(STAFF_DIR)
    if rel.parts == ("page.tsx",):
        return "/staff"
    # drop trailing page.tsx
    parts = list(rel.parts)
    if parts and parts[-1] == "page.tsx":
        parts = parts[:-1]
    return "/staff/" + "/".join(parts)


def page_for_route(route: str) -> Path:
    route = route.strip()
    if not route.startswith("/staff"):
        raise ValueError("not a staff route")
    suffix = route[len("/staff") :].lstrip("/")
    if not suffix:
        return STAFF_DIR / "page.tsx"
    return STAFF_DIR / suffix / "page.tsx"


def read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


def main() -> None:
    staff_pages = sorted(STAFF_DIR.rglob("page.tsx"))
    staff_routes = [(route_from_page(p), p) for p in staff_pages]

    api_modules = sorted([p.name for p in API_DIR.iterdir() if p.is_dir()]) if API_DIR.exists() else []

    sidebar_hrefs = []
    if SIDEBAR.exists():
        sidebar_text = read_text(SIDEBAR)
        sidebar_hrefs = [h for h in HREF_RE.findall(sidebar_text) if h.startswith("/staff")]
    sidebar_hrefs = sorted(set(sidebar_hrefs))

    # Nav route existence
    missing_nav_pages = []
    for href in sidebar_hrefs:
        p = page_for_route(href)
        if not p.exists():
            missing_nav_pages.append((href, p))

    # Route coverage
    staff_route_set = set(r for r, _ in staff_routes)
    unlinked_routes = [r for r, _ in staff_routes if r not in sidebar_hrefs]

    # API usage per page
    page_api_usage = []
    all_used_modules = set()
    unconnected_pages = []
    todo_hits = []

    for route, page in staff_routes:
        text = read_text(page)
        mods = sorted(set(API_USAGE_RE.findall(text)))
        page_api_usage.append((route, page, mods))
        for m in mods:
            all_used_modules.add(m)
        if not mods:
            unconnected_pages.append((route, page))
        if TODO_RE.search(text):
            todo_hits.append((route, page))

    unused_api_modules = [m for m in api_modules if m not in all_used_modules]

    # Write report
    lines = []
    lines.append("# StacksOS Repo Inventory (Static)\n")
    lines.append(f"Generated: {utc_stamp()}\n")
    lines.append("## Sidebar Route Coverage\n")
    lines.append(f"- Sidebar routes found: {len(sidebar_hrefs)}")
    lines.append(f"- Staff pages found: {len(staff_pages)}")
    lines.append("")

    if missing_nav_pages:
        lines.append("### Missing page files for sidebar links (must fix or hide behind feature flags)\n")
        for href, p in missing_nav_pages:
            lines.append(f"- `{href}` -> `{p.relative_to(ROOT)}` (missing)")
        lines.append("")
    else:
        lines.append("- Sidebar links: OK (every sidebar href has a page.tsx)\n")

    lines.append("## Staff Pages Not Linked In Sidebar\n")
    lines.append("Note: some unlinked pages are expected (detail pages), but they should be intentional.\n")

    if unlinked_routes:
        for r in sorted(unlinked_routes):
            lines.append(f"- `{r}`")
        lines.append("")
    else:
        lines.append("- None\n")

    lines.append("## Pages With No Adapter API Usage\n")
    lines.append("These pages do not reference `/api/evergreen/*` at all. They are likely static or incomplete.\n")
    if unconnected_pages:
        for route, page in unconnected_pages:
            lines.append(f"- `{route}` (`{page.relative_to(ROOT)}`)")
        lines.append("")
    else:
        lines.append("- None\n")

    lines.append("## Adapter Module Usage\n")
    lines.append(f"- Adapter modules found: {len(api_modules)}")
    lines.append(f"- Adapter modules referenced by staff pages: {len(sorted(all_used_modules))}")
    lines.append("")

    if unused_api_modules:
        lines.append("### Adapter modules with zero staff page references\n")
        lines.append("These may still be used indirectly, but should be reviewed.\n")
        for m in unused_api_modules:
            lines.append(f"- `{m}`")
        lines.append("")
    else:
        lines.append("- All adapter modules are referenced by at least one staff page.\n")

    lines.append("## TODO/FIXME Markers\n")
    if todo_hits:
        for route, page in todo_hits:
            lines.append(f"- `{route}` (`{page.relative_to(ROOT)}`)")
        lines.append("")
    else:
        lines.append("- None\n")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
