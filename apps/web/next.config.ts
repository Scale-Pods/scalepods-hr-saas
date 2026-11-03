import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@scalepods/core"],
  experimental: {
    optimizePackageImports: ["lucide-react", "@tanstack/react-query", "recharts", "date-fns"],
  },
  compress: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
