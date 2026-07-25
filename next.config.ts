import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Client router cache. The default for dynamic routes is 0, so going back to
    // a page already visited refetches it and flashes loading.tsx again. The
    // vitrine data is cached server-side anyway (see src/lib/cache.ts), so
    // holding it for 30s in the router makes navigation between pages instant.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
