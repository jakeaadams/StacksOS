import json
import os
import re
import sys
from pathlib import Path


def _is_int_like(v) -> bool:
    if isinstance(v, int):
        return True
    if isinstance(v, str) and re.fullmatch(r"\d+", v.strip() or "x"):
        return True
    return False


def _require(cond: bool, msg: str):
    if not cond:
        raise AssertionError(msg)


def _require_dict(v, msg: str):
    _require(isinstance(v, dict), msg)


def _require_list(v, msg: str):
    _require(isinstance(v, list), msg)


def _load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise AssertionError(f"{path.name}: invalid JSON ({e})")


def main() -> int:
    root = Path(os.environ.get("ROOT_DIR", str(Path.cwd())))
    api_dir = root / "audit" / "api"
    include_ai = os.environ.get("STACKSOS_AUDIT_INCLUDE_AI", "1") == "1"
    if not api_dir.exists():
        raise AssertionError("audit/api not found; run API audit first")

    failures: list[str] = []
    summary_status: dict[str, str] = {}
    summary_path = api_dir / "summary.tsv"
    if summary_path.exists():
        for line in summary_path.read_text(encoding="utf-8").splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) >= 2:
                summary_status[parts[0]] = parts[1]

    def check(name: str, fn, allow_error: bool = False):
        p = api_dir / f"{name}.json"
        if not p.exists():
            failures.append(f"{name}: missing fixture file {p}")
            return
        data = _load_json(p)
        try:
            _require_dict(data, f"{name}: response must be an object")
            if allow_error:
                _require(data.get("ok") is False, f"{name}: ok must be false")
            else:
                _require(data.get("ok") is True, f"{name}: ok must be true")
            fn(data)
        except AssertionError as e:
            failures.append(str(e))

    def check_optional_ai(name: str, fn):
        status = summary_status.get(name)
        if status != "200":
            return
        check(name, fn)

    # ---------------------------------------------------------------------
    # Stable adapter invariants (avoid overfitting to one Evergreen)
    # ---------------------------------------------------------------------

    check(
        "ping",
        lambda d: (
            _require(_is_int_like(d.get("status")), "ping: status must be int-like"),
            _require(isinstance(d.get("url"), str), "ping: url must be a string"),
        ),
    )

    check(
        "csrf_token",
        lambda d: _require(isinstance(d.get("token"), str) and len(d.get("token")) >= 8, "csrf_token: token required"),
    )

    check(
        "auth_session",
        lambda d: _require(
            isinstance(d.get("authenticated"), bool), "auth_session: authenticated must be boolean"
        ),
    )

    check(
        "auth_session_preflight",
        lambda d: _require(
            isinstance(d.get("authenticated"), bool), "auth_session_preflight: authenticated must be boolean"
        ),
    )

    check(
        "orgs",
        lambda d: _require_list(d.get("payload"), "orgs: payload must be an array"),
    )

    check(
        "workstations_list",
        lambda d: _require_list(d.get("workstations"), "workstations_list: workstations must be an array"),
    )

    check(
        "activity_all",
        lambda d: (
            _require_list(d.get("activities"), "activity_all: activities must be an array"),
            _require_dict(d.get("pagination"), "activity_all: pagination must be an object"),
        ),
    )

    check(
        "org_tree",
        lambda d: (
            _require(d.get("tree") is None or isinstance(d.get("tree"), dict), "org_tree: tree must be null or an object"),
            _require_list(d.get("types"), "org_tree: types must be an array"),
        ),
    )

    check(
        "perm_check",
        lambda d: _require_dict(d.get("perms"), "perm_check: perms must be an object"),
    )

    check(
        "permissions_list",
        lambda d: _require_list(d.get("permissions"), "permissions_list: permissions must be an array"),
    )

    check(
        "policies_duration_rules",
        lambda d: _require_list(d.get("rules"), "policies_duration_rules: rules must be an array"),
    )

    check(
        "settings_org",
        lambda d: _require_list(d.get("settings"), "settings_org: settings must be an array"),
    )

    check(
        "calendars_snapshot",
        lambda d: (
            _require_dict(d.get("snapshot"), "calendars_snapshot: snapshot must be an object"),
            _require_list(d.get("versions"), "calendars_snapshot: versions must be an array"),
        ),
    )

    check(
        "admin_settings_org",
        lambda d: (
            _require_list(d.get("settings"), "admin_settings_org: settings must be an array"),
            _require_list(d.get("settingTypes"), "admin_settings_org: settingTypes must be an array"),
        ),
    )

    check(
        "templates_copy",
        lambda d: (
            _require_list(d.get("templates"), "templates_copy: templates must be an array"),
            _require_list(d.get("statuses"), "templates_copy: statuses must be an array"),
        ),
    )

    check(
        "buckets_list",
        lambda d: (
            _require_list(d.get("buckets"), "buckets_list: buckets must be an array"),
            _require(_is_int_like(d.get("count")), "buckets_list: count must be int-like"),
        ),
    )

    check(
        "copy_statuses",
        lambda d: (
            _require_list(d.get("statuses"), "copy_statuses: statuses must be an array"),
            _require_dict(d.get("permissions"), "copy_statuses: permissions must be an object"),
        ),
    )
    check(
        "floating_groups",
        lambda d: _require_list(d.get("groups"), "floating_groups: groups must be an array"),
    )
    check(
        "spellcheck_probe",
        lambda d: (
            _require(
                d.get("suggestion") is None or isinstance(d.get("suggestion"), str),
                "spellcheck_probe: suggestion must be null or string",
            ),
            _require(_is_int_like(d.get("originalCount")), "spellcheck_probe: originalCount must be int-like"),
        ),
    )

    check(
        "copy_tag_types",
        lambda d: (
            _require_list(d.get("tagTypes"), "copy_tag_types: tagTypes must be an array"),
            _require_dict(d.get("permissions"), "copy_tag_types: permissions must be an object"),
        ),
    )

    check(
        "copy_tags",
        lambda d: (
            _require_list(d.get("tags"), "copy_tags: tags must be an array"),
            _require_dict(d.get("permissions"), "copy_tags: permissions must be an object"),
        ),
    )

    check(
        "stat_categories",
        lambda d: (
            _require_list(d.get("copyCategories"), "stat_categories: copyCategories must be an array"),
            _require_list(d.get("patronCategories"), "stat_categories: patronCategories must be an array"),
            _require_dict(d.get("permissions"), "stat_categories: permissions must be an object"),
        ),
    )

    check(
        "course_reserves",
        lambda d: (
            _require_list(d.get("courses"), "course_reserves: courses must be an array"),
            _require_list(d.get("terms"), "course_reserves: terms must be an array"),
            _require_dict(d.get("permissions"), "course_reserves: permissions must be an object"),
        ),
    )

    check(
        "marc_sources",
        lambda d: _require_list(d.get("sources"), "marc_sources: sources must be an array"),
    )
    if include_ai:
        check_optional_ai(
            "ai_marc_probe",
            lambda d: (
                _require(isinstance(d.get("leader"), str), "ai_marc_probe: leader must be a string"),
                _require_list(d.get("fields"), "ai_marc_probe: fields must be an array"),
            ),
        )

    check(
        "transits_incoming",
        lambda d: _require_list(d.get("transits"), "transits_incoming: transits must be an array"),
    )

    check(
        "user_settings",
        lambda d: _require_dict(d.get("settings"), "user_settings: settings must be an object"),
    )

    check(
        "z3950_services",
        lambda d: _require_list(d.get("services"), "z3950_services: services must be an array"),
    )

    check(
        "staff_users_search",
        lambda d: (
            _require_list(d.get("users"), "staff_users_search: users must be an array"),
            _require(_is_int_like(d.get("count")), "staff_users_search: count must be int-like"),
        ),
    )

    check(
        "catalog_search",
        lambda d: (
            _require(_is_int_like(d.get("count")), "catalog_search: count must be int-like"),
            _require_list(d.get("records"), "catalog_search: records must be an array"),
        ),
    )
    if include_ai:
        check_optional_ai(
            "ai_search_probe",
            lambda d: (
                _require(_is_int_like(d.get("count")), "ai_search_probe: count must be int-like"),
                _require_list(d.get("records"), "ai_search_probe: records must be an array"),
            ),
        )

    check(
        "catalog_record",
        lambda d: _require_dict(d.get("record"), "catalog_record: record must be an object"),
    )

    check(
        "catalog_holdings",
        lambda d: _require_list(d.get("copies"), "catalog_holdings: copies must be an array"),
    )

    check(
        "items_lookup",
        lambda d: _require_dict(d.get("item"), "items_lookup: item must be an object"),
    )

    check(
        "circ_item_status",
        lambda d: _require_dict(d.get("copy"), "circ_item_status: copy must be an object"),
    )

    check(
        "circ_patron_checkouts",
        lambda d: _require_dict(d.get("checkouts"), "circ_patron_checkouts: checkouts must be an object"),
    )

    check(
        "circ_patron_holds",
        lambda d: _require_list(d.get("holds"), "circ_patron_holds: holds must be an array"),
    )

    check(
        "circ_patron_bills",
        lambda d: _require_list(d.get("bills"), "circ_patron_bills: bills must be an array"),
    )

    check(
        "holds_patron",
        lambda d: _require_list(d.get("holds"), "holds_patron: holds must be an array"),
    )

    check(
        "holds_title",
        lambda d: _require_list(d.get("holds"), "holds_title: holds must be an array"),
    )

    check(
        "holds_pull_list",
        lambda d: _require_list(d.get("holds"), "holds_pull_list: holds must be an array"),
    )

    check(
        "holds_shelf",
        lambda d: _require_list(d.get("holds"), "holds_shelf: holds must be an array"),
    )

    check(
        "holds_check_possible",
        lambda d: _require(
            isinstance(d.get("possible"), bool) or isinstance(d.get("possible"), int),
            "holds_check_possible: possible must be boolean/int-like",
        ),
    )

    check(
        "holds_expired",
        lambda d: _require_list(d.get("holds"), "holds_expired: holds must be an array"),
    )

    check(
        "patron_search",
        lambda d: _require_list(d.get("patrons"), "patron_search: patrons must be an array"),
    )

    check(
        "patron_barcode",
        lambda d: _require_dict(d.get("patron"), "patron_barcode: patron must be an object"),
    )

    check(
        "notices_prefs",
        lambda d: _require_dict(d.get("preferences"), "notices_prefs: preferences must be an object"),
    )

    check(
        "booking_types",
        lambda d: _require_list(d.get("types"), "booking_types: types must be an array"),
    )

    check(
        "booking_resources",
        lambda d: _require_list(d.get("resources"), "booking_resources: resources must be an array"),
    )

    check(
        "booking_reservations",
        lambda d: _require_list(d.get("reservations"), "booking_reservations: reservations must be an array"),
    )

    check(
        "authority_search",
        lambda d: _require_list(d.get("authorities"), "authority_search: authorities must be an array"),
    )

    check(
        "scheduled_reports_schedules",
        lambda d: _require_list(d.get("schedules"), "scheduled_reports_schedules: schedules must be an array"),
    )

    check("serials_subscriptions", lambda d: _require_list(d.get("subscriptions"), "serials_subscriptions: subscriptions must be an array"))
    check("serials_routing", lambda d: _require_list(d.get("routing"), "serials_routing: routing must be an array"))

    check(
        "reports_dashboard",
        lambda d: _require_dict(d.get("dashboard"), "reports_dashboard: dashboard must be an object"),
    )

    check("reports_holds", lambda d: _require_dict(d.get("holds"), "reports_holds: holds must be an object"))
    check(
        "reports_patrons",
        lambda d: _require(
            d.get("patrons") is None or isinstance(d.get("patrons"), dict),
            "reports_patrons: patrons must be null or an object",
        ),
    )

    check("offline_status", lambda d: _require(isinstance(d.get("online"), bool), "offline_status: online must be boolean"))
    check("offline_blocks", lambda d: _require_list(d.get("blocks"), "offline_blocks: blocks must be an array"))
    check("offline_policies", lambda d: _require_list(d.get("policies"), "offline_policies: policies must be an array"))

    check("claims_patron", lambda d: _require_dict(d.get("claims"), "claims_patron: claims must be an object"))
    check("claims_item", lambda d: _require_dict(d.get("item"), "claims_item: item must be an object"))
    check("lost_patron", lambda d: _require_dict(d.get("summary"), "lost_patron: summary must be an object"))
    check("lost_item", lambda d: _require_dict(d.get("item"), "lost_item: item must be an object"))

    check("acq_vendors", lambda d: _require_list(d.get("vendors"), "acq_vendors: vendors must be an array"))
    check("acq_funds", lambda d: _require_list(d.get("funds"), "acq_funds: funds must be an array"))
    check("acq_orders", lambda d: _require_list(d.get("orders"), "acq_orders: orders must be an array"))
    check("acq_invoices", lambda d: _require_list(d.get("invoices"), "acq_invoices: invoices must be an array"))

    # Edge-case fixtures (ok=false) for stable error contract.
    def _check_checkout_error(d, name: str):
        _require(isinstance(d.get("error"), str) and d.get("error"), f"{name}: error must be a string")
        details = d.get("details")
        _require_dict(details, f"{name}: details must be an object")
        # code and requestId are highly useful for staff troubleshooting.
        _require("requestId" in details, f"{name}: details.requestId must exist")

    check("circ_checkout_block", lambda d: _check_checkout_error(d, "circ_checkout_block"), allow_error=True)
    check("circ_checkout_bad_patron", lambda d: _check_checkout_error(d, "circ_checkout_bad_patron"), allow_error=True)

    if failures:
        for f in failures:
            print(f"[contract] FAIL: {f}", file=sys.stderr)
        return 1

    print("[contract] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
