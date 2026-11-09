import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
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
