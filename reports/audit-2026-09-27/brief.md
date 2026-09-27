# Red-team brief (shared by every surface run)

You are red-teaming **Nhịp**, a multi-tenant web app, at commit `7baa32d` on `main`. Read-only: do not modify files, do not run migrations, do not start servers, do not call external services. You may read any file (including `node_modules` sources of Better Auth, Prisma, oRPC, Next.js) and run read-only commands (`grep`, `rg`, `sed -n`, `git log/show`).

## What the product is

Speed-to-lead inbox for high-end apartment agencies in Vietnam. Guests write on WhatsApp/Zalo; agents answer in one queue; a human approves every reply (never auto-send). Read `PRODUCT.md`, `CONTEXT.md` (glossary), `ARCHITECTURE.md`, and the ADRs in `docs/adr/` (0001–0013) as the rules the code must keep.

## Trust boundaries

- **Office = tenant** (ADR 0008/0010): the kit organization. An operator belongs to exactly one office, resolved from the membership table on every request — never from the session's active organization. Threads, pipes and Answers are office-scoped.
- **Roles**: agent/manager (operators, members of one office), platform admin (`user.role` contains `admin`, manages offices in the kit's admin area). Public sign-up is closed; accounts come from invitations (ADR 0010). An operator whose membership ends loses the account (ADR 0013).
- **Untrusted input**: everything a guest sends (webhook bodies, names, message text), everything a signed-in user sends to `/api/*`, `/api/auth/*`, oRPC, and admin procedures.
- **Sends**: one Answer per guest message; nothing is ever sent twice for one guest message (ADR 0011). `SEND_MODE=live` talks to vendors; anything else is mock.

## Known and accepted — do not report these again unless you find a NEW angle

- Pipe credentials are process-wide for the pilot; a thread on another office's number is refused with 409 `pipe_not_configured` (ADR 0010). Per-connection credentials are known open work (earlier audit finding 3).
- The draft post-check does not verify factual claims against office evidence (earlier audit finding 8, open).
- Background work (translations, drafts) may be cut off on serverless; the deployment is a long-lived process for now.
- Production has no `prisma migrate` baseline yet (dev uses `db push`).
- The CRM adapter (ADR 0003) is NOT on `main`; ignore it.
- Earlier audit: `reports/2026-09-20-gpt6-astra-architecture-audit.md`. Findings 1, 2, 4–7 were fixed since; verify the fixes hold rather than re-reporting the originals.

## How to report

- Only real, reachable problems. For each: the concrete attack or repro steps, the exact `file:line`, why it works (quote the code), impact, and the smallest fix.
- `confidence`: `confirmed` = you traced the full path in code (and library source where it matters); `likely` = one link unverified (say which); `speculative` = plausible, not traced. Prefer fewer confirmed findings over many speculative ones.
- `severity`: critical = cross-tenant data access/modification, account takeover, sending as another office, or double-send; high = privilege escalation inside an office, auth bypass of a single guard, persistent injection; medium = DoS/abuse, info leak without tenant crossing; low = hardening.
- List what you checked that holds in `checked_ok` (one line each) so the next pass does not repeat it.
- Output must match the JSON schema you were given.
