import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// NOTE: OpenSRF/Fieldmapper payloads are inherently dynamic.
// We keep eslint strict for real bugs, but allow `any` while we incrementally
// add domain types.
//
// Also: the React Compiler / react-hooks rule-set is still evolving.
// Several rules are currently too noisy for this codebase and do not reflect
// runtime behavior (for example, flagging normal `useEffect` setState calls).
// We disable those until we adopt them intentionally.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    ".next-ci/**",
    ".next.build/**",
    ".next.prev.*/**",
    ".next.failed.*/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "audit/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      // Incremental: keep this as a warning so we can steadily replace `any`
      // with real domain types without blocking shipping.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Too noisy / not actionable yet.
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },

  // OpenSRF / Fieldmapper payloads are inherently dynamic today.
  // We allow `any` in these integration-heavy modules while we add domain types.
  {
    files: ["src/lib/api/**", "src/app/api/**", "src/lib/db/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
