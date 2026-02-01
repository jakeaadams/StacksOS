import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
OUT_DIR = Path(os.environ.get("OUT_DIR", str(Path.cwd() / "audit" / "perf")))
OUT_DIR.mkdir(parents=True, exist_ok=True)
COOKIE_JAR = OUT_DIR / "cookies.txt"
COOKIE_JAR_SEED = os.environ.get("COOKIE_JAR_SEED", "")
CSRF_TOKEN = ""

ITERATIONS = int(os.environ.get("ITERATIONS", "30"))

PATRON_BARCODE = os.environ.get("PATRON_BARCODE", "")
ITEM_BARCODE = os.environ.get("ITEM_BARCODE", "39000000001235")
WORKSTATION = os.environ.get("WORKSTATION", "STACKSOS-PERF")

BUDGETS = {
    "checkout_p95_ms": int(os.environ.get("PERF_CHECKOUT_P95_MS", "350")),
    "checkin_p95_ms": int(os.environ.get("PERF_CHECKIN_P95_MS", "350")),
    "patron_search_p95_ms": int(os.environ.get("PERF_PATRON_SEARCH_P95_MS", "200")),
    "catalog_search_p95_ms": int(os.environ.get("PERF_CATALOG_SEARCH_P95_MS", "200")),
    "holds_patron_p95_ms": int(os.environ.get("PERF_HOLDS_PATRON_P95_MS", "250")),
    "bills_p95_ms": int(os.environ.get("PERF_BILLS_P95_MS", "400")),
}


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def curl_time(url: str, method: str = "GET", json_body: dict | None = None) -> float:
    # Returns time_total in seconds.
    cmd = ["curl", "-sS", "-o", "/dev/null", "-w", "%{time_total}"]
    cmd += ["-b", str(COOKIE_JAR), "-c", str(COOKIE_JAR)]

    if method != "GET":
        if not CSRF_TOKEN:
            raise RuntimeError("CSRF token missing; call ensure_csrf_token() first")
        cmd += ["-H", "Content-Type: application/json", "-X", method]
        cmd += ["-H", f"x-csrf-token: {CSRF_TOKEN}"]
        if json_body is not None:
            cmd += ["-d", json.dumps(json_body)]

    cmd.append(url)

    p = run(cmd)
    if p.returncode != 0:
        raise RuntimeError(f"curl failed ({p.returncode}) for {method} {url}: {p.stderr.strip()}")

    try:
        return float(p.stdout.strip())
    except ValueError as e:
        raise RuntimeError(f"Unexpected curl timing output for {method} {url}: {p.stdout!r}") from e


