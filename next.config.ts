import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webflow Cloud sets basePath/assetPrefix from the mount path at build time.
  // Do NOT set basePath or assetPrefix here (per the handoff spec).
  eslint: {
    // Keep deploys unblocked by lint; we lint separately.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

// Enables Cloudflare bindings (DB / SESSIONS / MEDIA) during `next dev`,
// so local development behaves like Webflow Cloud.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
