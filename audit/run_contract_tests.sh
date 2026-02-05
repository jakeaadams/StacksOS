#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export ROOT_DIR

python3 "$ROOT_DIR/audit/contract_tests.py"
python3 "$ROOT_DIR/audit/test_dep_scan.py"
