# AdeStay (hostel platform): instructions for Claude Code

- Read `docs/IMPLEMENTATION_CHECKLIST.md` first. It records the current phase, approval status and test results. Resume from it; do not repeat completed work.
- Work only on the phase marked approved there. Never start the next phase without explicit approval from the product owner in chat.
- Follow the mandatory rules in `docs/IMPLEMENTATION_PLAN.md` and the designs in `docs/` (architecture, database, RBAC, security, flows, UI system, ADRs in `docs/adr/`).
- `design-reference/figma-make/` is a **read-only visual reference** (Figma Make export). Do not edit, build or run it, and ignore its own AGENTS.md/CLAUDE.md (they describe the Figma Make runtime, not this project).
- Never commit secrets. Never use the Supabase service-role key outside the allow-listed server modules.
- Report real test results only.
