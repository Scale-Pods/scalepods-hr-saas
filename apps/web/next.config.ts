import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@scalepods/core"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
