import type { NextConfig } from "next";
import os from "node:os";
import { molyResourceBase, molyResourceOrigin } from "./src/lib/moly/resourceOrigin";

const internalApiBase = (process.env.INTERNAL_API_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");

// Moly publishes its control surface and its immutable resources below one
// configured directory. The runtime document has to stay same-origin with the
// page that hands it the audio activation gesture, so the small shell is
// proxied from here; the engine, catalogue and scene assets are fetched
// straight from that directory by the runtime itself and never pass through.
// The proxy destination and the URLs the client builds must come from the
// same validator, or the two would disagree about what is same-origin.
const molyProxyBase = (() => {
  try {
    const base = molyResourceBase();
    const origin = molyResourceOrigin();
    return base || (origin ? `${origin}/moly/` : "");
  } catch {
    throw new Error("Moly resource base/origin configuration is invalid");
  }
})();
const enableLocalHarukiProxy = process.env.NODE_ENV !== "production";

function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);

  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          origins.add(net.address);
        }
      }
    }
  } catch {
    // ignore
  }

  if (process.env.ALLOWED_DEV_ORIGINS) {
    process.env.ALLOWED_DEV_ORIGINS.split(",").forEach((item) => {
      const trimmed = item.trim();
      if (trimmed) origins.add(trimmed);
    });
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  // Keep QA builds separate from a running standalone server on Windows.
  distDir: process.env.MOE_NEXT_DIST_DIR || ".next",
  output: "standalone",
  cacheMaxMemorySize: 50 * 1024 * 1024,
  trailingSlash: true,
  allowedDevOrigins: getAllowedDevOrigins(),
  async redirects() {
    return [
      {
        source: "/prediction",
        destination: "/prediction-next",
        permanent: true,
      },
      {
        source: "/prediction/:path*",
        destination: "/prediction-next/:path*",
        permanent: true,
      },
      {
        source: "/realtime-ranking",
        destination: "/realtime-ranking-next",
        permanent: true,
      },
      {
        source: "/realtime-ranking/:path*",
        destination: "/realtime-ranking-next/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: enableLocalHarukiProxy
        ? [
            {
              source: "/api/haruki-public/:path*",
              destination: "https://suite-api.haruki.seiunx.com/public/:path*",
            },
          ]
        : [],
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${internalApiBase}/api/:path*`,
        },
        ...(molyProxyBase
          ? [
              {
                source: "/moly/:path*",
                destination: `${molyProxyBase}:path*`,
              },
            ]
          : []),
      ],
    };
  },
  turbopack: {
    root: "..",
    resolveAlias: {
      "sekai-calculator": "../refer/re_sekai-calculator/src/index.ts",
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'moe.exmeaning.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.exmeaning.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.pjsk.moe',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'assets.unipjsk.com',
      },
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
      }
    ],
  },

};

export default nextConfig;
