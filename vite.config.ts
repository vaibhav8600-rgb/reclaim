import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Local routes → the same handlers Vercel runs: the module, how it builds its dependencies, and its request handler. */
const ROUTES = {
  '/api/ai': { module: '/server/ai/handler.ts', deps: 'depsFromEnv', handle: 'handleAi' },
  '/api/push': { module: '/server/push.ts', deps: 'pushFromEnv', handle: 'handlePush' },
} as const
type Handler = (req: Request, deps: unknown) => Promise<Response>

/**
 * Serves /api/ai and /api/push locally (dev and preview) with the same handlers Vercel runs in production.
 * Server-only secrets (GEMINI_API_KEY, AI_ALLOWED_EMAILS, VAPID_PRIVATE_KEY…) come from .env.local and never reach the
 * browser bundle.
 */
function localApi(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  let dev: ViteDevServer | undefined
  const built = new Map<string, { mod: unknown; deps: unknown }>()

  async function handle(route: (typeof ROUTES)[keyof typeof ROUTES], req: IncomingMessage, res: ServerResponse) {
    // Dev: Vite's module loader (hot reload). Preview: jiti runs the TypeScript directly.
    const mod = (dev ? await dev.ssrLoadModule(route.module) : await load(route.module)) as Record<string, unknown>
    // Rebuild dependencies when the module is reloaded (edits during dev), so they always match.
    if (built.get(route.module)?.mod !== mod) built.set(route.module, { mod, deps: (mod[route.deps] as (e: typeof env) => unknown)(env) })
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    })
    const response = await (mod[route.handle] as Handler)(request, built.get(route.module)!.deps)
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    if (!response.body) return void res.end()
    // Pass streamed answers through as they arrive (no buffering).
    res.flushHeaders()
    const reader = response.body.getReader()
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  }

  const load = async (module: string) => {
    const { createJiti } = await import('jiti')
    return createJiti(import.meta.url).import(new URL(`.${module}`, import.meta.url).href)
  }

  const mount = (server: { middlewares: { use(path: string, fn: (req: IncomingMessage, res: ServerResponse) => void): unknown } }) => {
    for (const [path, route] of Object.entries(ROUTES)) {
      server.middlewares.use(path, (req, res) => {
        handle(route, req, res).catch((e) => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        })
      })
    }
  }

  return {
    name: 'reclaim-local-api',
    configureServer(server) {
      dev = server
      mount(server)
    },
    // Must not return anything: Vite would treat a returned function as a post-middleware hook.
    configurePreviewServer(server) {
      mount(server)
    },
  }
}

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) },
  plugins: [
    react(),
    tailwindcss(),
    localApi(mode),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Reclaim',
        short_name: 'Reclaim',
        description: 'Get back to your life. A private recovery journal for injuries, symptoms and progress.',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // The API must always hit the network, never the offline app shell. push-sw.js: daily reminders (Web Push).
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//], importScripts: ['push-sw.js'] },
    }),
  ],
}))
