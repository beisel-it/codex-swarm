import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000'
  const host = env.CODEX_SWARM_TAILNET_DNS ?? env.VITE_ALLOWED_HOST ?? env.CODEX_SWARM_HOST
  const allowedHosts = host ? [host] : []

  return {
    plugins: [react()],
    server: {
      allowedHosts,
      proxy: {
        '/api': proxyTarget,
        '/health': proxyTarget,
      },
    },
    preview: {
      allowedHosts,
    },
  }
})
