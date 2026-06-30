# Review Role 1 — Blind Hunter (diff-only)

Run this in a fresh session (ideally a different LLM). Invoke the `bmad-review-adversarial-general` skill.

**Rules for this reviewer:** You get ONLY the diff below. No spec, no other files, no project access. Find correctness bugs, broken logic, and risky changes by reading the diff alone. Report findings with severity.

## Diff under review

```diff
diff --git a/src/client/components/detail/JobDrawer.tsx b/src/client/components/detail/JobDrawer.tsx
@@ imports
+import { useSessionQuery } from '../../hooks/useSessionQuery'
+import { cn } from '../../lib/utils'
@@ inside JobDrawer()
   const removeFromBlacklist = useRemoveFromBlacklist()
+  const { data: session } = useSessionQuery()
+  const isImpersonating = !!session?.impersonating
+  const panelOffset = isImpersonating ? 'top-24 h-[calc(100vh-96px)]' : 'top-14 h-[calc(100vh-56px)]'
+  const overlayOffset = isImpersonating ? 'top-24' : 'top-14'
@@ return
-    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
+    <Sheet open={open} modal={false} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
       <SheetContent
         side="right"
-        className="w-[720px] max-w-none flex flex-col p-0 bg-zinc-900 border-zinc-800"
+        overlayClassName={overlayOffset}
+        className={cn('w-[720px] max-w-none flex flex-col p-0 bg-zinc-900 border-zinc-800', panelOffset)}
       >

diff --git a/src/client/components/shared/Layout.tsx b/src/client/components/shared/Layout.tsx
-      <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">
+      <header className="relative z-[60] h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-4">

diff --git a/src/client/components/ui/sheet.tsx b/src/client/components/ui/sheet.tsx
 interface SheetContentProps
   extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
-    VariantProps<typeof sheetVariants> {}
+    VariantProps<typeof sheetVariants> {
+  overlayClassName?: string
+}
->(({ side = "right", className, children, ...props }, ref) => (
+>(({ side = "right", className, overlayClassName, children, ...props }, ref) => (
   <SheetPortal>
-    <SheetOverlay />
+    <SheetOverlay className={overlayClassName} />
```

Report: findings list with severity (critical / major / minor / nit) and one-line rationale each. If clean, say so.
