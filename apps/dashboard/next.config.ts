import type { NextConfig } from 'next';

const API_INTERNAL = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      // لوحة التحكم والودجت يمرران عبر نفس الأصل — الكعكات تتدفق بشكل آمن
      { source: '/backend/:path*', destination: `${API_INTERNAL}/:path*` },
      { source: '/w.js', destination: `${API_INTERNAL}/w.js` },
      { source: '/w-assets/:path*', destination: `${API_INTERNAL}/w-assets/:path*` },
      { source: '/assets/:path*', destination: `${API_INTERNAL}/assets/:path*` },
      { source: '/w/:path*', destination: `${API_INTERNAL}/w/:path*` },
    ];
  },
};

export default nextConfig;
