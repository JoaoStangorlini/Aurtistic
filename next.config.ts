import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const EMBED_FRAME_ANCESTORS =
  "frame-ancestors 'self' http://localhost:3001 http://*.localhost:3001 http://127.0.0.1:3001 http://showdefisica.localhost:3001 http://labdiv.localhost:3001 http://profis.localhost:3001 http://hs.localhost:3001 https://hub-lab-div.vercel.app https://*.hublabdiv.com.br https://*.vercel.app http://localhost:3000 http://127.0.0.1:3000;";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'hub-lab-div.vercel.app',
        '*.hublabdiv.com.br',
        'aurtistic.vercel.app',
        'localhost:3000',
        'localhost:3001',
        '*.localhost:3001',
        'showdefisica.localhost:3001',
        'labdiv.localhost:3001',
        'profis.localhost:3001',
        'hs.localhost:3001',
        '127.0.0.1:3001',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: EMBED_FRAME_ANCESTORS,
          },
        ],
      },
      {
        source: '/servidor',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: EMBED_FRAME_ANCESTORS,
          },
        ],
      },
      {
        source: '/api/auth/hub-embed',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://hub-lab-div.vercel.app' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-supabase-auth-token' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/aurtistic/login',
        destination: '/login',
        permanent: true,
      },
      {
        source: '/aurtistic/privacy-policy',
        destination: '/privacy-policy',
        permanent: true,
      },
      {
        source: '/aurtistic/delete-account',
        destination: '/delete-account',
        permanent: true,
      },
    ];
  },
};

export default withSerwist(nextConfig);
