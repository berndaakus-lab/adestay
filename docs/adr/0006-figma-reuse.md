# ADR-0006: Reuse the Figma Make export as a visual reference, not as application code

- Status: Proposed (Phase 0). Revisit after the Figma file link is reviewed.
- Date: 2026-10-11

## Context
`design-reference/figma-make/` (copied from `Downloads\HMS - Berndaakus`) is a Figma Make prototype:
- Vite + React 19 + Tailwind v4.
- One 496-line `App.tsx` with state-based page switching.
- Hard-coded US demo data and hot-linked Unsplash images.
- About 430 lines of BEM-style CSS.
- No backend or auth.

The target is Next.js App Router with server components, routing, shadcn/ui and real data.

## Options
1. Run the Vite app as the frontend and add an API.
2. Copy `App.tsx` components into Next.js largely as-is.
3. **Re-implement cleanly in Next.js using the export as the visual spec**, porting tokens, layout CSS and copy deliberately.

## Decision
Option 3.

## Rationale
- There is no routing, SSR/ISR, data layer, form library or validation to keep, so the code would be rewritten anyway.
- The design value is the **tokens, typography, spacing, layout patterns, the 14 icons and the copy**. All of these port directly: tokens into Tailwind `@theme`, icons into the Lucide equivalents already in shadcn's ecosystem.
- Accessibility issues (non-input search fields, button-as-link navigation, partial focus styles, contrast of olive/muted/brass) are cheaper to fix during re-implementation.
- Figma Make–specific Vite plugins and scripts are irrelevant to production.

## Consequences
- The export stays in the repo, read-only, for side-by-side visual comparison. It is excluded from the Next.js build and lint.
- UI work in Phases 1–4 references specific export screens in each task.
- Missing screens (UI_UX_DESIGN_SYSTEM §1) need designs, from the Figma file or designed during implementation following the system, before their phase starts.
