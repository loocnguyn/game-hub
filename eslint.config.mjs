import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These React Compiler rules flag standard three.js / R3F patterns (mutating scene objects in
    // useFrame, "latest ref" callbacks). The compiler is not enabled, so keep them as warnings.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Server code and tests handle untyped JSON from clients on purpose.
    files: ["supabase/functions/**", "tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    ".tmp/**",
    "public/poker/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
