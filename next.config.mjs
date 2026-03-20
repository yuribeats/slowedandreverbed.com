/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@yuribeats/audio-utils"],
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/generate-video": ["./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
