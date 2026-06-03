import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / server-only packages must not be bundled by the client or the
  // server compiler. better-sqlite3 is a native addon; pino and the Cursor SDK
  // spawn or load things that must stay external.
  serverExternalPackages: ["better-sqlite3", "pino", "@cursor/sdk"],
  // Dashboard pages are force-dynamic; restore a short client router cache so
  // revisiting a page within 30s feels instant while SQLite still revalidates.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
