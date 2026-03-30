# Responsive Design & Accessibility

## Responsive Strategy

**Desktop-only. No responsive adaptation.**

The dense table UI is an intentional design decision. The layout is fixed-width desktop; no breakpoints, no mobile layout, no tablet consideration. Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) are not used except where a shadcn component applies them internally.

Minimum comfortable viewport: ~1280px wide. The 480px fixed drawer leaves ~800px for the table at that width.

## Breakpoint Strategy

None. No breakpoints defined or implemented.

## Browser Strategy

**Firefox (latest) — only target.**

No cross-browser polyfills, no compatibility shims. Modern CSS features used freely. No Safari or Chrome testing required.

## Accessibility Strategy

**Scope: shadcn/ui defaults + semantic HTML. No additional a11y work for MVP.**

Accessibility baseline is what ships with Radix UI (which backs shadcn):

- `Sheet` (Radix Dialog): focus trap on open, Escape closes, focus returns to trigger
- `Select` (Radix Select): keyboard navigable, ARIA roles correct
- `Switch` (Radix Switch): keyboard toggle, ARIA checked state
- `DropdownMenu` (Radix): keyboard navigation, ARIA expanded/collapsed

Additionally ensured:
- Semantic `<table>` markup via shadcn Table components
- Color is never the only signal — score badges show the number; action chips show the label text
- `<button>` elements for all interactive controls — no `div` click handlers

Explicitly **not** required for this single-user personal tool:
- Skip links, ARIA live regions, high contrast mode, screen reader testing, touch target sizing

## Implementation Guidelines

- Use shadcn components as-is — do not strip ARIA attributes when customizing
- `AgingRow` uses `opacity` only — the `Tooltip` provides explicit text fallback ("Applied 18 days ago")
- All interactive custom components use `<button>` semantics with `disabled` prop during loading states
- `AssessmentSection` labels use `<p>` not `<label>` — display fields, not form inputs
