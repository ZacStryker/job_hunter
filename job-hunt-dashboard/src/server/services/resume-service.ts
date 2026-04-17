import { db } from '../../db/client'
import { profile } from '../../db/schema'
import { generatePdf } from './generate-pdf'
import { loadEffectivePrompt } from './prompt-defaults'
import type { Job } from '../../shared/schemas'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume - [full_name]</title>
    <style>
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            color: #1a1a1a;
            line-height: 1.5;
            font-size: 10.5pt;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.5in 0.6in;
            background: #fff;
        }

        a {
            color: #1a1a1a;
            text-decoration: none;
        }

        .header {
            text-align: center;
            margin-bottom: 18pt;
            padding-bottom: 10pt;
            border-bottom: 1.5pt solid #1a1a1a;
        }

        .header h1 {
            font-size: 22pt;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 2pt;
        }

        .header .title {
            font-size: 11pt;
            font-weight: 500;
            color: #444;
            margin-bottom: 6pt;
        }

        .contact {
            display: flex;
            justify-content: center;
            gap: 8pt;
            flex-wrap: wrap;
            font-size: 9.5pt;
            color: #444;
        }

        .contact span:not(:last-child)::after {
            content: "·";
            margin-left: 8pt;
            color: #999;
        }

        .section {
            margin-bottom: 14pt;
        }

        .section h2 {
            font-size: 11pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            border-bottom: 0.75pt solid #ccc;
            padding-bottom: 3pt;
            margin-bottom: 8pt;
            color: #1a1a1a;
        }

        .entry {
            margin-bottom: 10pt;
        }

        .entry:last-child {
            margin-bottom: 0;
        }

        .entry-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }

        .entry-header .role {
            font-weight: 700;
            font-size: 10.5pt;
        }

        .entry-header .dates {
            font-size: 9.5pt;
            color: #555;
            white-space: nowrap;
            flex-shrink: 0;
            margin-left: 12pt;
        }

        .entry .company {
            font-weight: 500;
            font-size: 10pt;
            color: #444;
            margin-bottom: 3pt;
        }

        .entry ul {
            list-style: none;
            padding: 0;
        }

        .entry ul li {
            position: relative;
            padding-left: 12pt;
            margin-bottom: 1.5pt;
            font-size: 10pt;
            color: #333;
        }

        .entry ul li::before {
            content: "▸";
            position: absolute;
            left: 0;
            color: #888;
            font-size: 8pt;
            top: 1pt;
        }

        .skills-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8pt 20pt;
        }

        .skill-group h3 {
            font-size: 9.5pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 2pt;
            color: #1a1a1a;
        }

        .skill-group p {
            font-size: 9.5pt;
            color: #333;
            line-height: 1.45;
        }

        .edu-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
        }

        .edu-header .school {
            font-weight: 700;
            font-size: 10.5pt;
        }

        .edu-header .year {
            font-size: 9.5pt;
            color: #555;
        }

        .edu-degree {
            font-size: 10pt;
            color: #444;
        }

        @media print {
            body {
                padding: 0;
                font-size: 10pt;
            }

            .header {
                margin-bottom: 14pt;
            }

            .entry {
                break-inside: avoid;
            }

            a {
                color: #1a1a1a !important;
            }

            @page {
                margin: 0.5in 0.6in;
                size: letter;
            }
        }
    </style>
