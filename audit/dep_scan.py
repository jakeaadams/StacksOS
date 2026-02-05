#!/usr/bin/env python3
"""Lightweight TS/TSX dependency scanning for audit scripts.

Goal:
- Improve static audit accuracy by following local imports from Next.js pages.
- Keep it fast and dependency-free (regex-based; not a full TS parser).

Notes:
- We intentionally ignore `import type` and `export type` edges because they
  do not exist at runtime and can inflate usage counts.
- For barrel modules (e.g. `src/components/shared/index.ts`) we selectively
  follow `export { ... } from "./x"` sources when we know the imported names.
  This avoids pulling in the entire barrel surface for every page.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import re
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class ImportEdge:
    source: str
    imported: frozenset[str] | None  # exported names requested by importer, if known
    type_only: bool


IMPORT_FROM_RE = re.compile(
    r"\bimport\s+(?P<type>type\s+)?(?P<clause>[\s\S]*?)\s+from\s+[\"'](?P<src>[^\"']+)[\"']",
    re.MULTILINE,
)
IMPORT_SIDE_EFFECT_RE = re.compile(r"\bimport\s+[\"'](?P<src>[^\"']+)[\"']\s*;?", re.MULTILINE)

EXPORT_NAMED_FROM_RE = re.compile(
    r"\bexport\s+(?P<type>type\s+)?\{\s*(?P<names>[\s\S]*?)\s*\}\s*from\s+[\"'](?P<src>[^\"']+)[\"']",
    re.MULTILINE,
)
EXPORT_STAR_FROM_RE = re.compile(
    r"\bexport\s+\*\s+from\s+[\"'](?P<src>[^\"']+)[\"']",
    re.MULTILINE,
)


def _strip_block_comments(text: str) -> str:
    return re.sub(r"/\*[\s\S]*?\*/", "", text)


def _strip_line_comments(text: str) -> str:
    return re.sub(r"(^|\s)//.*$", r"\1", text, flags=re.MULTILINE)


def strip_comments(text: str) -> str:
    # Keep strings intact; this is only meant to reduce regex overreach.
    return _strip_line_comments(_strip_block_comments(text))


def parse_import_clause(clause: str) -> frozenset[str] | None:
    raw = clause.strip()
    if not raw:
        return None

    # Namespace import: import * as X from "..."
    if raw.startswith("*"):
        return frozenset({"*"})

    imported: set[str] = set()

    # Default + named: import Foo, { Bar as Baz } from "..."
    if "," in raw and "{" in raw:
        default_part, rest = raw.split(",", 1)
        if default_part.strip():
            imported.add("default")
        raw = rest.strip()

    # Default-only: import Foo from "..."
    if "{" not in raw and raw and not raw.startswith("*"):
        imported.add("default")
        return frozenset(imported)

    # Named imports: { A, type B, C as D, default as X }
    m = re.search(r"\{([\s\S]*)\}", raw)
    if not m:
        return frozenset(imported) if imported else None

    inside = m.group(1)
    for part in inside.split(","):
        token = part.strip()
        if not token:
            continue
        token = re.sub(r"^type\s+", "", token)
        # default as Foo  -> exported name Foo
        if token.startswith("default as "):
            imported.add(token.replace("default as ", "", 1).strip())
            continue
        # Foo as Bar -> exported name Foo (import side uses Foo)
        if " as " in token:
            left, _right = token.split(" as ", 1)
            token = left.strip()
        if token:
            imported.add(token)

    return frozenset(imported) if imported else None


@lru_cache(maxsize=4096)
def read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


@lru_cache(maxsize=4096)
def parse_imports(p: Path) -> tuple[ImportEdge, ...]:
    text = strip_comments(read_text(p))
    edges: list[ImportEdge] = []

    for m in IMPORT_FROM_RE.finditer(text):
        src = m.group("src")
        type_only = bool(m.group("type"))
        clause = m.group("clause") or ""
        imported = parse_import_clause(clause)
        edges.append(ImportEdge(source=src, imported=imported, type_only=type_only))

    for m in IMPORT_SIDE_EFFECT_RE.finditer(text):
        src = m.group("src")
        # Side-effect imports are runtime deps.
        edges.append(ImportEdge(source=src, imported=None, type_only=False))

    # Deduplicate stable ordering
    uniq: dict[tuple[str, frozenset[str] | None, bool], ImportEdge] = {}
    for e in edges:
        uniq[(e.source, e.imported, e.type_only)] = e
    return tuple(uniq.values())


@dataclass(frozen=True)
class ExportMap:
    by_name: dict[str, frozenset[str]]  # exported name -> module spec(s)
    stars: frozenset[str]  # export * from ...


@lru_cache(maxsize=4096)
def parse_export_map(p: Path) -> ExportMap:
    text = strip_comments(read_text(p))

    by_name: dict[str, set[str]] = {}
    stars: set[str] = set()

    for m in EXPORT_NAMED_FROM_RE.finditer(text):
        if m.group("type"):
            continue  # export type {...} from "..." is type-only
        src = m.group("src")
        names = m.group("names") or ""
        for part in names.split(","):
            token = part.strip()
            if not token:
                continue
            token = re.sub(r"^type\s+", "", token)
            # default as Foo  -> exported name Foo
            if token.startswith("default as "):
                exported_name = token.replace("default as ", "", 1).strip()
            elif " as " in token:
                _left, right = token.split(" as ", 1)
                exported_name = right.strip()
            else:
                exported_name = token
            if exported_name:
                by_name.setdefault(exported_name, set()).add(src)

    for m in EXPORT_STAR_FROM_RE.finditer(text):
        stars.add(m.group("src"))

    frozen = {k: frozenset(v) for k, v in by_name.items()}
    return ExportMap(by_name=frozen, stars=frozenset(stars))


def resolve_import(root: Path, current_file: Path, spec: str) -> Path | None:
    if not spec:
        return None
    # Ignore node builtins / packages.
    if not spec.startswith(("./", "../", "@/")):
        return None

    if spec.startswith("@/"):
        base = root / "src" / spec[2:]
    else:
        base = (current_file.parent / spec).resolve()

    # If it already exists as-is, return.
    if base.exists() and base.is_file():
        return base

    # Try extensions.
    exts = [".ts", ".tsx", ".js", ".jsx"]
    for ext in exts:
        candidate = Path(str(base) + ext)
        if candidate.exists() and candidate.is_file():
            return candidate

    # Try index files if base is a directory (or would be).
    for ext in exts:
        candidate = base / ("index" + ext)
        if candidate.exists() and candidate.is_file():
            return candidate

    return None


def dependency_closure(
    root: Path,
    entry_points: Iterable[Path],
    max_files: int = 600,
) -> set[Path]:
    """Return the set of local source files reachable from `entry_points`."""
    visited: set[Path] = set()
    queue: list[tuple[Path, frozenset[str] | None]] = []

    for ep in entry_points:
        if ep.exists() and ep.is_file():
            queue.append((ep.resolve(), None))

    while queue:
        path, requested = queue.pop()
        if path in visited:
            continue
        visited.add(path)
        if len(visited) > max_files:
            # Bail out to avoid runaway scans (barrel explosion).
            break

        # Expand barrel exports when we know what the importer asked for.
        if requested:
            export_map = parse_export_map(path)
            follow_specs: set[str] = set()

            if "*" in requested or "default" in requested:
                # Namespace/default import: we cannot safely select.
                follow_specs |= set(export_map.stars)
                for specs in export_map.by_name.values():
                    follow_specs |= set(specs)
            else:
                for name in requested:
                    if name in export_map.by_name:
                        follow_specs |= set(export_map.by_name[name])
                # If we couldn't resolve names, fall back to star exports.
                if not follow_specs and export_map.stars:
                    follow_specs |= set(export_map.stars)

            for spec in sorted(follow_specs):
                resolved = resolve_import(root, path, spec)
                if resolved:
                    queue.append((resolved, None))

        for edge in parse_imports(path):
            if edge.type_only:
                continue
            resolved = resolve_import(root, path, edge.source)
            if not resolved:
                continue
            queue.append((resolved, edge.imported))

    return visited

