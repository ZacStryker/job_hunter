import type { ResumeData } from './schemas'

// Lives in shared/ because BOTH sides render it: the server pipes the result through Playwright to
// make the PDF, and the editor's preview pane drops it straight into an <iframe srcdoc>. One copy,
// so the preview cannot drift from the artifact it claims to preview.
//
// The template is a PARAMETER, not a read: this must stay pure (no node imports — it is bundled into
// the browser), and it keeps the file on disk as the single source of truth. The server reads it from
// disk; the client fetches those same bytes from GET /api/resume-template.

const INJECTION_POINT = /<script id="resume-data" type="application\/json">[\s\S]*?<\/script>/

export function buildResumeHtml(data: ResumeData, templateHtml: string): string {
  // Replace <, >, & with their JSON unicode escapes: backslash-u-0-0-3-c, -3-e, -0-2-6.
  // Still valid JSON, byte-identical after JSON.parse, and inert inside a <script> tag.
  //
  // JSON.stringify does NOT escape '<'. Before users could type into these fields the only writer was
  // Claude, so nobody noticed — but the instant a `summary` can contain '</script><script>…', that
  // string closes the data tag and opens a LIVE one. In the Playwright render context that produces
  // the PDF there is no sandbox at all, so this escaping — not the preview's sandbox attribute — is
  // the only real control on that path.
  const json = JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')

  const injected = templateHtml.replace(
    INJECTION_POINT,
    // Function form: the string form of .replace expands $$, $&, $` and $' in the REPLACEMENT, so a
    // resume containing "$&" would corrupt its own JSON rather than be inserted literally.
    () => `<script id="resume-data" type="application/json">\n${json}\n</script>`
  )
  if (injected === templateHtml) {
    throw new Error('Resume render failed: template injection point not found — template may be corrupted')
  }
  return injected
}