</head>
<body>

    <div class="header">
        <h1>[full_name]</h1>
        <div class="title">[title_01] · [title_02]</div>
        <div class="contact">
            <span>[email]</span>
            <span>[linkedin_url]</span>
            <span>[location]</span>
        </div>
    </div>

    <div>
        <p>[summary]</p>
        <br>
    </div>

    <div class="section">
        <h2>Skills</h2>
        <div class="skills-grid">
            <div class="skill-group">
                <h3>[skill_group_01_title]</h3>
                <p>[skill_group_01_skills]</p>
            </div>
            <div class="skill-group">
                <h3>[skill_group_02_title]</h3>
                <p>[skill_group_02_skills]</p>
            </div>
            <div class="skill-group">
                <h3>[skill_group_03_title]</h3>
                <p>[skill_group_03_skills]</p>
            </div>
            <div class="skill-group">
                <h3>[skill_group_04_title]</h3>
                <p>[skill_group_04_skills]</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Experience</h2>
        <div class="entry">
            <div class="entry-header">
                <span class="role">[experience_01_role]</span>
                <span class="dates">[experience_01_dates]</span>
            </div>
            <div class="company">[experience_01_company]</div>
            <ul>
                <li>[experience_01_bullet_01]</li>
                <li>[experience_01_bullet_02]</li>
                <li>[experience_01_bullet_03]</li>
                <li>[experience_01_bullet_04]</li>
                <li>[experience_01_bullet_05]</li>
            </ul>
        </div>
        <div class="entry">
            <div class="entry-header">
                <span class="role">[experience_02_role]</span>
                <span class="dates">[experience_02_dates]</span>
            </div>
            <div class="company">[experience_02_company]</div>
            <ul>
                <li>[experience_02_bullet_01]</li>
                <li>[experience_02_bullet_02]</li>
                <li>[experience_02_bullet_03]</li>
                <li>[experience_02_bullet_04]</li>
                <li>[experience_02_bullet_05]</li>
            </ul>
        </div>
        <div class="entry">
            <div class="entry-header">
                <span class="role">[experience_03_role]</span>
                <span class="dates">[experience_03_dates]</span>
            </div>
            <div class="company">[experience_03_company]</div>
            <ul>
                <li>[experience_03_bullet_01]</li>
                <li>[experience_03_bullet_02]</li>
                <li>[experience_03_bullet_03]</li>
                <li>[experience_03_bullet_04]</li>
                <li>[experience_03_bullet_05]</li>
            </ul>
        </div>
    </div>

    <div class="section">
        <h2>Education</h2>
        <div class="entry">
            <div class="edu-header">
                <span class="school">[education_01_school]</span>
                <span class="year">[education_01_year]</span>
            </div>
            <div class="edu-degree">[education_01_degree]</div>
        </div>
    </div>

</body>
</html>`

function stripCodeFences(text: string): string {
  let html = text.trim()
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '')
  }
  return html.trim()
}

export async function generateResume(job: Job): Promise<Buffer> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const profileRow = db.select().from(profile).limit(1).get() ?? null
  const promptConfig = loadEffectivePrompt('resume')

  const profileText =
    'Name: ' + (profileRow?.name ?? '') + '\n' +
    'Email: ' + (profileRow?.email ?? '') + '\n' +
    'Phone: ' + (profileRow?.phone ?? '') + '\n' +
    'Location: ' + (profileRow?.location ?? '') + '\n' +
    'LinkedIn: ' + (profileRow?.linkedinUrl ?? '') + '\n' +
    'Website: ' + (profileRow?.githubUrl ?? '') + '\n' +
    'Summary: ' + (profileRow?.summary ?? '') + '\n' +
    'Experience: ' + (profileRow?.experience ?? '') + '\n' +
    'Skills: ' + (profileRow?.skills ?? '') + '\n' +
    'Education: ' + (profileRow?.education ?? '')

  const systemPrompt = ((promptConfig.systemPrompt ?? '') + '\n\nHTML TEMPLATE (use this structure):\n' + htmlTemplate)
    .replaceAll('{{CANDIDATE_PROFILE}}', profileText)

  const jobDetails =
    'Target Role: ' + job.company + ' \u2014 ' + job.jobTitle + '\n' +
    'Location: ' + (job.location ?? '') + '\n' +
    'Description: ' + (job.jobDescription ?? '')

  const userMessage = promptConfig.userMessage
    .replaceAll('{{JOB_DETAILS}}', jobDetails)

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!anthropicRes.ok) throw new Error(`Anthropic error ${anthropicRes.status}`)

  const data = await anthropicRes.json() as AnthropicResponse
  const rawText = data.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
  if (!rawText) throw new Error('Anthropic returned empty resume')

  const html = stripCodeFences(rawText)
  if (!html) throw new Error('Anthropic returned empty resume')
  return generatePdf(html)
}
