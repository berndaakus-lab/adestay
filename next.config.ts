import type { NextConfig } from "next";

// Public hostel photos: only this project's public bucket can go through the image optimizer.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const imageHost = supabaseUrl?.startsWith("https://") ? new URL(supabaseUrl).hostname : null;

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  images: {
    qualities: [75],
    remotePatterns: imageHost
      ? [{ protocol: "https", hostname: imageHost, pathname: "/storage/v1/object/public/tenant-public/**" }]
      : [],
  },
  experimental: {
    serverActions: {
      // Image uploads: 5 MB file limit (src/lib/server/uploads) plus multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
