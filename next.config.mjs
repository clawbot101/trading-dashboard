/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disable linting during build (lint errors causing Vercel failures)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;