---
title: 'Fix blurry LinkedIn connect modal (render frames at native resolution)'
type: 'bugfix'
created: '2026-06-15'
status: 'done'
baseline_commit: 'ccb85081b8e78b95ead868e2528ad3ac965f56a1'
context: ['_bmad-output/project-context.md']
---

## Intent

**Problem:** The "Connect to LinkedIn" modal renders the embedded LinkedIn page blurry and too small to read. The server streams full 1280×800 PNG screenshots, but the client draws every frame into a 480×300 canvas backing store (`LinkedInBrowserModal.tsx`), a 2.7× downscale; the browser then upscales that small bitmap again on HiDPI displays, compounding the blur.

**Approach:** Client-only fix. Size the canvas backing store to the native source resolution (1280×800) so frames are drawn at full fidelity, and display the canvas responsively at the modal's width with a locked 16:10 aspect ratio so the page is legible and clicks stay accurately mapped. Widen the dialog so the larger page fits. No server or bandwidth change — the high-res frames already arrive.

## Boundaries & Constraints

**Always:**
- Canvas backing store must equal the server viewport/screenshot resolution: 1280×800 (matches `linkedin-browser-service.ts` context viewport and the `*1280`/`*800` click mapping).
- Displayed canvas must preserve the 1280:800 (16:10) aspect ratio so the existing `offsetX/clientWidth*1280`, `offsetY/clientHeight*800` click mapping stays correct at any rendered size.
- Use `cn`/tailwind-merge to override the dialog's default `max-w-lg` (confirmed: `lib/utils.ts` uses `twMerge`).

**Ask First:**
- Raising server render density (Playwright `deviceScaleFactor`) — explicitly out of scope for this fix per user decision.

**Never:**
- No server-side changes (`linkedin-browser-service.ts` untouched); no change to the 200ms screenshot cadence, PNG format, or websocket protocol.
- Do not change the click/keyboard coordinate math or the `1280`/`800` constants.
- Do not touch the Indeed/other browser-session code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| High-res frame draw | 1280×800 PNG frame arrives | `drawImage` fills the 1280×800 backing store; page renders crisp (no 480-px downscale) | existing `.catch(() => {})` on decode |
| Click mapping | user clicks at display offset on a canvas rendered at width W (height W/1.6) | maps to correct page coords via `offsetX/clientWidth*1280`, `offsetY/clientHeight*800` — unchanged because aspect ratio is preserved | guarded by existing `if (!clientWidth || !clientHeight) return` |
| Narrow window | viewport narrower than the dialog max-width | dialog shrinks to fit; canvas scales down with it, aspect ratio held, clicks still accurate | N/A |

## Code Map

- `src/client/components/linkedin/LinkedInBrowserModal.tsx` -- the only file to change. Canvas backing store is hardcoded `width={480} height={300}` (line ~86) and displayed at a fixed 480×300 (line ~89); `DialogContent` is capped at `max-w-[500px]` (line ~72). `drawImage` already targets `canvas.width/height`, so enlarging the backing store needs no draw-logic change.
- `src/client/components/ui/dialog.tsx` -- generated shadcn component; `DialogContent` base class includes `w-full max-w-lg`. Do NOT edit (generated); override via the `className` prop.
- `src/server/services/linkedin-browser-service.ts` -- reference only: context `viewport: { width: 1280, height: 800 }` and 200ms PNG screenshots confirm the source resolution. Unchanged.
- `src/client/routes/config/job-sources-auth-setup.tsx` -- sole consumer of the modal; no prop changes needed.

## Tasks & Acceptance

**Execution:**
- [x] `src/client/components/linkedin/LinkedInBrowserModal.tsx` -- set the active `<canvas>` backing store to `width={1280} height={800}`; change its inline style to fill the modal width with a locked ratio (`width: '100%'`, `aspectRatio: '1280 / 800'`, `display: 'block'`); widen `DialogContent` from `max-w-[500px]` to `max-w-[1000px]` (keep `p-0 overflow-hidden`). Leave `drawImage`, the click/key handlers, and the `1280`/`800` constants unchanged.

**Acceptance Criteria:**
- Given an active LinkedIn session, when frames stream in, then the embedded LinkedIn page renders sharply and is large enough to read the sign-in form labels (no visible pixelation/blur from downscaling).
- Given the larger canvas, when the user clicks a control (e.g., the email field or "Sign in" button), then the click lands on the same control on the server-side page — coordinate mapping is unchanged.
- Given a browser window narrower than the dialog's max width, when the modal opens, then it scales to fit without horizontal overflow and the canvas keeps its 16:10 aspect ratio.

## Verification

**Commands:**
- `bunx tsc --noEmit` -- expected: no NEW type errors beyond the project's pre-existing baseline.
- `bun run build` -- expected: production build succeeds.

**Manual checks:**
- `bun run dev`, open Config → Job Sources → Auth Setup → "Connect LinkedIn"; confirm the LinkedIn page is crisp and legible, then click the email field and the "Sign in" button to confirm the cursor/focus lands correctly on the server page.

## Spec Change Log

- **Review patch (no loopback): short-viewport overflow.** Edge-case + blind reviewers found that enlarging the canvas (~1000×625) could push the dialog taller than a short viewport; with the centered, `overflow-hidden`, no-max-height `DialogContent`, the canvas top and close button became clipped/unreachable. Fixed in-diff by sizing the canvas to its intrinsic 1280×800 with `maxWidth:100%` + `maxHeight:80vh` (instead of `width:100%` + `aspectRatio`), which caps height to the viewport while preserving the 16:10 ratio — keeping click mapping accurate. KEEP: backing store stays 1280×800; click math and `1280`/`800` constants untouched; no server change.

## Suggested Review Order

- Entry point — backing store now matches the server's native 1280×800 frame (was 480×300); `drawImage` already targets `canvas.width/height`, so frames fill it 1:1.
  [`LinkedInBrowserModal.tsx:86`](../../job-hunt-dashboard/src/client/components/linkedin/LinkedInBrowserModal.tsx#L86)

- Responsive display — intrinsic-size canvas capped by `maxWidth:100%` + `maxHeight:80vh`; preserves 16:10 (clicks stay accurate) and fits short viewports.
  [`LinkedInBrowserModal.tsx:89`](../../job-hunt-dashboard/src/client/components/linkedin/LinkedInBrowserModal.tsx#L89)

- Modal width widened 500→1000px so the larger page is legible; tailwind-merge overrides the dialog's default `max-w-lg`.
  [`LinkedInBrowserModal.tsx:72`](../../job-hunt-dashboard/src/client/components/linkedin/LinkedInBrowserModal.tsx#L72)
