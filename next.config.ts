import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These resolve their bundled binary paths relative to __dirname at import
  // time — Next's default bundling rewrites that, breaking the path (observed
  // resolving to a nonsense "\ROOT\..." path). Keeping them external makes
  // Next `require()` them normally from node_modules instead.
  serverExternalPackages: [
    "ffmpeg-static",
    "ffprobe-static",
    "ytdlp-nodejs",
    "@vladmandic/face-api",
    "@tensorflow/tfjs-backend-wasm",
  ],
};

export default nextConfig;
