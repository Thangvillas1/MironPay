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
  // The PWA (public/app, an Expo web export) is a single-page app: every
  // /app/<route> that isn't a real file falls back to its index.html.
  // (Plain-array rewrites run after static files, so assets still win.)
  async rewrites() {
    return {
      // Public site (static pages in public/site, built from the MironPay
      // Website design): the homepage, docs, security and contracts.
      beforeFiles: [
        { source: '/', destination: '/site/index.html' },
        { source: '/docs', destination: '/site/docs.html' },
        { source: '/security', destination: '/site/security.html' },
        { source: '/contracts', destination: '/site/contracts.html' },
      ],
      afterFiles: [
        { source: '/app', destination: '/app/index.html' },
        { source: '/app/:path*', destination: '/app/index.html' },
        // Beta build of the PWA (separate install, same API) for trying changes safely.
        { source: '/app-beta', destination: '/app-beta/index.html' },
        { source: '/app-beta/:path*', destination: '/app-beta/index.html' },
      ],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: '/login', destination: '/signin', permanent: true },
      // Store is temporarily off while Store v2 is rebuilt — remove these two to bring it back.
      { source: '/store', destination: '/dashboard', permanent: false },
      { source: '/store/:path*', destination: '/dashboard', permanent: false },
    ];
  },
};

export default nextConfig;
