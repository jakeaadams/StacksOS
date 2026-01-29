import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow access from local network
  allowedDevOrigins: ["192.168.1.233", "192.168.1.232", "localhost"],

  // Production optimizations
  compiler: {
    // Remove console.* in production
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },

  // Experimental optimizations
  experimental: {
    // Optimize package imports for faster builds
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
    ],
  },

  // Image optimization
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Production build optimizations
  productionBrowserSourceMaps: false,
  swcMinify: true,

  // Bundle analyzer (enable with ANALYZE=true)
  ...(process.env.ANALYZE === "true" && {
    webpack(config: any) {
      const { BundleAnalyzerPlugin } = require("@next/bundle-analyzer")();
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: "static",
          reportFilename: "./analyze/client.html",
          openAnalyzer: false,
        })
      );
      return config;
    },
  }),
};

export default nextConfig;
