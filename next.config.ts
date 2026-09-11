import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Large report screenshots are accepted as data URLs on ingest; keep
  // the body limit aligned with the 2 MB client-side rejection.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
