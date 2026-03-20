/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@yuribeats/audio-utils"],
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static"],
    outputFileTracingIncludes: {
      "/api/generate-video": ["./node_modules/ffmpeg-static/**/*"],
    },
  },
};

export default nextConfig;
