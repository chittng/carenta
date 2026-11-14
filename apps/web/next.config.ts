import type { NextConfig } from 'next';

import { apiOrigin } from './src/config/api-origin';

const nextConfig: NextConfig = {
  // Keep `next dev` from writing an AGENTS.md into the app.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // The browser calls the API through this site: auth cookies are SameSite=Lax and httpOnly,
  // so they must be first-party even when web and API are deployed on different domains.
  rewrites() {
    return Promise.resolve([
      { source: '/api/v1/:path*', destination: `${apiOrigin()}/api/v1/:path*` },
    ]);
  },
};

export default nextConfig;
