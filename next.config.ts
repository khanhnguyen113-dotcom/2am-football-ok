import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // receipts/evidence up to 10 MB + form fields
      bodySizeLimit: "11mb",
    },
    proxyClientMaxBodySize: "11mb",
  },
  poweredByHeader: false,
};

export default nextConfig;
