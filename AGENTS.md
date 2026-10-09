<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 2AM FC project rules

- Source of requirements: `docs/2AM_FC_APP_GUIDELINE.md` v1.1 (one admin, public dashboard, public rename, public receipt/RSVP forms). Do not add member accounts or invite flows.
- Public pages read only `pub_*` views via `publicDb()`; never query base tables or use the session client there.
- Public writes go only through the whitelisted RPCs in `supabase/migrations/*_public_commands.sql`. Admin RPCs must start with `require_admin()`.
- Money is whole VND (`numeric(14,0)`); never update/delete `fund_ledger` — corrections are reversal rows.
- Schema changes = new migration file + `npx supabase db reset` + `npm test` (integration tests need the local stack).
- Never put service-role/secret keys in the app or `NEXT_PUBLIC_*`.
