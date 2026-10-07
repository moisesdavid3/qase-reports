import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error plain JS module shared with the Cloudflare Pages Function
import { handleJiraIssues } from './functions/_lib/jira.js'

// Dev-only counterpart of functions/api/jira/issues.js (Cloudflare Functions do not run under `vite`).
function jiraDevApi(env: Record<string, string>): Plugin {
  return {
    name: 'jira-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/jira/issues', async (req, res) => {
        const request = new Request(`http://localhost${req.originalUrl ?? req.url}`)
        const response: Response = await handleJiraIssues(request, env)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), jiraDevApi(env)],
    server: {
      proxy: {
        '/api/qase': {
          target: 'https://api.qase.io/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/qase/, ''),
        },
      },
    },
  }
})