def curl_json(url: str, method: str = "GET", json_body: dict | None = None) -> dict:
    cmd = ["curl", "-sS", "-b", str(COOKIE_JAR), "-c", str(COOKIE_JAR)]
    if method != "GET":
        if not CSRF_TOKEN:
            raise RuntimeError("CSRF token missing; call ensure_csrf_token() first")
        cmd += ["-H", "Content-Type: application/json", "-X", method]
        cmd += ["-H", f"x-csrf-token: {CSRF_TOKEN}"]
        if json_body is not None:
            cmd += ["-d", json.dumps(json_body)]
    cmd.append(url)
    p = run(cmd)
    if p.returncode != 0:
        raise RuntimeError(f"curl failed ({p.returncode}) for {method} {url}: {p.stderr.strip()}")
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise RuntimeError(f"Invalid JSON response for {method} {url}: {p.stdout[:200]!r}") from e


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    k = (len(xs) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return xs[int(k)]
    d0 = xs[f] * (c - k)
    d1 = xs[c] * (k - f)
    return d0 + d1


def to_ms(values: list[float]) -> list[float]:
    return [v * 1000.0 for v in values]


def require_ok(obj: dict, label: str):
    if isinstance(obj, dict) and obj.get("ok") is False:
        raise RuntimeError(f"{label}: ok=false ({obj.get('error')})")


def ensure_csrf_token():
    global CSRF_TOKEN
    res = curl_json(f"{BASE_URL}/api/csrf-token")
    if not isinstance(res, dict) or not res.get("ok") or not res.get("token"):
        raise RuntimeError("Failed to obtain CSRF token")
    CSRF_TOKEN = str(res["token"])


def login():
    ensure_csrf_token()
    res = curl_json(
        f"{BASE_URL}/api/evergreen/auth",
        method="POST",
        json_body={"username": "jake", "password": "jake", "workstation": WORKSTATION},
    )
    require_ok(res, "auth_login")


def get_session_user() -> tuple[int, str]:
    res = curl_json(f"{BASE_URL}/api/evergreen/auth")
    require_ok(res, "auth_session")
    if not res.get("authenticated"):
        return (0, "")
    user = res.get("user") or {}
    pid = user.get("id")
    # auth_session returns user.card as an id on most Evergreen installs (not fleshed).
    # We'll resolve barcode via /api/evergreen/patrons?id=... when needed.
    barcode = ""
    card = user.get("card")
    if isinstance(card, dict):
        barcode = str(card.get("barcode") or "")
    if not isinstance(pid, int):
        pid = 0
    return (pid, str(barcode or ""))


def resolve_patron_barcode(patron_id: int) -> str:
    res = curl_json(f"{BASE_URL}/api/evergreen/patrons?id={patron_id}")
    require_ok(res, "patron_by_id")
    patron = res.get("patron") or {}
    if not isinstance(patron, dict):
        return ""
    if patron.get("barcode"):
        return str(patron.get("barcode") or "")
    card = patron.get("card")
    if isinstance(card, dict) and card.get("barcode"):
        return str(card.get("barcode") or "")
    return ""


def main():
    start = time.time()
    if COOKIE_JAR_SEED and Path(COOKIE_JAR_SEED).exists():
        COOKIE_JAR.write_text(Path(COOKIE_JAR_SEED).read_text(encoding="utf-8"), encoding="utf-8")
    else:
        COOKIE_JAR.write_text("", encoding="utf-8")

    ensure_csrf_token()

    patron_id, session_barcode = get_session_user()
    if patron_id <= 0:
        login()
        patron_id, session_barcode = get_session_user()

    global PATRON_BARCODE
    if not PATRON_BARCODE:
        if session_barcode:
            PATRON_BARCODE = session_barcode
        else:
            PATRON_BARCODE = resolve_patron_barcode(patron_id)

    if not PATRON_BARCODE:
        raise RuntimeError("Could not resolve patron barcode for checkout/checkin timing")

    # Warmup (avoid first-call noise)
    _ = curl_time(f"{BASE_URL}/api/evergreen/catalog?q=harry%20potter&type=title&limit=10")
    _ = curl_time(f"{BASE_URL}/api/evergreen/patrons?q=adams&type=name&limit=10")

    checkout_times: list[float] = []
    checkin_times: list[float] = []
    patron_search_times: list[float] = []
    catalog_search_times: list[float] = []
    holds_patron_times: list[float] = []
    bills_times: list[float] = []

    for _i in range(ITERATIONS):
        # Patron search
        patron_search_times.append(
            curl_time(f"{BASE_URL}/api/evergreen/patrons?q=adams&type=name&limit=20")
        )
        # Catalog search
        catalog_search_times.append(
            curl_time(f"{BASE_URL}/api/evergreen/catalog?q=harry%20potter&type=title&limit=20")
        )
        # Holds list
        holds_patron_times.append(
            curl_time(f"{BASE_URL}/api/evergreen/holds?action=patron_holds&patron_id={patron_id}")
        )
        # Bills
        bills_times.append(
            curl_time(f"{BASE_URL}/api/evergreen/circulation?action=bills&patron_id={patron_id}")
        )

        # Ensure item checked in before checkout (not timed)
        _ = curl_json(
            f"{BASE_URL}/api/evergreen/circulation",
            method="POST",
            json_body={"action": "checkin", "itemBarcode": ITEM_BARCODE},
        )
        # Timed checkout
        checkout_times.append(
            curl_time(
                f"{BASE_URL}/api/evergreen/circulation",
                method="POST",
                json_body={
                    "action": "checkout",
                    "patronBarcode": PATRON_BARCODE,
                    "itemBarcode": ITEM_BARCODE,
                },
            )
        )
        # Timed checkin
        checkin_times.append(
            curl_time(
                f"{BASE_URL}/api/evergreen/circulation",
                method="POST",
                json_body={"action": "checkin", "itemBarcode": ITEM_BARCODE},
            )
        )

    # Always end checked-in.
    _ = curl_json(
        f"{BASE_URL}/api/evergreen/circulation",
        method="POST",
        json_body={"action": "checkin", "itemBarcode": ITEM_BARCODE},
    )

    metrics = {}
    def summarize(name: str, samples_s: list[float]):
        ms = to_ms(samples_s)
        metrics[name] = {
            "samples": len(ms),
            "p50_ms": round(percentile(ms, 0.50), 2),
            "p95_ms": round(percentile(ms, 0.95), 2),
            "min_ms": round(min(ms), 2) if ms else 0,
            "max_ms": round(max(ms), 2) if ms else 0,
        }

    summarize("checkout", checkout_times)
    summarize("checkin", checkin_times)
    summarize("patron_search", patron_search_times)
    summarize("catalog_search", catalog_search_times)
    summarize("holds_patron", holds_patron_times)
    summarize("bills", bills_times)

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url": BASE_URL,
        "iterations": ITERATIONS,
        "budgets_ms": BUDGETS,
        "metrics": metrics,
        "elapsed_s": round(time.time() - start, 2),
    }

    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # TSV summary (easy to diff)
    lines = ["metric\tsamples\tp50_ms\tp95_ms\tbudget_p95_ms\tpass"]

    def check(metric: str, budget_key: str):
        p95 = metrics[metric]["p95_ms"]
        budget = BUDGETS[budget_key]
        ok = p95 <= budget
        lines.append(
            f"{metric}\t{metrics[metric]['samples']}\t{metrics[metric]['p50_ms']}\t{p95}\t{budget}\t{1 if ok else 0}"
        )
        return ok

    ok_all = True
    ok_all &= check("checkout", "checkout_p95_ms")
    ok_all &= check("checkin", "checkin_p95_ms")
    ok_all &= check("patron_search", "patron_search_p95_ms")
    ok_all &= check("catalog_search", "catalog_search_p95_ms")
    ok_all &= check("holds_patron", "holds_patron_p95_ms")
    ok_all &= check("bills", "bills_p95_ms")

    (OUT_DIR / "summary.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if not ok_all:
        sys.stderr.write("Perf budgets failed. See audit/perf/report.json and audit/perf/summary.tsv\n")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        sys.exit(1)
