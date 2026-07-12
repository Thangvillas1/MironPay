import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // adapter-circle-wallets internally imports developer-controlled-wallets
  // with a named ESM import. developer-controlled-wallets is transpiled (see
  // below), but that only rewrites *our* imports of it — adapter-circle-wallets
  // itself still has to go through transpilePackages too, or its own internal
  // import of that CJS-only package fails as an untranspiled external at
  // runtime on Vercel ("Named export ... not found"). swap-kit imports
  // adapter-circle-wallets the same way, so it needs the same treatment.
  transpilePackages: [
    '@circle-fin/developer-controlled-wallets',
    '@circle-fin/adapter-circle-wallets',
    '@circle-fin/swap-kit',
  ],
  async redirects() {
    return [
      { source: '/login', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
