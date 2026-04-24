import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Ban legacy legal imports from Quick Generate routes.
  // These paths must go through the canonical orchestrator instead.
  {
    name: "nexx/no-legacy-legal-imports",
    files: ["**/src/app/api/documents/generate/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/legal/pdfRenderer",
              message: "Use generateLegalPDF() orchestrator instead of direct PDF rendering.",
            },
            {
              name: "@/lib/legal/courtRules",
              message: "Court rules are resolved inside the orchestrator via jurisdiction profiles.",
            },
            {
              name: "@/lib/legal/templateRenderer",
              message: "Template rendering is handled by the canonical legal document renderer.",
            },
          ],
        },
      ],
    },
  },
  // Ban direct pipeline imports from Create Export routes.
  // All render/validation/PDF logic MUST go through generateExportPDF().
  {
    name: "nexx/no-legacy-export-imports",
    files: ["**/src/app/api/documents/export/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/exports/renderExportHTML",
              message: "Use generateExportPDF() orchestrator instead of direct HTML rendering.",
            },
            {
              name: "@/lib/exports/validateExportDocument",
              message: "Use generateExportPDF() orchestrator instead of direct validation.",
            },
            {
              name: "@/lib/pdf/renderHTMLToPDF",
              message: "Use generateExportPDF() orchestrator instead of direct PDF rendering.",
            },
            {
              name: "@/lib/pdf/validatePdf",
              message: "Use generateExportPDF() orchestrator instead of direct PDF validation.",
            },
          ],
        },
      ],
    },
  },
  // ── React Compiler rule overrides ──
  // eslint-config-next/core-web-vitals enables the React Compiler plugin which
  // flags 24+ pre-existing patterns across 15+ files (setState-in-effect,
  // ref-during-render, preserve-manual-memoization, immutability). Scoped
  // globally because the violations span most feature directories; narrowing to
  // individual file globs would be fragile and require updating on every new
  // component. TODO: Remove once full React Compiler migration is complete.
  {
    name: "nexx/react-compiler-compat",
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
