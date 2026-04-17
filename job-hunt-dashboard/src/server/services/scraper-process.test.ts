import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

// --- Mock node:child_process before importing the module under test ---
let mockKill: ReturnType<typeof mock>
let mockChildOn: ReturnType<typeof mock>
let mockSpawn: ReturnType<typeof mock>

// Capture registered event handlers so tests can fire them manually
const registeredHandlers: Record<string, (...args: unknown[]) => void> = {}

mockKill = mock(() => {})
mockChildOn = mock(function (this: unknown, event: string, cb: unknown) {
  registeredHandlers[event] = cb as (...args: unknown[]) => void
  return this
})
mockSpawn = mock(() => ({
  pid: 12345,
  kill: mockKill,
  on: mockChildOn,
  stdout: null,
  stderr: null,
}))

mock.module('node:child_process', () => ({ spawn: mockSpawn }))

const { startScraperProcess, stopScraperProcess } = await import('./scraper-process')

let savedScraperUrl: string | undefined
let savedScraperToken: string | undefined
let savedAuthDir: string | undefined

beforeEach(() => {
  savedScraperUrl = process.env.SCRAPER_URL
  savedScraperToken = process.env.SCRAPER_TOKEN
  savedAuthDir = process.env.AUTH_DIR
  mockSpawn.mockClear()
  mockKill.mockClear()
  mockChildOn.mockClear()
  Object.keys(registeredHandlers).forEach((k) => delete registeredHandlers[k])
})

afterEach(() => {
  stopScraperProcess()
  if (savedScraperUrl !== undefined) process.env.SCRAPER_URL = savedScraperUrl
  else delete process.env.SCRAPER_URL
  if (savedScraperToken !== undefined) process.env.SCRAPER_TOKEN = savedScraperToken
  else delete process.env.SCRAPER_TOKEN
  if (savedAuthDir !== undefined) process.env.AUTH_DIR = savedAuthDir
  else delete process.env.AUTH_DIR
})

describe('findFreePort (via startScraperProcess side-effect)', () => {
  test('sets SCRAPER_URL to a valid http://127.0.0.1:<port> address', async () => {
    await startScraperProcess()
    expect(process.env.SCRAPER_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const port = parseInt(process.env.SCRAPER_URL!.split(':')[2])
    expect(port).toBeGreaterThanOrEqual(1024)
    expect(port).toBeLessThanOrEqual(65535)
  })
})

describe('startScraperProcess', () => {
  test('clears SCRAPER_TOKEN', async () => {
    process.env.SCRAPER_TOKEN = 'some-token'
    await startScraperProcess()
    expect(process.env.SCRAPER_TOKEN).toBeUndefined()
  })

  test('spawns node with the correct script path', async () => {
    await startScraperProcess()
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('node')
    expect(args[0]).toMatch(/scraper[/\\]src[/\\]server\.js$/)
  })

  test('passes PORT matching SCRAPER_URL port in child env', async () => {
    await startScraperProcess()
    const port = process.env.SCRAPER_URL!.split(':')[2]
    const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<string, string>
    expect(spawnEnv.PORT).toBe(port)
  })

  test('uses AUTH_DIR env var when set', async () => {
    process.env.AUTH_DIR = '/custom/auth'
    await startScraperProcess()
    const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<string, string>
    expect(spawnEnv.AUTH_DIR).toBe('/custom/auth')
  })

  test('defaults AUTH_DIR to <scraper_dir>/auth when not set', async () => {
    delete process.env.AUTH_DIR
    await startScraperProcess()
    const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<string, string>
    expect(spawnEnv.AUTH_DIR).toMatch(/scraper[/\\]auth$/)
  })

  test('stops existing child before starting a new one (idempotency)', async () => {
    await startScraperProcess()
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    await startScraperProcess()
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(mockKill).toHaveBeenCalledWith('SIGTERM')
  })
})

describe('exit handler', () => {
  test('does not restart when signal is SIGTERM', async () => {
    await startScraperProcess()
    registeredHandlers['exit']?.(null, 'SIGTERM')
    expect(mockSpawn).toHaveBeenCalledTimes(1) // no second spawn
  })

  test('does not restart when signal is SIGKILL', async () => {
    await startScraperProcess()
    registeredHandlers['exit']?.(null, 'SIGKILL')
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  test('does not restart when intentionalStop is set', async () => {
    await startScraperProcess()
    stopScraperProcess()
    registeredHandlers['exit']?.(1, null)
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})

describe('stopScraperProcess', () => {
  test('calls kill(SIGTERM) on the child', async () => {
    await startScraperProcess()
    stopScraperProcess()
    expect(mockKill).toHaveBeenCalledWith('SIGTERM')
  })

  test('sets child reference to null after stop', async () => {
    await startScraperProcess()
    stopScraperProcess()
    // second stop should not call kill again (child is null)
    mockKill.mockClear()
    stopScraperProcess()
    expect(mockKill).not.toHaveBeenCalled()
  })

  test('clears SCRAPER_URL on stop', async () => {
    await startScraperProcess()
    expect(process.env.SCRAPER_URL).toBeDefined()
    stopScraperProcess()
    expect(process.env.SCRAPER_URL).toBeUndefined()
  })

  test('does not throw when called before any child is started', () => {
    expect(() => stopScraperProcess()).not.toThrow()
  })
})
