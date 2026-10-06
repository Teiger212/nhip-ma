## 2026-10-05 (E2E operators join without the sign-up page)

### Changed

- **E2E specs set up their offices' agents and managers without a browser sign-up** (#186). `joinOffice` (`apps/saas/tests/support/operators.ts`) still invites, and accepts the invitation, through the kit's API, so the membership, its role and the session's office stay the server's. The account the invitation sign-up page would make (Better Auth's `createUser` and credential account, password `NEW_PASSWORD`) and its session come from a test-only Better Auth instance, one tsx process per Playwright worker (`accounts.ts`). Every spec but the Auth specs and Team moves to it; those keep the browser sign-up, which is what they prove. CI's E2E time did not measurably change: at 2 workers the UI joins were not its bottleneck.
