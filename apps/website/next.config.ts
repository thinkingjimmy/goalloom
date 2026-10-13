/**
 * [INPUT]: Uses the NextConfig type from Next.js
 * [OUTPUT]: Exports the website build configuration
 * [POS]: Build entry; every localized route is pre-rendered into a static export that Vercel serves as files
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  // Directory-style URLs work on any static host and keep canonical URLs stable.
  trailingSlash: true,
}

export default nextConfig
