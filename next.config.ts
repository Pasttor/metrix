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
  logging: {
    // The dev server logs full request URLs. OAuth callbacks carry `code` and the
    // magic link carries `token_hash`/`code`, which must never reach a log.
    incomingRequests: { ignore: [/\/api\/connect\/[^/]+\/callback/, /\/auth\/confirm/, /[?&](code|token_hash|state)=/] },
  },
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
