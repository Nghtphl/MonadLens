import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // solc ships a large emscripten build loaded via require(); keep it out of the bundle.
  serverExternalPackages: ["solc"],
  // /api/explain reads docs/monad/*.md at runtime as the AI's only Monad context (CLAUDE.md §13).
  outputFileTracingIncludes: {
    "/api/explain": ["./docs/monad/**/*.md"],
  },
};

export default nextConfig;
