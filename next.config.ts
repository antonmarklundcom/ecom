import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // mysql2 usa APIs de Node que el bundler no debe tocar.
  serverExternalPackages: ["mysql2"],
  images: {
    // Cloudinary ya optimiza con f_auto,q_auto; ver ARCH.md §6.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

export default nextConfig;
