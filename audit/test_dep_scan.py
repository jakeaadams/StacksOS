import tempfile
import textwrap
import unittest
from pathlib import Path

from dep_scan import (
    dependency_closure,
    parse_export_map,
    parse_import_clause,
    parse_imports,
    resolve_import,
    strip_comments,
)


class DepScanTests(unittest.TestCase):
    def test_strip_comments_removes_block_and_line_comments(self):
        src = textwrap.dedent(
            """
            // line comment
            import { A } from "./a"; /* block comment */
            const x = 1; // trailing
            """
        ).strip()
        out = strip_comments(src)
        self.assertIn('import { A } from "./a";', out)
        self.assertNotIn("line comment", out)
        self.assertNotIn("block comment", out)
        self.assertNotIn("trailing", out)

    def test_parse_import_clause_handles_common_forms(self):
        self.assertEqual(parse_import_clause("Foo"), frozenset({"default"}))
        self.assertEqual(parse_import_clause("{ Bar }"), frozenset({"Bar"}))
        self.assertEqual(parse_import_clause("* as React"), frozenset({"*"}))
        self.assertEqual(parse_import_clause("Foo, { Bar as Baz }"), frozenset({"default", "Bar"}))
        self.assertEqual(parse_import_clause("{ default as X }"), frozenset({"X"}))

    def test_parse_imports_marks_type_only_imports(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "x.ts"
            p.write_text(
                textwrap.dedent(
                    """
                    import type { A } from "./a";
                    import Foo, { Bar as Baz } from "./b";
                    import "./c";
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )

            edges = parse_imports(p)
            self.assertEqual({e.source for e in edges}, {"./a", "./b", "./c"})

            type_edge = [e for e in edges if e.source == "./a"][0]
            self.assertTrue(type_edge.type_only)
            self.assertEqual(type_edge.imported, frozenset({"A"}))

            b_edge = [e for e in edges if e.source == "./b"][0]
            self.assertFalse(b_edge.type_only)
            self.assertEqual(b_edge.imported, frozenset({"default", "Bar"}))

            c_edge = [e for e in edges if e.source == "./c"][0]
            self.assertFalse(c_edge.type_only)
            self.assertIsNone(c_edge.imported)

    def test_parse_export_map_tracks_named_and_star_exports(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "index.ts"
            p.write_text(
                textwrap.dedent(
                    """
                    export { Foo, Bar as Baz } from "./m1";
                    export type { T } from "./types";
                    export * from "./star";
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            m = parse_export_map(p)
            self.assertEqual(m.by_name["Foo"], frozenset({"./m1"}))
            self.assertEqual(m.by_name["Baz"], frozenset({"./m1"}))
            self.assertNotIn("T", m.by_name)
            self.assertIn("./star", m.stars)

    def test_resolve_import_supports_at_alias_and_index(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "src" / "lib").mkdir(parents=True)
            (root / "src" / "components" / "shared").mkdir(parents=True)
            (root / "src" / "lib" / "x.ts").write_text("export const x = 1;\n", encoding="utf-8")
            (root / "src" / "components" / "shared" / "index.ts").write_text(
                "export const y = 1;\n", encoding="utf-8"
            )
            current = root / "src" / "app" / "page.tsx"
            current.parent.mkdir(parents=True)
            current.write_text("export default function Page() { return null }\n", encoding="utf-8")

            self.assertEqual(resolve_import(root, current, "@/lib/x"), root / "src" / "lib" / "x.ts")
            self.assertEqual(
                resolve_import(root, current, "@/components/shared"), root / "src" / "components" / "shared" / "index.ts"
            )

    def test_dependency_closure_follows_named_exports_from_barrel(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)

            # Entry page imports from shared barrel.
            page = root / "src" / "app" / "page.tsx"
            page.parent.mkdir(parents=True, exist_ok=True)
            page.write_text(
                'import { PageContainer } from "@/components/shared";\nexport default function Page() { return PageContainer }\n',
                encoding="utf-8",
            )

            shared_dir = root / "src" / "components" / "shared"
            shared_dir.mkdir(parents=True, exist_ok=True)
            (shared_dir / "index.ts").write_text(
                textwrap.dedent(
                    """
                    export { PageContainer } from "./page-container";
                    export { SomethingElse } from "./other";
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            (shared_dir / "page-container.tsx").write_text(
                'import "./side-effect";\nexport const PageContainer = () => null;\n', encoding="utf-8"
            )
            (shared_dir / "other.ts").write_text("export const SomethingElse = 1;\n", encoding="utf-8")
            (shared_dir / "side-effect.ts").write_text("export {};\n", encoding="utf-8")

            closure = dependency_closure(root, [page], max_files=50)
            rel = {p.relative_to(root).as_posix() for p in closure}

            self.assertIn("src/app/page.tsx", rel)
            self.assertIn("src/components/shared/index.ts", rel)
            self.assertIn("src/components/shared/page-container.tsx", rel)
            self.assertIn("src/components/shared/side-effect.ts", rel)

            # Should not follow unrelated named exports when we know what we asked for.
            self.assertNotIn("src/components/shared/other.ts", rel)


if __name__ == "__main__":
    unittest.main()

