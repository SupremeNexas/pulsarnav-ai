import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const ignoredPaths = [
  ".next/**",
  "node_modules/**",
  "app.bak/**",
  "components.bak/**",
  "lib.bak/**",
  "stitch_pulsarnav_ai_landing_page/**",
  "claude-obsidian/**",
  "offline-ui/**",
  "output/**",
  "NANOGrav_12yv4/**",
];

export default [
  { ignores: ignoredPaths },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
