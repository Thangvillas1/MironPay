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
    // Static design handoffs and generated prototype bundles are reference
    // artifacts, not source shipped by the Next.js application.
    "**/design_handoff*/**",
    "**/*_unzip/**",
    "wallet design/**",
    "ẢNH/**",
    ".claude/**",
    "scratch/**",
  ]),
]);

export default eslintConfig;
