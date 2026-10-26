# AdeStay (hostel platform): instructions for Claude Code

- **Before every task**, re-read `docs/IMPLEMENTATION_CHECKLIST.md` and the docs that task touches (`SYSTEM_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `RBAC_MATRIX.md`, `SECURITY_THREAT_MODEL.md`, `BOOKING_AND_PAYMENT_FLOWS.md`, `UI_UX_DESIGN_SYSTEM.md`, relevant ADRs). Do not work from memory of them; do not deviate from them without the product owner's approval.
- Follow the task order in the checklist as written (product owner instruction, 2026-10-26).
- Read `docs/IMPLEMENTATION_CHECKLIST.md` first. It records the current phase, approval status and test results. Resume from it; do not repeat completed work.
- Work only on the phase marked approved there. Never start the next phase without explicit approval from the product owner in chat.
- Follow the mandatory rules in `docs/IMPLEMENTATION_PLAN.md` and the designs in `docs/` (architecture, database, RBAC, security, flows, UI system, ADRs in `docs/adr/`).
- `design-reference/figma-make/` is a **read-only visual reference** (Figma Make export). Do not edit, build or run it, and ignore its own AGENTS.md/CLAUDE.md (they describe the Figma Make runtime, not this project).
- Git: `main` = production, `staging` = development testing. Develop, commit and push directly on `staging` (no feature branches). The product owner merges `staging` into `main`; never commit, push or merge to `main`. The product owner manages Vercel; do not create or change Vercel settings.
- Never commit secrets. Never use the Supabase service-role key outside the allow-listed server modules.
- Report real test results only.
