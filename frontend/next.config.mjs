/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // enables Docker-friendly minimal bundle
  // typescript.ignoreBuildErrors removed — TS regressions must block the
  // Docker build. Re-enable only as a temporary escape hatch with a TODO.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
