Read `reports/audit-2026-09-27/brief.md` first and follow it. Surface: **tenancy and authentication**. Use id prefix `T`.

Files to start from: `packages/auth/auth.ts`, `packages/auth/lib/offboarding.ts`, `packages/auth/lib/organization.ts`, `packages/auth/plugins/invitation-only/index.ts`, `packages/auth/config.ts`, `apps/saas/modules/inbox/lib/office.ts`, `apps/saas/modules/inbox/lib/require-session.ts`, `apps/saas/modules/home/lib/funnel.ts`, `packages/api/orpc/**` (procedures, handler, permix), `packages/api/modules/admin/**`, `packages/api/modules/organizations/**`, every `apps/saas/app/api/**/route.ts`, the `(authenticated)` layouts under `apps/saas/app/[locale]/`, and Better Auth's organization, admin and invitation plugin sources in `node_modules`.

Attack ideas (go beyond them):

1. Reach another office's threads, Answers, Home numbers, members or invitations: IDOR on every id-taking route and oRPC procedure; the active-organization field; organization slug routes.
2. Get a second office membership, or keep access after removal: invitation accept/reject flows, `acceptInvitation` while a member, re-using an old invitation, magic link / passkey / two-factor paths, `/organization/leave`, `/organization/remove-member`, `/delete-user`, admin `removeUser`, impersonation.
3. Escalate: an agent reaching admin procedures or the admin area; a member acting as owner (`organization.update`, delete, invite); setting `role` via update-user or sign-up.
4. Sign-up is supposed to be closed: find any path that creates an account without an invitation (email/password, OAuth account linking with `trustedProviders`, magic link).
5. ADR 0013: can an attacker get someone else's account deleted, or dodge deletion? Can the platform admin be deleted by these hooks?
6. Session and cookie handling, `trustedOrigins`, CSRF on state-changing routes, open redirects in auth callbacks.
