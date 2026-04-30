/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // enables Docker-friendly minimal bundle
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
