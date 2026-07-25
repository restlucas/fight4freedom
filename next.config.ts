import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Medal artwork lives in Supabase Storage and MedalEmblem renders it with
    // next/image, which refuses any host that is not listed here. Narrowed to the
    // public object path so the optimizer cannot be pointed at anything else.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // Client router cache. The default for dynamic routes is 0, so going back to
    // a page already visited refetches it and flashes loading.tsx again. The
    // vitrine data is cached server-side anyway (see src/lib/cache.ts), so
    // holding it for 30s in the router makes navigation between pages instant.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
