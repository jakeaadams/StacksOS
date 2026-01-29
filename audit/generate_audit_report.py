#!/usr/bin/env python3
"""Generate StacksOS audit artifacts.

Inputs:
- audit/api/summary.tsv + audit/api/*.json (produced by run_api_audit.sh)
- repo tree (staff pages + adapter routes)

Outputs:
- audit/REPORT.md (API health + empty-data signals + coverage)
- audit/FEATURE_MATRIX.md (staff pages -> adapter modules)

Notes:
- This script is intentionally conservative. It reports drift and coverage gaps
  instead of assuming everything is wired.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
AUDIT_DIR = ROOT / "audit" / "api"
SUMMARY_TSV = AUDIT_DIR / "summary.tsv"
REPORT_MD = ROOT / "audit" / "REPORT.md"
FEATURE_MD = ROOT / "audit" / "FEATURE_MATRIX.md"

STAFF_PAGES = list((ROOT / "src" / "app" / "staff").rglob("page.tsx"))
API_ROUTES = list((ROOT / "src" / "app" / "api" / "evergreen").glob("*/route.ts"))
SIDEBAR = ROOT / "src" / "components" / "layout" / "sidebar.tsx"

API_PREFIX_RE = re.compile(r"/api/evergreen/([a-z0-9-]+)")
CALL_OSRF_RE = re.compile(r"callOpenSRF\(\s*\"([^\"]+)\"")
HREF_RE = re.compile(r"href:\s*\"([^\"]+)\"")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z"


def load_summary():
    if not SUMMARY_TSV.exists():
        return []

    rows = []
    lines = SUMMARY_TSV.read_text(encoding="utf-8").strip().splitlines()
    if not lines:
        return rows

    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) >= 3:
            rows.append({"name": parts[0], "status": parts[1], "url": parts[2]})
    return rows


def extract_api_usage(file_path: Path):
    text = file_path.read_text(encoding="utf-8")
    return sorted(set(API_PREFIX_RE.findall(text)))


def extract_open_srf_services(file_path: Path):
    text = file_path.read_text(encoding="utf-8")
    return sorted(set(CALL_OSRF_RE.findall(text)))


def route_from_page(page_path: Path) -> str:
    staff_root = ROOT / "src" / "app" / "staff"
    rel = page_path.relative_to(staff_root)
    if rel.parts == ("page.tsx",):
        return "/staff"
    parts = list(rel.parts)
    if parts and parts[-1] == "page.tsx":
        parts = parts[:-1]
    return "/staff/" + "/".join(parts)


def page_for_route(route: str) -> Path:
    staff_root = ROOT / "src" / "app" / "staff"
    route = route.strip()
    if not route.startswith("/staff"):
        raise ValueError("not a staff route")
    suffix = route[len("/staff") :].lstrip("/")
    if not suffix:
        return staff_root / "page.tsx"
    return staff_root / suffix / "page.tsx"


def sidebar_routes() -> list[str]:
    if not SIDEBAR.exists():
        return []
    text = SIDEBAR.read_text(encoding="utf-8")
    hrefs = [h for h in HREF_RE.findall(text) if h.startswith("/staff")]
    return sorted(set(hrefs))


def build_feature_matrix():
    page_rows = []
    used_modules = set()

    for page in sorted(STAFF_PAGES):
        apis = extract_api_usage(page)
        for a in apis:
            used_modules.add(a)
        rel = page.relative_to(ROOT)
        page_rows.append({"page": str(rel), "route": route_from_page(page), "apis": apis})

    api_routes = sorted([p.parent.name for p in API_ROUTES])
    unused = [m for m in api_routes if m not in used_modules]

    # NOTE: This file is meant for humans (and agents) to spot wiring gaps fast.
    FEATURE_MD.write_text(
        "# StacksOS Feature -> API Matrix\n\n"
        f"Generated: {utc_stamp()}\n\n"
        "## API Routes (adapter modules)\n\n"
        + "\n".join(f"- {route}" for route in api_routes)
        + "\n\n## Staff Pages\n\n"
        + "| Route | Page | API usage |\n| --- | --- | --- |\n"
        + "\n".join(
            f"| `{row['route']}` | `{row['page']}` | {', '.join(row['apis']) if row['apis'] else '-'} |"
            for row in page_rows
        )
        + "\n\n## Unconnected Pages\n\n"
        + (
            "\n".join(
                f"- `{row['route']}` (`{row['page']}`)"
                for row in page_rows
                if not row["apis"]
            )
            + "\n"
            if any(not row["apis"] for row in page_rows)
            else "- None\n"
        )
        + "\n## Unused Adapter Modules\n\n"
        + ("\n".join(f"- `{m}`" for m in unused) + "\n" if unused else "- None\n"),
        encoding="utf-8",
    )


def build_report():
    summary = load_summary()

    ok_http = [r for r in summary if r["status"] == "200"]
    non_ok_http = [r for r in summary if r["status"] != "200"]

    ok_false = []
    empty_modules = []
    audited_modules = set()

    for row in summary:
        m = API_PREFIX_RE.search(row["url"])
        if m:
            audited_modules.add(m.group(1))

        name = row["name"]
        json_path = AUDIT_DIR / f"{name}.json"
        if not json_path.exists():
            continue

        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            continue

        if isinstance(data, dict):
            if data.get("ok") is False:
                ok_false.append((name, data.get("error")))

            # Heuristic empty-data / missing-config detection.
            if "message" in data and isinstance(data.get("message"), str):
                msg = data["message"].lower()
                if "not configured" in msg or ("no" in msg and ("configured" in msg or "found" in msg)):
                    empty_modules.append((name, data.get("message")))

            for key, value in data.items():
                if isinstance(value, list) and len(value) == 0:
                    empty_modules.append((name, f"{key} is empty"))

    # Adapter module coverage vs audit surface
    api_modules = sorted([p.parent.name for p in API_ROUTES])
    missing_from_api_audit = sorted([m for m in api_modules if m not in audited_modules])

    # Sidebar coverage vs page files
    missing_sidebar_pages = []
    for href in sidebar_routes():
        p = page_for_route(href)
        if not p.exists():
            missing_sidebar_pages.append((href, str(p.relative_to(ROOT))))

    # OpenSRF services
    services = []
    for route in API_ROUTES:
        services.extend(extract_open_srf_services(route))
    services = sorted(set(services))

    REPORT_MD.write_text(
        "# StacksOS Audit Report\n\n"
        f"Generated: {utc_stamp()}\n\n"
        "## API Status\n\n"
        + f"- Total endpoints checked: {len(summary)}\n"
        + f"- OK (HTTP 200): {len(ok_http)}\n"
        + f"- Non-200: {len(non_ok_http)}\n"
        + f"- ok=false responses: {len(ok_false)}\n\n"
        + (
            "### Non-200 endpoints\n\n"
            + "\n".join(f"- {r['name']} ({r['status']})" for r in non_ok_http)
            + "\n\n"
            if non_ok_http
            else ""
        )
        + (
            "### ok=false responses\n\n"
            + "\n".join(f"- {name}: {err}" for name, err in ok_false)
            + "\n\n"
            if ok_false
            else ""
        )
        + "## Configuration/Empty-Data Signals\n\n"
        + (
            "\n".join(f"- {name}: {msg}" for name, msg in empty_modules) + "\n\n"
            if empty_modules
            else "- None detected\n\n"
        )
        + "## Audit Coverage\n\n"
        + (
            "### Adapter modules not exercised by API audit\n\n"
            + "\n".join(f"- `{m}`" for m in missing_from_api_audit)
            + "\n\n"
            if missing_from_api_audit
            else "- API audit touches every adapter module at least once.\n\n"
        )
        + (
            "### Sidebar links missing page files\n\n"
            + "\n".join(f"- `{href}` -> `{path}`" for href, path in missing_sidebar_pages)
            + "\n\n"
            if missing_sidebar_pages
            else "- Sidebar link -> page.tsx coverage: OK\n\n"
        )
        + "## OpenSRF Services in Use\n\n"
        + "\n".join(f"- {svc}" for svc in services)
        + "\n\n"
        + "## Artifacts\n\n"
        + f"- Summary TSV: `{SUMMARY_TSV}`\n"
        + f"- Raw responses: `{AUDIT_DIR}`\n"
        + f"- Feature Matrix: `{FEATURE_MD}`\n"
        + f"- Repo Inventory: `{ROOT / 'audit' / 'REPO_INVENTORY.md'}`\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build_feature_matrix()
    build_report()
    print(f"Wrote {FEATURE_MD}")
    print(f"Wrote {REPORT_MD}")
