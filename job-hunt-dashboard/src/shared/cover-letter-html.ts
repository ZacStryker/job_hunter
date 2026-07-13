import type { ProfileData } from './schemas'

// Lives in shared/ because BOTH sides render it: the server pipes it through Playwright to make the
// PDF, and the editor's preview pane drops it straight into an <iframe srcdoc>. One copy, so the
// preview cannot drift from the artifact it claims to preview. Keep it pure — no node imports, this
// is bundled into the browser.

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildCoverLetterHtml(content: string, personal: ProfileData['personal'] | null): string {
  const name = personal?.fullName ?? ''
  const contacts = [personal?.email, personal?.phone, personal?.location].filter(Boolean).join(' · ')
  // Stamped at RENDER time, not draft time: the letter is dated the day you send it. A restored v1
  // therefore carries today's date — its prose is verbatim, its date line is not. Deliberate.
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 48px 56px; line-height: 1.6; max-width: 760px; }
  .name { font-size: 15pt; font-weight: 700; letter-spacing: 0.3px; }
  .contact { font-size: 9.5pt; color: #555; margin-top: 3px; }
  hr { border: none; border-top: 1.5px solid #1a1a1a; margin: 14px 0 20px; }
  .date { font-size: 10pt; color: #444; margin-bottom: 24px; }
  .body { font-size: 11pt; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="name">${escHtml(name)}</div>
  <div class="contact">${escHtml(contacts)}</div>
  <hr />
  <div class="date">${date}</div>
  <div class="body">${escHtml(content)}</div>
<script>window.__paginationComplete = true;</script>
</body>
</html>`
}
