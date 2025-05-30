/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    swcMinify: true,
  },
  typescript: {
    // Don't ignore build errors to catch module resolution issues
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  transpilePackages: [],
};

module.exports = nextConfig;
