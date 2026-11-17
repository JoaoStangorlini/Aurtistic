import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "servidor/**",
    "edge-daemon/**",
    "android/**",
    "Aurtistic/**",
    "public/sw.js",
    "*.js",
    "scripts/**",
    "tests/**",
    "scratch/**",
    "src/contexts/VaultUploadContext.tsx",
    "src/components/dashboard/TasksView.tsx",
    "src/components/dashboard/TaskFormModal.tsx",
    "src/components/dashboard/PortfolioClient.tsx",
    "src/components/portfolio/AurtisticGalleryGrid.tsx",
  ]),
]);

export default eslintConfig;
