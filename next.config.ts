import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['192.168.240.190', '172.20.10.3', '10.0.0.183'],
}

export default nextConfig