import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
