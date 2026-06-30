type StreamEvent = 'snapshot' | 'update' | 'setup-status'
type StreamHandler = (ev: MessageEvent) => void

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

const listeners = new Map<StreamEvent, Set<StreamHandler>>()
const dispatchers = new Map<StreamEvent, StreamHandler>()

let source: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let delay = RECONNECT_BASE_MS
let subscriberCount = 0

function getDispatcher(event: StreamEvent): StreamHandler {
  let dispatcher = dispatchers.get(event)
  if (!dispatcher) {
    dispatcher = (ev: MessageEvent) => {
      const set = listeners.get(event)
      if (set) for (const handler of set) handler(ev)
    }
    dispatchers.set(event, dispatcher)
  }
  return dispatcher
}

function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const es = new EventSource('/api/activity/stream')
  source = es
  for (const event of listeners.keys()) {
    es.addEventListener(event, getDispatcher(event))
  }
  es.onopen = () => {
    delay = RECONNECT_BASE_MS
  }
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED) return
    es.close()
    if (source === es) source = null
    reconnectTimer = setTimeout(connect, delay)
    delay = Math.min(delay * 2, RECONNECT_MAX_MS)
  }
}

function teardown() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  source?.close()
  source = null
  delay = RECONNECT_BASE_MS
}

export function subscribeActivityStream(event: StreamEvent, handler: StreamHandler): () => void {
  let set = listeners.get(event)
  if (!set) {
    set = new Set()
    listeners.set(event, set)
  }
  set.add(handler)
  subscriberCount++

  if (!source) {
    connect()
  } else if (set.size === 1) {
    source.addEventListener(event, getDispatcher(event))
  }

  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    set.delete(handler)
    subscriberCount--
    if (set.size === 0) {
      if (source) source.removeEventListener(event, getDispatcher(event))
      listeners.delete(event)
    }
    if (subscriberCount === 0) {
      teardown()
    }
  }
}
