## 2026-10-06 (E2E helpers query through one process per worker)

### Changed

- **E2E helpers that set up or read the database run in one long-lived process per Playwright worker, not a `pnpm exec tsx` spawn per call** (#203, follows #186). `pipes.ts`, `alerts.ts`, `crm.ts`, `deletion.ts` and `joinOffice`'s accounts send each call to the worker's state process (`apps/saas/tests/support/state-client.ts`, `state-process.ts`), which boots tsx, Prisma and the test-only Better Auth once. Each spawn cost about 2 s on CI. The helpers are now async. Every read the specs observe (`alertState`, `mockCrmLeads`, `guestDeletionRecords`) is still a fresh query, with no caching. A process that dies, never starts or doesn't answer fails the waiting test with its reason within 10–20 s, below the test's timeout, and the next call starts a new process. No spec checks anything different.
