import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
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
