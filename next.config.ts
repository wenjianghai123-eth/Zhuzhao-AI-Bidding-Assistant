import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  serverExternalPackages: ["better-sqlite3"],
  // The development server is also opened from this workstation's LAN
  // address during browser acceptance. Without this allow-list, Next.js
  // serves the HTML but blocks the client chunks, so interactive controls
  // never hydrate.
  ...(process.env.NODE_ENV === "development"
    ? { allowedDevOrigins: ["192.168.114.168"] }
    : {}),
};

export default nextConfig;
