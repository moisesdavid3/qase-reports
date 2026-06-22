import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/qase': {
        target: 'https://api.qase.io/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/qase/, ''),
      },
    },
  },
})
