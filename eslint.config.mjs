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
]);

export default eslintConfig;
