import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendor files
    "public/sw.js",
    "public/wasm/**",
    "public/sse-web/**",
    "public/live2d-viewer/**",
    "src/vendor/**",
    // the Live2D story player's release, as it was built (docs/story-live2d-player.md)
    "vendor/sse-web/**",
    // the Live2D model viewer's release, as it was built (docs/live2d-viewer.md)
    "vendor/live2d-viewer/**",
  ]),
]);

export default eslintConfig;
