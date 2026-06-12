export type LocationType = 'On-site' | 'Hybrid' | 'Remote'

export function parseLocation(raw: string | null | undefined): { place: string | null; type: LocationType | null } {
  if (!raw) return { place: null, type: null }

  let type: LocationType | null = null
  if (/\bremote\b/i.test(raw)) type = 'Remote'
  else if (/\bhybrid\b/i.test(raw)) type = 'Hybrid'
  else if (/\b(on-?site|onsite)\b/i.test(raw)) type = 'On-site'

  const place = raw
    .replace(/\b(remote|hybrid|on-?site|onsite)\b/gi, '')
    .replace(/[\s,\-–—()/]+$/g, '')
    .replace(/^[\s,\-–—()/]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null

  return { place, type }
}
