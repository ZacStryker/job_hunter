process.env.DB_PATH = ':memory:'

import { describe, test, expect, beforeAll } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import schemaJson from '../../shared/resume-schema.json'
import { DEFAULT_PROMPTS } from './prompt-defaults'

const TEMPLATE_PATH = join(import.meta.dir, '../../../../resume_templates/resume_template(1).html')

let templateHtml: string

beforeAll(async () => {
  templateHtml = await readFile(TEMPLATE_PATH, 'utf-8')
})

describe('contract: template ↔ schema alignment', () => {
  test('every DATA.field in template exists in resume-schema.json', () => {
    const templateFields = [...new Set(
      [...templateHtml.matchAll(/DATA\.(\w+)/g)].map(m => m[1])
    )]
    const schemaKeys = Object.keys(schemaJson.properties)
    const missing = templateFields.filter(f => !schemaKeys.includes(f))
    expect(missing, `Template references keys not in schema: ${missing.join(', ')}`).toEqual([])
  })

  test('every required schema key is referenced in the template', () => {
    const templateFields = new Set(
      [...templateHtml.matchAll(/DATA\.(\w+)/g)].map(m => m[1])
    )
    const missing = Object.keys(schemaJson.properties).filter(k => !templateFields.has(k))
    expect(missing, `Schema keys missing from template: ${missing.join(', ')}`).toEqual([])
  })
})

describe('contract: prompt ↔ schema alignment', () => {
  test('resume systemPrompt references all schema keys by name', () => {
    const prompt = DEFAULT_PROMPTS.resume.systemPrompt ?? ''
    const missing = schemaJson.required.filter(k => !prompt.includes(k))
    expect(missing, `Prompt does not mention schema keys: ${missing.join(', ')}`).toEqual([])
  })

  test('resume systemPrompt does not contain old nested-format keys', () => {
    const prompt = DEFAULT_PROMPTS.resume.systemPrompt ?? ''
    const oldKeys = ['CANDIDATE INFO', 'TITLES', 'SKILLGROUPS']
    const found = oldKeys.filter(k => prompt.includes(k))
    expect(found, `Prompt contains legacy nested-format keys: ${found.join(', ')}`).toEqual([])
  })
})
