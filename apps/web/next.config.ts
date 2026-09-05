import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Next.js compile the raw TS in the shared-types workspace package directly,
  // instead of requiring it to be pre-built to JS.
  transpilePackages: ["@zaks/shared-types"],
};

export default nextConfig;
