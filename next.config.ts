import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用实验性功能以提高性能
  experimental: {
    // 优化静态资源传输
    optimizePackageImports: ['mime-types'],
  },

  // 压缩配置
  compress: true,

  // 优化图片加载
  images: {
    minimumCacheTTL: 3600,
    formats: ['image/webp', 'image/avif'],
  },

  // HTTP 头部优化
  async headers() {
    return [
      {
        source: '/api/clone/:jobId/preview/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        source: '/api/clone/:jobId/preview',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
