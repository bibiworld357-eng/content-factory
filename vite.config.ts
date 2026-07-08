import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { spawnSync, spawn } from 'child_process'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const FFMPEG_TMP = join(tmpdir(), 'content-factory-ffmpeg')

function nativeFfmpegPlugin() {
  return {
    name: 'native-ffmpeg-api',
    configureServer(server: { middlewares: { use: Function } }) {
      fsp.mkdir(FFMPEG_TMP, { recursive: true }).catch(() => {})

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use((req: any, res: any, next: Function) => {
        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname
        if (!pathname.startsWith('/api/ffmpeg')) return next()

        const readBody = (cb: (buf: Buffer) => void) => {
          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', () => cb(Buffer.concat(chunks)))
        }

        const json = (data: unknown) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }

        const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64)
        const tmp = (n: string) => join(FFMPEG_TMP, safeName(n))

        // Check if ffmpeg is in PATH
        if (pathname === '/api/ffmpeg/check' && req.method === 'GET') {
          const r = spawnSync('ffmpeg', ['-version'], { timeout: 5000 })
          return json({ available: r.status === 0 })
        }

        // Write video file to temp dir
        if (pathname === '/api/ffmpeg/write' && req.method === 'POST') {
          const name = url.searchParams.get('name') || 'input.mp4'
          return readBody(async (buf) => {
            await fsp.writeFile(tmp(name), buf)
            res.end('ok')
          })
        }

        // Execute ffmpeg with given args (filenames resolved to temp dir)
        if (pathname === '/api/ffmpeg/exec' && req.method === 'POST') {
          return readBody((buf) => {
            const { args } = JSON.parse(buf.toString()) as { args: string[] }
            const resolved = args.map((a) =>
              /^[a-zA-Z0-9._-]+\.(mp4|txt|mkv|mov|webm)$/i.test(a) ? tmp(a) : a
            )
            const proc = spawn('ffmpeg', ['-y', ...resolved], { cwd: FFMPEG_TMP })
            const logs: string[] = []
            proc.stderr.on('data', (d: Buffer) => logs.push(d.toString()))
            proc.on('close', (code) => json({ exitCode: code, logs }))
            proc.on('error', (e: Error) => {
              res.statusCode = 500
              json({ error: e.message })
            })
          })
        }

        // Read result file
        if (pathname === '/api/ffmpeg/read' && req.method === 'GET') {
          const name = url.searchParams.get('name') || 'output.mp4'
          fsp.readFile(tmp(name))
            .then((data) => {
              res.setHeader('Content-Type', 'video/mp4')
              res.end(data)
            })
            .catch(() => { res.statusCode = 404; res.end('not found') })
          return
        }

        // Write text file (for concat list)
        if (pathname === '/api/ffmpeg/write-text' && req.method === 'POST') {
          const name = url.searchParams.get('name') || 'concat.txt'
          return readBody(async (buf) => {
            await fsp.writeFile(tmp(name), buf)
            res.end('ok')
          })
        }

        // Create concat.txt with absolute paths (forward slashes for FFmpeg on Windows)
        if (pathname === '/api/ffmpeg/make-concat' && req.method === 'POST') {
          return readBody(async (buf) => {
            const { files } = JSON.parse(buf.toString()) as { files: string[] }
            const content = files
              .map(f => `file '${tmp(f).replace(/\\/g, '/')}'`)
              .join('\n')
            await fsp.writeFile(tmp('concat.txt'), content)
            res.end('ok')
          })
        }

        // Cleanup temp files
        if (pathname === '/api/ffmpeg/cleanup' && req.method === 'POST') {
          return readBody(async (buf) => {
            const { files } = JSON.parse(buf.toString()) as { files: string[] }
            await Promise.all(files.map((f) => fsp.unlink(tmp(f)).catch(() => {})))
            res.end('ok')
          })
        }

        next()
      })
    },
  }
}

