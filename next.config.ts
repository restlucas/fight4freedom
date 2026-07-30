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
      // BF6 rank insignia on the identity screen (/confirmar-conta). The card has
      // to LOOK like the member's own game for them to recognise it at a glance,
      // and this is the artwork EA's own payload points at. Narrowed to the rank
      // path so the optimizer cannot be aimed at anything else on that CDN.
      {
        protocol: "https",
        hostname: "cdn.gametools.network",
        pathname: "/ranks/**",
      },
      // Fase 10: the best weapon and most-played map in the profile panel. Both are
      // `.webp` on the same CDN. Narrowed per path, like the rank insignia above, so
      // the optimizer cannot be aimed at anything else there.
      //
      // NOT `/modes/**`, and that omission is deliberate: mode artwork is SVG, and
      // serving third-party SVG through next/image requires `dangerouslyAllowSVG`,
      // which accepts script inside a file we do not control. The mode row uses our
      // own icon, and the collector drops that URL at the source.
      {
        protocol: "https",
        hostname: "cdn.gametools.network",
        pathname: "/weapons/**",
      },
      {
        protocol: "https",
        hostname: "cdn.gametools.network",
        pathname: "/maps/**",
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
