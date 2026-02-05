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

from dep_scan import dependency_closure, read_text as read_text_cached

ROOT = Path(__file__).resolve().parent.parent
AUDIT_DIR = ROOT / "audit" / "api"
SUMMARY_TSV = AUDIT_DIR / "summary.tsv"
REPORT_MD = ROOT / "audit" / "REPORT.md"
FEATURE_MD = ROOT / "audit" / "FEATURE_MATRIX.md"

STAFF_PAGES = list((ROOT / "src" / "app" / "staff").rglob("page.tsx"))
API_ROUTES = list((ROOT / "src" / "app" / "api" / "evergreen").glob("*/route.ts"))
SIDEBAR = ROOT / "src" / "components" / "layout" / "sidebar.tsx"

API_PREFIX_RE = re.compile(r"/api/evergreen/([a-z0-9-]+)")
OTHER_API_ROOT_RE = re.compile(r"/api/(?!evergreen/)([a-z0-9-]+)")
CALL_OSRF_RE = re.compile(r"callOpenSRF\(\s*\"([^\"]+)\"")
HREF_RE = re.compile(r"href:\s*\"([^\"]+)\"")

# Heuristic: only these endpoints are expected to have "baseline" config/demo
# data in a healthy sandbox. Operational screens (holds/bills/lost/etc.) can be
# legitimately empty and should not be treated as broken UX signals.
CONFIG_EMPTY_SIGNAL_ENDPOINTS = {
    "calendars_snapshot",
    "admin_settings_org",
    "templates_copy",
    "buckets_list",
    "copy_tags",
    "stat_categories",
    "course_reserves",
    "scheduled_reports_schedules",
    "workstations_list",
    "booking_resources",
    "booking_reservations",
    "authority_search",
    "acq_invoices",
}


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
    text = read_text_cached(file_path)
    return sorted(set(API_PREFIX_RE.findall(text)))


def extract_other_api_roots(file_path: Path):
    text = read_text_cached(file_path)
    return sorted(set(OTHER_API_ROOT_RE.findall(text)))


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

    staff_layout = ROOT / "src" / "app" / "staff" / "layout.tsx"
    baseline_files: set[Path] = set()
    baseline_modules: set[str] = set()
    baseline_other_api: set[str] = set()
    if staff_layout.exists():
        baseline_files = dependency_closure(ROOT, [staff_layout], max_files=1200)
        for f in baseline_files:
            baseline_modules.update(extract_api_usage(f))
            baseline_other_api.update(extract_other_api_roots(f))

    for page in sorted(STAFF_PAGES):
        files = dependency_closure(ROOT, [page], max_files=1200)
        apis_full: set[str] = set()
        other_api_full: set[str] = set()
        for f in files:
            apis_full.update(extract_api_usage(f))
            other_api_full.update(extract_other_api_roots(f))
        for a in apis_full:
            used_modules.add(a)
        rel = page.relative_to(ROOT)

        # Reduce noise: show page-local calls beyond the staff layout baseline.
        #
        # Important: subtract by *files*, not by adapter name. If a page makes its
        # own `/api/evergreen/patrons` calls and the staff layout also happens to
        # touch `patrons` (e.g., universal search), we still want this page to be
        # credited for using `patrons`.
        local_files = files - baseline_files if baseline_files else files
        apis: set[str] = set()
        other_api: set[str] = set()
        for f in local_files:
            apis.update(extract_api_usage(f))
            other_api.update(extract_other_api_roots(f))

        page_rows.append(
            {
                "page": str(rel),
                "route": route_from_page(page),
                "apis": sorted(apis),
                "other_api": sorted(other_api),
                "apis_full": sorted(apis_full),
                "other_api_full": sorted(other_api_full),
            }
        )

    api_routes = sorted([p.parent.name for p in API_ROUTES])
    used_anywhere = used_modules | baseline_modules
    unused = [m for m in api_routes if m not in used_anywhere]

    # NOTE: This file is meant for humans (and agents) to spot wiring gaps fast.
    FEATURE_MD.write_text(
        "# StacksOS Feature -> API Matrix\n\n"
        f"Generated: {utc_stamp()}\n\n"
        "## API Routes (adapter modules)\n\n"
        + "\n".join(f"- {route}" for route in api_routes)
        + "\n\n## Staff Baseline API Usage (Layout)\n\n"
        + (
            f"- Evergreen adapters: {', '.join(sorted(baseline_modules)) if baseline_modules else '-'}\n"
            f"- Other `/api/*`: {', '.join(sorted(baseline_other_api)) if baseline_other_api else '-'}\n"
            if staff_layout.exists()
            else "- No `src/app/staff/layout.tsx` found\n"
        )
        + "\n\n## Staff Pages (Page-local)\n\n"
        + "| Route | Page | Evergreen adapters (page-local) | Other `/api/*` (page-local) |\n| --- | --- | --- | --- |\n"
        + "\n".join(
            f"| `{row['route']}` | `{row['page']}` | {', '.join(row['apis']) if row['apis'] else '-'} | {', '.join(row['other_api']) if row['other_api'] else '-'} |"
            for row in page_rows
        )
        + "\n\n## Unconnected Pages (No page-local `/api/*` Usage Beyond Staff Layout)\n\n"
        + (
            "\n".join(
                f"- `{row['route']}` (`{row['page']}`)"
                for row in page_rows
                if not row["apis"] and not row["other_api"]
            )
            + "\n"
            if any((not row["apis"] and not row["other_api"]) for row in page_rows)
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
                msg = data["message"].strip()
                msg_lower = msg.lower()
                looks_like_input_error = msg_lower.startswith("provide ") or "required" in msg_lower
                if not looks_like_input_error and (
                    "not configured" in msg_lower
                    or ("no" in msg_lower and ("configured" in msg_lower or "found" in msg_lower))
                ):
                    empty_modules.append((name, msg))

            if name in CONFIG_EMPTY_SIGNAL_ENDPOINTS:
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
