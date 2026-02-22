import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure App Router is correctly handled on Vercel
  async rewrites() {
    return [
      {
        source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
        destination: '/',
      },
    ];
  },
};

export default nextConfig;
