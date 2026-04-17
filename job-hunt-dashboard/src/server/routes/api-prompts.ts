import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { prompts } from '../../db/schema'
import { PROMPT_FLOWS, DEFAULT_PROMPTS } from '../services/prompt-defaults'
import { promptInputSchema } from '../../shared/schemas'

const app = new Hono()

app.get('/', (c) => {
  const rows = db.select().from(prompts).all()
  const rowMap = Object.fromEntries(rows.map((r) => [r.flow, r]))

  const result = PROMPT_FLOWS.map((flow) => {
    const row = rowMap[flow]
    if (row) {
      return {
        flow,
        systemPrompt: row.systemPrompt,
        userMessage: row.userMessage,
        updatedAt: row.updatedAt,
        isCustom: true,
      }
    }
    const defaults = DEFAULT_PROMPTS[flow]
    return {
      flow,
      systemPrompt: defaults.systemPrompt,
      userMessage: defaults.userMessage,
      updatedAt: null,
      isCustom: false,
    }
  })

  return c.json(result)
})

app.put('/:flow', async (c) => {
  const flow = c.req.param('flow')
  if (!(PROMPT_FLOWS as readonly string[]).includes(flow)) {
    return c.json({ error: 'Unknown flow' }, 404)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = promptInputSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, 400)
  }

  const input = parsed.data
  const updatedAt = new Date().toISOString()

  db.insert(prompts)
    .values({ flow, systemPrompt: input.systemPrompt, userMessage: input.userMessage, updatedAt })
    .onConflictDoUpdate({
      target: prompts.flow,
      set: { systemPrompt: input.systemPrompt, userMessage: input.userMessage, updatedAt },
    })
    .run()

  return c.json({ flow, systemPrompt: input.systemPrompt, userMessage: input.userMessage, updatedAt, isCustom: true })
})

app.delete('/:flow', (c) => {
  const flow = c.req.param('flow')
  if (!(PROMPT_FLOWS as readonly string[]).includes(flow)) {
    return c.json({ error: 'Unknown flow' }, 404)
  }

  db.delete(prompts).where(eq(prompts.flow, flow)).run()

  const defaults = DEFAULT_PROMPTS[flow as keyof typeof DEFAULT_PROMPTS]
  return c.json({
    flow,
    systemPrompt: defaults.systemPrompt,
    userMessage: defaults.userMessage,
    updatedAt: null,
    isCustom: false,
  })
})

export default app
