import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'

const SCRAPER_DIR = join(import.meta.dir, '..', '..', '..', 'scraper')

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('unexpected server address'))
        return
      }
      server.close(() => resolve(addr.port))
    })
    server.on('error', reject)
  })
}

let child: ChildProcess | null = null
let intentionalStop = false
let restartDelay = 1_000
let restartTimer: ReturnType<typeof setTimeout> | null = null
const MAX_RESTART_DELAY = 30_000

function startChild(port: number): void {
  intentionalStop = false

  child = spawn('node', [join(SCRAPER_DIR, 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.pipe(process.stdout)
  child.stderr?.pipe(process.stderr)

  child.on('error', (err) => {
    console.error('[scraper] failed to spawn child process:', err.message)
  })

  child.on('exit', (code, signal) => {
    if (intentionalStop) return
    if (signal === 'SIGTERM' || signal === 'SIGKILL') return
    console.error(`[scraper] process exited (code=${code}, signal=${signal}), restarting in ${restartDelay}ms`)
    const delay = restartDelay
    restartDelay = Math.min(restartDelay * 2, MAX_RESTART_DELAY)
    restartTimer = setTimeout(() => startChild(port), delay)
  })

  restartDelay = 1_000
  console.log(`[scraper] child process started (pid=${child.pid}) on port ${port}`)
}

export async function startScraperProcess(): Promise<void> {
  if (child !== null) {
    stopScraperProcess()
  }
  const port = await findFreePort()
  process.env.SCRAPER_URL = `http://127.0.0.1:${port}`
  delete process.env.SCRAPER_TOKEN
  startChild(port)
}

export function stopScraperProcess(): void {
  intentionalStop = true
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (child) {
    try { child.kill('SIGTERM') } catch {}
    child = null
  }
  delete process.env.SCRAPER_URL
}
