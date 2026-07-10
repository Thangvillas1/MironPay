import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@circle-fin/swap-kit',
    '@circle-fin/adapter-circle-wallets',
  ],
  transpilePackages: [
    '@circle-fin/developer-controlled-wallets',
  ],
  async redirects() {
    return [
      { source: '/login', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
