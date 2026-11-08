import type { NextConfig } from "next";
import { getEnv } from "./src/lib/env";

// Fail fast on `next dev` / `next build` / `next start` when a required
// variable is missing. `next typegen` only generates route types (used by
// `pnpm typecheck` in CI, where no env vars exist), so it is skipped.
if (!process.argv.includes("typegen")) {
  getEnv();
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
