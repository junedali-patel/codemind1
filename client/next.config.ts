import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dev output separate from production build output to avoid
  // manifest/cache corruption when both flows run on the same machine.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  webpack: (config, { dev }) => {
    if (dev) {
      // Filesystem cache can fail with ENOENT on some environments when
      // cache packs are rotated while requests are in-flight.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
