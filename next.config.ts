import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@circle-fin/swap-kit',
    '@circle-fin/adapter-circle-wallets',
  ],
  transpilePackages: [
    '@circle-fin/developer-controlled-wallets',
  ],
};

export default nextConfig;
