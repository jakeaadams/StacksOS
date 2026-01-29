import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow access from local network
  allowedDevOrigins: ["192.168.1.233", "192.168.1.232", "localhost"],
};

export default nextConfig;
