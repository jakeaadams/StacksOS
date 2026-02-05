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

from dep_scan import dependency_closure, read_text as read_text_cached

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audit" / "REPO_INVENTORY.md"

STAFF_DIR = ROOT / "src" / "app" / "staff"
API_DIR = ROOT / "src" / "app" / "api" / "evergreen"
SIDEBAR = ROOT / "src" / "components" / "layout" / "sidebar.tsx"

HREF_RE = re.compile(r"href:\s*\"([^\"]+)\"")
API_USAGE_RE = re.compile(r"/api/evergreen/([a-z0-9-]+)")
ANY_API_RE = re.compile(r"/api/[A-Za-z0-9_/-]+")
TODO_RE = re.compile(r"\b(TODO|FIXME|XXX)\b")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z"


def is_dynamic_route(route: str) -> bool:
    return "[" in route and "]" in route


def parent_sidebar_route(route: str, sidebar_hrefs: list[str]) -> str | None:
    """Return the closest sidebar route that is a path-segment parent of `route`."""
    if not route.startswith("/staff/"):
        return None
    best: str | None = None
    for href in sidebar_hrefs:
        if href in ("/staff", "/staff/"):
            continue
        if route.startswith(href + "/"):
            if best is None or len(href) > len(best):
                best = href
    return best


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
    unlinked_candidates: list[str] = []
    unlinked_secondary: list[tuple[str, str]] = []
    for r in unlinked_routes:
        if is_dynamic_route(r):
            unlinked_secondary.append((r, "dynamic (detail page)"))
            continue
        parent = parent_sidebar_route(r, sidebar_hrefs)
        if parent:
            unlinked_secondary.append((r, f"child of {parent}"))
            continue
        unlinked_candidates.append(r)

    # API usage per page
    page_api_usage = []
    all_used_modules = set()
    unconnected_pages = []
    todo_hits = []

    for route, page in staff_routes:
        files = dependency_closure(ROOT, [page], max_files=800)
        mods: set[str] = set()
        any_api = False
        for f in files:
            t = read_text_cached(f)
            mods.update(API_USAGE_RE.findall(t))
            if not any_api and ANY_API_RE.search(t):
                any_api = True
        page_api_usage.append((route, page, mods))
        for m in mods:
            all_used_modules.add(m)
        if not any_api:
            unconnected_pages.append((route, page))
        if TODO_RE.search(read_text_cached(page)):
            todo_hits.append((route, page))

    # Include staff layout-level usage in module coverage.
    staff_layout = STAFF_DIR / "layout.tsx"
    if staff_layout.exists():
        baseline_files = dependency_closure(ROOT, [staff_layout], max_files=1200)
        for f in baseline_files:
            all_used_modules.update(API_USAGE_RE.findall(read_text_cached(f)))

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
    lines.append("Rule: primary navigation should not miss true hub pages.\n")

    if unlinked_candidates:
        lines.append("### Needs IA decision (hub-like pages)\n")
        for r in sorted(unlinked_candidates):
            lines.append(f"- `{r}`")
        lines.append("")

    if unlinked_secondary:
        lines.append("### Intentional (detail pages / subpages)\n")
        for r, reason in sorted(unlinked_secondary):
            lines.append(f"- `{r}` ({reason})")
        lines.append("")

    if not unlinked_candidates and not unlinked_secondary:
        lines.append("- None\n")

    lines.append("## Pages With No API Usage (Static)\n")
    lines.append("These pages (and their local imports) do not reference `/api/*`. This can be OK (docs/static), but review periodically.\n")
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
