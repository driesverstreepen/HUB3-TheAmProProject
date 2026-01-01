/** @type {import('next').NextConfig} */
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const nextConfig = {
  // Force port 3001 for development
  devIndicators: {
    buildActivity: true,
    buildActivityPosition: 'bottom-right',
  },
  // Allow additional origins (hostnames or IPs) during development
  ...(allowedDevOrigins.length ? { allowedDevOrigins } : {}),

  // Fix Turbopack picking the wrong workspace root when multiple lockfiles exist.
  // Ensures env files are loaded from THIS repo.
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
