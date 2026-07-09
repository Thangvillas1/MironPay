import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@circle-fin/swap-kit',
    '@circle-fin/adapter-circle-wallets',
  ],
};

export default nextConfig;
