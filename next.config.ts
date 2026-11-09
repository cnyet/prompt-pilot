import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 编译产物里不允许出现任何密钥；这条在 M7 会加成构建期扫描脚本
  poweredByHeader: false,
}

export default nextConfig
