import { describe, test, expect } from 'bun:test'
import { buildResumeHtml } from './resume-html'
import { resumeDataSchema } from './schemas'
import type { ResumeData } from './schemas'

const TEMPLATE = `<!DOCTYPE html>
<html><body>
<script id="resume-data" type="application/json">
{ "first_name": "" }
</script>
<div id="output"></div>
</body></html>`

const BASE: ResumeData = {
  first_name: 'Jane', last_name: 'Doe',
  title_01: 'Software Engineer', title_02: 'Platform Specialist',
  email: 'jane@example.com', website: '', linkedin: '', location: 'Amsterdam',
  summary: 'Experienced engineer.',
  skill_groups: [], education: [], projects: [],
  experience: [{
    company: 'Acme Corp', location: 'Amsterdam', dates: '2021-2024', role: 'Senior Engineer',
    bullets: ['Built an event pipeline.'],
  }],
}

// Pulls the JSON back out of the injected <script> tag the way the template's own inline script does
// (`JSON.parse(document.getElementById('resume-data').textContent)`).
function extractInjectedJson(html: string): ResumeData {
  const match = html.match(/<script id="resume-data" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('no injected script tag found')
  return JSON.parse(match[1]) as ResumeData
}

describe('buildResumeHtml — injection', () => {
  test('injects the data into the template script tag', () => {
    const html = buildResumeHtml(BASE, TEMPLATE)
    expect(extractInjectedJson(html).first_name).toBe('Jane')
  })

  test('throws rather than silently rendering an un-injected template', () => {
    expect(() => buildResumeHtml(BASE, '<html><body>no injection point</body></html>')).toThrow('template injection point not found')
  })
})

// JSON.stringify does NOT escape '<'. Before users could type into resume fields the only writer was
// the LLM, so nobody noticed — but the instant a `summary` can contain '</script><script>…', that
// string closes the data tag and opens a LIVE one, inside the Playwright render context that
// produces the PDF, where there is no sandbox at all.
describe('buildResumeHtml — script-breakout escaping', () => {
  const PAYLOAD = '</script><script>alert(1)</script>'

  test('a </script> payload does not break out of the data tag', () => {
    const html = buildResumeHtml({ ...BASE, summary: PAYLOAD }, TEMPLATE)

    // The raw closing tag must not appear anywhere — that is what a breakout looks like.
    expect(html).not.toContain('</script><script>alert(1)')
    // The document still has exactly the ONE </script> the template started with. A breakout would
    // add more: the payload's own closing tag, plus the one opening its injected <script>.
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html.match(/<script/g)).toHaveLength(1)
    // And it is present in its escaped form instead.
    expect(html).toContain('\\u003c/script\\u003e')
  })

  test('the payload survives as LITERAL text — byte-identical after JSON.parse', () => {
    const html = buildResumeHtml({ ...BASE, summary: PAYLOAD }, TEMPLATE)
    expect(extractInjectedJson(html).summary).toBe(PAYLOAD)
  })

  test('escapes <, > and & wherever they appear, including nested inside arrays', () => {
    const data: ResumeData = {
      ...BASE,
      first_name: '<b>',
      experience: [{ ...BASE.experience[0], bullets: ['Cut cost & latency <20ms', PAYLOAD] }],
    }
    const html = buildResumeHtml(data, TEMPLATE)

    expect(html).not.toContain('<b>')
    expect(html).toContain('\\u003cb\\u003e')
    expect(html).toContain('\\u0026')

    const round = extractInjectedJson(html)
    expect(round.first_name).toBe('<b>')
    expect(round.experience[0].bullets[0]).toBe('Cut cost & latency <20ms')
    expect(round.experience[0].bullets[1]).toBe(PAYLOAD)
  })

  // The escaped output is still valid ResumeData: the escaping is a transport concern, not a
  // content one, so a round-tripped payload must still satisfy the schema the server validates on.
  test('the round-tripped JSON still parses as ResumeData', () => {
    const html = buildResumeHtml({ ...BASE, summary: PAYLOAD }, TEMPLATE)
    expect(resumeDataSchema.safeParse(extractInjectedJson(html)).success).toBe(true)
  })
})

// replace(regex, string) expands $$, $&, $` and $' in the REPLACEMENT — so a resume containing them
// would corrupt its own JSON. The builder uses the function form to avoid it.
describe('buildResumeHtml — $ substitution patterns', () => {
  test('a summary containing $& and $` is inserted literally', () => {
    const summary = "Cut spend by $5k. Patterns: $$ $& $` $' end."
    const html = buildResumeHtml({ ...BASE, summary }, TEMPLATE)
    expect(extractInjectedJson(html).summary).toBe(summary)
  })
})