function captionsContentPlugin() {
  return {
    name: 'captions-content-proxy',
    configureServer(server: { middlewares: { use: Function } }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use(async (req: any, res: any, next: Function) => {
        const url: string = req.url || ''
        if (!url.startsWith('/api/captions/v1/videos/') || !url.endsWith('/content')) {
          return next()
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'x-api-key, content-type',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
          })
          res.end()
          return
        }
        const videoId = url.match(/\/v1\/videos\/([^/?]+)\/content/)?.[1]
        const apiKey = req.headers['x-api-key'] as string | undefined
        if (!videoId || !apiKey) return next()
        try {
          const apiRes = await fetch(
            `https://api.mirage.app/v1/videos/${videoId}/content`,
            { headers: { 'x-api-key': apiKey }, redirect: 'follow' }
          )
          const contentType = apiRes.headers.get('content-type') ?? 'video/mp4'
          res.writeHead(apiRes.ok ? 200 : apiRes.status, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
          })
          if (!apiRes.ok || !apiRes.body) { res.end(); return }
          const { Readable } = await import('stream')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Readable.fromWeb(apiRes.body as any).pipe(res)
        } catch (err) {
          console.error('[captions-content]', err)
          next(err)
        }
      })
    },
  }
}

function instagramProxyPlugin() {
  return {
    name: 'instagram-proxy',
    configureServer(server: { middlewares: { use: Function } }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use(async (req: any, res: any, next: Function) => {
        const url: string = req.url || ''
        if (!url.startsWith('/api/instagram')) return next()

        const parsed = new URL(req.url, 'http://localhost')
        const igUrl = parsed.searchParams.get('url')
        if (!igUrl) { res.writeHead(400); res.end(JSON.stringify({ error: 'missing url' })); return }

        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        try {
          // If it's already a direct image URL, use it
          let imgUrl: string | null = null
          if (igUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i) || igUrl.includes('cdninstagram.com')) {
            imgUrl = igUrl
          } else {
            // Try JSON API first (more reliable)
            try {
              const jsonUrl = igUrl.endsWith('/') ? `${igUrl}?__a=1&__d=dis` : `${igUrl}/?__a=1&__d=dis`
              const jsonRes = await fetch(jsonUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  'Accept': 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                },
              })
              if (jsonRes.ok) {
                const json = await jsonRes.json() as any
                const media = json?.items?.[0] ?? json?.graphql?.shortcode_media ?? json?.data?.shortcode_media
                imgUrl = media?.display_url ?? media?.image_versions2?.candidates?.[0]?.url
              }
            } catch {}

            // Fallback to HTML parsing
            if (!imgUrl) {
              const pageRes = await fetch(igUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                },
              })
              const html = await pageRes.text()
              
              // Try multiple patterns
              const patterns = [
                /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/,
                /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/,
                /"display_url":"([^"]+)"/,
                /"thumbnail_src":"([^"]+)"/,
              ]
              
              for (const pattern of patterns) {
                const match = html.match(pattern)
                if (match) {
                  imgUrl = match[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\/g, '')
                  break
                }
              }
            }
          }

          if (!imgUrl) { 
            res.writeHead(422)
            res.end(JSON.stringify({ error: 'Could not extract image from Instagram post. Try:\n1. Right-click on the image → Copy Image Address\n2. Paste that direct URL instead' }))
            return
          }
          const imgRes = await fetch(imgUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Referer': 'https://www.instagram.com/',
            },
          })
          if (!imgRes.ok) { res.writeHead(502); res.end(JSON.stringify({ error: `image fetch failed: ${imgRes.status}` })); return }

          const { Buffer } = await import('buffer')
          const buf = Buffer.from(await imgRes.arrayBuffer())
          const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
          const dataUrl = `data:${contentType};base64,${buf.toString('base64')}`
          res.writeHead(200)
          res.end(JSON.stringify({ dataUrl, sourceUrl: imgUrl }))
        } catch (err) {
          console.error('[instagram-proxy]', err)
          res.writeHead(500)
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), nativeFfmpegPlugin(), captionsContentPlugin(), instagramProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/api/wavespeed': {
        target: 'https://api.wavespeed.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/wavespeed/, '/api'),
        secure: false,
      },
      '/api/minimax': {
        target: 'https://api.minimax.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/minimax/, '/v1'),
        secure: false,
      },
      '/api/captions': {
        target: 'https://api.mirage.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/captions/, ''),
        secure: false,
      },
    },
  },
})
