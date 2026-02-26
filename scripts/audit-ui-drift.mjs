#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const UI_ROOTS = ["src/app", "src/components"];
const OUTPUT_DIR = path.join(ROOT, "audit", "ui-drift");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "summary.json");
const OUTPUT_TSV = path.join(OUTPUT_DIR, "files.tsv");
const OUTPUT_MD = path.join(OUTPUT_DIR, "REPORT.md");

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "password",
  "number",
  "tel",
  "url",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

const CHOICE_INPUT_TYPES = new Set(["checkbox", "radio", "range", "color", "file"]);
const ACTION_INPUT_TYPES = new Set(["submit", "reset", "button", "hidden", "image"]);

const rx = {
  button: /<button\b/g,
  inputTag: /<input\b[^>]*>/g,
  select: /<select\b/g,
  textarea: /<textarea\b/g,
  inlineStyle: /style=\{\{/g,
  hrefHash: /href=["']#["']/g,
  placeholderText: /\b(?:coming\s+soon|not\s+implemented|placeholder\s+ui|todo(?:\b|:))\b/gi,
  purplePalette: /\b(?:bg|text|border|from|to|via|ring|stroke|fill)-(?:purple|violet|fuchsia|pink)-\d{2,3}\b/g,
  legacyPrimaryCombo: /bg-primary-600\s+text-white/g,
  legacySurfaceCombo: /bg-card\s+rounded-xl\s+shadow-sm\s+border\s+border-border/g,
  buttonImport: /from\s+["']@\/components\/ui\/button["']/,
  inputImport: /from\s+["']@\/components\/ui\/input["']/,
  selectImport: /from\s+["']@\/components\/ui\/select["']/,
  textareaImport: /from\s+["']@\/components\/ui\/textarea["']/,
};

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

async function walkTsxFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "audit") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTsxFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

function analyzeInputTags(text) {
  const tags = [...text.matchAll(rx.inputTag)].map((m) => m[0]);
  let textInputs = 0;
  let choiceInputs = 0;
  let actionInputs = 0;

  for (const tag of tags) {
    const typeMatch = tag.match(/\btype\s*=\s*(["'])([^"']+)\1/i);
    const type = (typeMatch?.[2] || "").toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) {
      textInputs += 1;
      continue;
    }
    if (CHOICE_INPUT_TYPES.has(type)) {
      choiceInputs += 1;
      continue;
    }
    if (ACTION_INPUT_TYPES.has(type)) {
      actionInputs += 1;
      continue;
    }
    textInputs += 1;
  }

  return { totalInputs: tags.length, textInputs, choiceInputs, actionInputs };
}

function calcScore(m) {
  return (
    m.inlineStyles * 2 +
    m.paletteDrift * 1 +
    m.legacyPrimaryCombo * 5 +
    m.legacySurfaceCombo * 5 +
    m.hrefHash * 6 +
    m.placeholderText * 4 +
    m.missingButtonPrimitive * 3 +
    m.missingInputPrimitive * 3 +
    m.missingSelectPrimitive * 3 +
    m.missingTextareaPrimitive * 2
  );
}

function issueList(m) {
  const issues = [];
  if (m.legacyPrimaryCombo > 0 || m.legacySurfaceCombo > 0) issues.push("legacy_class_combo");
  if (m.hrefHash > 0) issues.push("dead_link_hash");
  if (m.placeholderText > 0) issues.push("placeholder_text");
  if (m.inlineStyles > 0) issues.push("inline_style");
  if (m.paletteDrift > 0) issues.push("hardcoded_palette");
  if (m.missingButtonPrimitive > 0) issues.push("raw_button_without_ui_button");
  if (m.missingInputPrimitive > 0) issues.push("text_input_without_ui_input");
  if (m.missingSelectPrimitive > 0) issues.push("select_without_ui_select");
  if (m.missingTextareaPrimitive > 0) issues.push("textarea_without_ui_textarea");
  return issues;
}

function summarizeTotals(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.files += 1;
      acc.rawButtons += row.rawButtons;
      acc.totalInputs += row.totalInputs;
      acc.textInputs += row.textInputs;
      acc.choiceInputs += row.choiceInputs;
      acc.actionInputs += row.actionInputs;
      acc.rawSelects += row.rawSelects;
      acc.rawTextareas += row.rawTextareas;
      acc.inlineStyles += row.inlineStyles;
      acc.purplePaletteClasses += row.purplePaletteClasses;
      acc.paletteDrift += row.paletteDrift;
      acc.legacyPrimaryCombo += row.legacyPrimaryCombo;
      acc.legacySurfaceCombo += row.legacySurfaceCombo;
      acc.hrefHash += row.hrefHash;
      acc.placeholderText += row.placeholderText;
      acc.missingButtonPrimitive += row.missingButtonPrimitive;
      acc.missingInputPrimitive += row.missingInputPrimitive;
      acc.missingSelectPrimitive += row.missingSelectPrimitive;
      acc.missingTextareaPrimitive += row.missingTextareaPrimitive;
      acc.totalScore += row.score;
      return acc;
    },
    {
      files: 0,
      rawButtons: 0,
      totalInputs: 0,
      textInputs: 0,
      choiceInputs: 0,
      actionInputs: 0,
      rawSelects: 0,
      rawTextareas: 0,
      inlineStyles: 0,
      purplePaletteClasses: 0,
      paletteDrift: 0,
      legacyPrimaryCombo: 0,
      legacySurfaceCombo: 0,
      hrefHash: 0,
      placeholderText: 0,
      missingButtonPrimitive: 0,
      missingInputPrimitive: 0,
      missingSelectPrimitive: 0,
      missingTextareaPrimitive: 0,
      totalScore: 0,
    }
  );
}

function mdTable(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

async function main() {
  const roots = [];
  for (const relRoot of UI_ROOTS) {
    const abs = path.join(ROOT, relRoot);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) roots.push(abs);
    } catch {
      // Ignore missing roots.
    }
  }

  const files = [];
  for (const absRoot of roots) {
    files.push(...(await walkTsxFiles(absRoot)));
  }
  files.sort((a, b) => normalize(a).localeCompare(normalize(b)));

  const rows = [];

  for (const file of files) {
    const relPath = normalize(path.relative(ROOT, file));
    const content = await fs.readFile(file, "utf8");

    const rawButtons = countMatches(content, rx.button);
    const { totalInputs, textInputs, choiceInputs, actionInputs } = analyzeInputTags(content);
    const rawSelects = countMatches(content, rx.select);
    const rawTextareas = countMatches(content, rx.textarea);
    const inlineStyles = countMatches(content, rx.inlineStyle);
    const purplePaletteClasses = countMatches(content, rx.purplePalette);
    const legacyPrimaryCombo = countMatches(content, rx.legacyPrimaryCombo);
    const legacySurfaceCombo = countMatches(content, rx.legacySurfaceCombo);
    const hrefHash = countMatches(content, rx.hrefHash);
    const placeholderText = countMatches(content, rx.placeholderText);

    const hasButtonImport = rx.buttonImport.test(content);
    const hasInputImport = rx.inputImport.test(content);
    const hasSelectImport = rx.selectImport.test(content);
    const hasTextareaImport = rx.textareaImport.test(content);

    const expressivePaletteAllowed =
      /^src\/app\/opac\/(kids|teens)(\/|$)/.test(relPath) ||
      /^src\/components\/opac\/kids(\/|$)/.test(relPath);
    const paletteDrift = expressivePaletteAllowed ? 0 : purplePaletteClasses;

    const skipButtonPrimitiveCheck = relPath === "src/components/ui/button.tsx";
    const skipInputPrimitiveCheck = relPath === "src/components/ui/input.tsx";
    const skipSelectPrimitiveCheck = relPath === "src/components/ui/select.tsx";
    const skipTextareaPrimitiveCheck = relPath === "src/components/ui/textarea.tsx";

    const missingButtonPrimitive =
      rawButtons >= 3 && !hasButtonImport && !skipButtonPrimitiveCheck ? 1 : 0;
    const missingInputPrimitive =
      textInputs >= 2 && !hasInputImport && !skipInputPrimitiveCheck ? 1 : 0;
    const missingSelectPrimitive =
      rawSelects >= 1 && !hasSelectImport && !skipSelectPrimitiveCheck ? 1 : 0;
    const missingTextareaPrimitive =
      rawTextareas >= 1 && !hasTextareaImport && !skipTextareaPrimitiveCheck ? 1 : 0;

    const metrics = {
      file: relPath,
      rawButtons,
      totalInputs,
      textInputs,
      choiceInputs,
      actionInputs,
      rawSelects,
      rawTextareas,
      inlineStyles,
      purplePaletteClasses,
      paletteDrift,
      legacyPrimaryCombo,
      legacySurfaceCombo,
      hrefHash,
      placeholderText,
      missingButtonPrimitive,
      missingInputPrimitive,
      missingSelectPrimitive,
      missingTextareaPrimitive,
    };

    const score = calcScore(metrics);
    rows.push({ ...metrics, score, issues: issueList(metrics) });
  }

  const sortedByScore = [...rows].sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  const totals = summarizeTotals(rows);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await fs.writeFile(
    OUTPUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        roots: UI_ROOTS,
        totals,
        files: sortedByScore,
      },
      null,
      2
    ),
    "utf8"
  );

  const tsvHeader = [
    "file",
    "score",
    "raw_buttons",
    "text_inputs",
    "choice_inputs",
    "action_inputs",
    "selects",
    "textareas",
    "inline_styles",
    "purple_palette",
    "palette_drift",
    "legacy_primary_combo",
    "legacy_surface_combo",
    "href_hash",
    "placeholder_text",
    "missing_button_primitive",
    "missing_input_primitive",
    "missing_select_primitive",
    "missing_textarea_primitive",
    "issues",
  ];

  const tsvRows = [tsvHeader.join("\t")];
  for (const row of sortedByScore) {
    tsvRows.push(
      [
        row.file,
        row.score,
        row.rawButtons,
        row.textInputs,
        row.choiceInputs,
        row.actionInputs,
        row.rawSelects,
        row.rawTextareas,
        row.inlineStyles,
        row.purplePaletteClasses,
        row.paletteDrift,
        row.legacyPrimaryCombo,
        row.legacySurfaceCombo,
        row.hrefHash,
        row.placeholderText,
        row.missingButtonPrimitive,
        row.missingInputPrimitive,
        row.missingSelectPrimitive,
        row.missingTextareaPrimitive,
        row.issues.join(","),
      ].join("\t")
    );
  }

  await fs.writeFile(OUTPUT_TSV, `${tsvRows.join("\n")}\n`, "utf8");

  const nonZeroRows = sortedByScore.filter((r) => r.score > 0);
  const topRows = sortedByScore.slice(0, 40);

  const mdLines = [];
  mdLines.push("# StacksOS UI/UX Drift Report");
  mdLines.push("");
  mdLines.push(`Generated: ${new Date().toISOString()}`);
  mdLines.push("");
  mdLines.push(`Scanned roots: ${UI_ROOTS.join(", ")}`);
  mdLines.push(`Scanned files: ${rows.length}`);
  mdLines.push(`Files with non-zero drift score: ${nonZeroRows.length}`);
  mdLines.push("");
  mdLines.push("## Totals");
  mdLines.push("");
  mdLines.push(
    mdTable(
      ["metric", "value"],
      [
        ["raw_buttons", totals.rawButtons],
        ["text_inputs", totals.textInputs],
        ["choice_inputs", totals.choiceInputs],
        ["action_inputs", totals.actionInputs],
        ["selects", totals.rawSelects],
        ["textareas", totals.rawTextareas],
        ["inline_styles", totals.inlineStyles],
        ["purple_palette_classes", totals.purplePaletteClasses],
        ["palette_drift_classes", totals.paletteDrift],
        ["legacy_primary_combo", totals.legacyPrimaryCombo],
        ["legacy_surface_combo", totals.legacySurfaceCombo],
        ["href_hash", totals.hrefHash],
        ["placeholder_text", totals.placeholderText],
        ["missing_button_primitive_files", totals.missingButtonPrimitive],
        ["missing_input_primitive_files", totals.missingInputPrimitive],
        ["missing_select_primitive_files", totals.missingSelectPrimitive],
        ["missing_textarea_primitive_files", totals.missingTextareaPrimitive],
        ["aggregate_score", totals.totalScore],
      ]
    )
  );
  mdLines.push("");
  mdLines.push("## Top Drift Files (Top 40)");
  mdLines.push("");
  mdLines.push(
    mdTable(
      [
        "score",
        "file",
        "buttons",
        "text_inputs",
        "selects",
        "textareas",
        "inline",
        "purple",
        "palette_drift",
        "legacy",
        "issues",
      ],
      topRows.map((r) => [
        String(r.score),
        `\`${r.file}\``,
        String(r.rawButtons),
        String(r.textInputs),
        String(r.rawSelects),
        String(r.rawTextareas),
        String(r.inlineStyles),
        String(r.purplePaletteClasses),
        String(r.paletteDrift),
        String(r.legacyPrimaryCombo + r.legacySurfaceCombo),
        r.issues.length ? r.issues.join(", ") : "-",
      ])
    )
  );
  mdLines.push("");
  mdLines.push("## File-by-File Detail");
  mdLines.push("");
  mdLines.push(
    mdTable(
      [
        "file",
        "score",
        "buttons",
        "text_inputs",
        "choice_inputs",
        "selects",
        "textareas",
        "inline",
        "purple",
        "palette_drift",
        "legacy",
        "issues",
      ],
      sortedByScore.map((r) => [
        `\`${r.file}\``,
        String(r.score),
        String(r.rawButtons),
        String(r.textInputs),
        String(r.choiceInputs),
        String(r.rawSelects),
        String(r.rawTextareas),
        String(r.inlineStyles),
        String(r.purplePaletteClasses),
        String(r.paletteDrift),
        String(r.legacyPrimaryCombo + r.legacySurfaceCombo),
        r.issues.length ? r.issues.join(", ") : "-",
      ])
    )
  );

  await fs.writeFile(OUTPUT_MD, `${mdLines.join("\n")}\n`, "utf8");

  console.log(`UI drift report written:`);
  console.log(`- ${normalize(path.relative(ROOT, OUTPUT_MD))}`);
  console.log(`- ${normalize(path.relative(ROOT, OUTPUT_JSON))}`);
  console.log(`- ${normalize(path.relative(ROOT, OUTPUT_TSV))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
