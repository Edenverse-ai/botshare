/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force the Prisma query engine binaries into the Next.js standalone trace so
  // @netlify/plugin-nextjs bundles them into the serverless function. Without
  // this the rhel engine is missing at runtime and every DB query throws
  // "Query engine library for current platform could not be found".
  experimental: {
    outputFileTracingExcludes: {
      "/**/*": [
        "./node_modules/@img/sharp-darwin-*/**/*",
        "./node_modules/@img/sharp-libvips-darwin-*/**/*",
        "./node_modules/@img/sharp-wasm32/**/*",
        "./node_modules/.prisma/client/*darwin*",
      ],
    },
    outputFileTracingIncludes: {
      "/**/*": [
        "./node_modules/.prisma/client/**/*",
        "./node_modules/@img/sharp-linux-x64/**/*",
        "./node_modules/@img/sharp-libvips-linux-x64/**/*",
      ],
    },
  },
  webpack: (config) => {
    config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Service-scenario photography served from the public asset repo.
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/a607a/botshare-deploy/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = nextConfig;
