# CRM Adapter Seam (ADR 0003, PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect an office to a CRM through one adapter seam, with a working mock adapter. Link threads to CRM leads, automatically by phone or by the agent's hand. Show Closings and Lost on Home from those links, and take won or lost threads out of the queue.

**Architecture:** The pipe adapters are the model: `apps/saas/modules/inbox/lib/crm/` holds the `CrmAdapter` interface, E.164 normalisation, the mock adapter, and one sync function (`refreshCrm`).

- **Tables.** Three new `inbox_*` tables hold the office's CRM connection, the per-thread CRM link (which caches the lead's outcome), and the mock CRM's leads. The store stays their only writer.
- **Fetch on view.** The conversation list and Home call `refreshCrm`, which only asks the CRM about links older than 10 minutes.
- **Connecting an office.** The platform admin sets the office's CRM in the kit's admin area.

**Tech Stack:** Next.js 16 app router, Prisma 7 on Postgres (`db push`, no migrations yet), oRPC admin procedures, TanStack Query, next-intl, vitest against `supastarter_test`.

**Spec:** `docs/adr/0003-crm-adapter.md`, CONTEXT.md (Integrations, Queue → Resolved, Funnel → Closing/Lost), and the decisions below.

## Decisions (Eyal, 2026-09-27)

- **Scope.** PR 1 is the seam, the mock adapter, links, Home, and the queue. **Attio is PR 2**, built from Attio's docs with recorded fixtures, because there is no workspace to test against.
- **Freshness.** Fetch on view, with a 10-minute cache on the link (`CRM_TTL_MS`). No scheduler.
- **Connecting.** The platform admin sets the office's CRM kind in the admin area. Any API keys stay in env for the pilot, like the pipes (ADR 0010). PR 1 has no secrets: the mock needs none.
- **Assumption, flagged for review.** A resolved thread (won or lost) leaves the queue. If the guest writes again after the outcome, the thread comes back to Your turn. A lost lead who writes again is exactly who the agent must see.
- **Assumption, flagged for review.** Closings and Lost count **distinct CRM leads** in the cohort, not threads. The same guest on WhatsApp and Zalo is two threads (ADR 0010), but one deal.

## Global Constraints

- The product never names a vendor outside its adapter: `lib/crm/index.ts` maps a kind to an adapter, and nothing else switches on the kind (ADR 0003).
- **No name matching, ever.** Automatic linking is by E.164 phone only. A person picking a lead from a search is the manual path, not name matching (ADR 0003).
- Zalo guests are never linked automatically: a Zalo id is not a phone (ADR 0003, ADR 0010).
- Closings and Lost come only from the CRM, never inferred from chat (CONTEXT, "Deliberately not").
- With no CRM connected, Home keeps "Connect your CRM". It never shows a zero that looks like a fact (ADR 0002).
- The store (`createInboxStore(db)`) is the only writer of `inbox_*` tables. Routes and scripts call its methods (ARCHITECTURE).
- Every store read and write is office-scoped. A link or lead from another office is a 404, never a leak (ADR 0008).
- Schema changes go through `prisma db push`. A plain push is enough here, because only new tables and nullable columns are added.
- Gates before every commit: `pnpm lint`, `pnpm format:check`, `pnpm type-check`, `pnpm test`. Use conventional commits, with no attribution lines.
- CRM errors never break the inbox. The list still loads, and cached outcomes stay.

## Review Focus

1. **WhatsApp ids in local or odd formats.** A `wa_id` is digits with a country code and no `+`. Mock or CRM phones may be stored as `0901 234 567` or `+84 90-123-4567`. All of them must meet at `+84901234567`. Test in Task 2.
2. **A Zalo guest, or a WhatsApp guest with no match, polled every 10 s.** Neither may cause a CRM call on every poll. A miss is recorded with `checkedAt` and retried only after the TTL. Test in Task 3.
3. **The CRM throws or times out mid-poll.** The list still returns, the links keep their cached outcomes, and Home says the numbers may be stale instead of erroring. Tests in Tasks 3 and 7.
4. **One guest's lead linked to two threads.** Closings counts the deal once. Test in Task 7.
5. **Linking a thread or lead of another office.** The link route answers 404 for another office's thread, and 404 `lead_not_found` for a lead the office's CRM does not return. Tests in Tasks 5 and 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/database/prisma/schema.prisma` | New models `CrmConnection`, `CrmLink`, `MockCrmLead`; enums `CrmKind`, `CrmOutcomeStatus`, `CrmLinkMethod` |
| `packages/database/inbox/schema.ts` | zod `CrmKind`, `CrmOutcomeStatus`, `CrmLinkMethod`; `Funnel.crm` |
| `packages/database/inbox/types.ts` | `ConversationCrm`, `Conversation.crm`, `CrmWorkItem`, new `InboxStore` methods |
| `packages/database/inbox/store.ts` | Store methods for connection, links, outcomes, and mock leads; the funnel's CRM counts |
| `apps/saas/modules/inbox/lib/crm/types.ts` | `CrmLead`, `CrmOutcome`, `CrmAdapter` |
| `apps/saas/modules/inbox/lib/crm/phone.ts` | `toE164(raw)`, `guestPhone(conversation)` |
| `apps/saas/modules/inbox/lib/crm/mock.ts` | `mockCrmAdapter(store, officeId)` |
| `apps/saas/modules/inbox/lib/crm/index.ts` | `crmAdapterFor(connection, store)`, re-exports |
| `apps/saas/modules/inbox/lib/crm/sync.ts` | `refreshCrm(runtime, officeId, now)`, `CRM_TTL_MS` |
| `apps/saas/modules/inbox/lib/runtime.ts` | Optional `crm` factory on `Runtime`, for tests |
| `apps/saas/modules/inbox/lib/queue.ts` | `isResolved`, `inQueue`; views and counts use them |
| `apps/saas/app/api/crm/leads/route.ts` | GET: search the office CRM for the manual picker |
| `apps/saas/app/api/conversations/[id]/crm-link/route.ts` | POST link, DELETE unlink |
| `apps/saas/app/api/conversations/route.ts` | Schedules `refreshCrm` in the background |
| `apps/saas/modules/inbox/lib/inbox-queries.ts` | `useCrmLeadSearch`, `useLinkCrmLead`, `useUnlinkCrmLead` |
| `apps/saas/modules/inbox/components/CrmLink.tsx` | Thread header: CRM chip, link popover, unlink |
| `apps/saas/modules/inbox/components/ThreadDetail.tsx` | Renders `CrmLink` |
| `apps/saas/modules/home/lib/funnel.ts` | Awaits `refreshCrm` (with a timeout), passes `crmStale` |
| `apps/saas/modules/home/components/Home.tsx` | Closings and Lost from `funnel.crm` |
| `packages/api/modules/admin/procedures/organization-crm.ts` | `admin.organizations.crm.get` and `.set` |
| `packages/api/modules/admin/router.ts` | Wires them |
| `apps/saas/modules/admin/component/organizations/CrmConnectionCard.tsx` | Admin select: None / Mock CRM |
| `apps/saas/modules/admin/component/organizations/OrganizationForm.tsx` | Renders the card |
| `apps/saas/modules/inbox/lib/seed.ts`, `scripts/seed.ts` | The walk office gets the mock CRM, four leads, and two links |
| `packages/i18n/translations/*/saas.json` | New `inbox.crm.*` (all 5 locales), `home.*` (en, vi), `admin.organizations.crm.*` (all 5) |
| `docs/adr/0003-crm-adapter.md`, `CONTEXT.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CHANGELOG.md` | Docs |

Tests live next to the code, as today: `apps/saas/modules/inbox/lib/crm/*.test.ts`, `apps/saas/modules/inbox/lib/crm-store.test.ts`, `queue.test.ts`, `funnel.test.ts`, and `apps/saas/modules/inbox/lib/crm-routes.test.ts`.

---

### Task 1: Tables and store methods

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (Organization, Conversation, and three new models at the end of the inbox block)
- Modify: `packages/database/inbox/schema.ts`, `packages/database/inbox/types.ts`, `packages/database/inbox/store.ts`
- Modify: `packages/database/inbox/testing.ts` (the truncate list)
- Test: `apps/saas/modules/inbox/lib/crm-store.test.ts`

**Interfaces:**
- Produces (types, `packages/database/inbox/types.ts`):
  ```ts
  export type CrmKind = "mock";                       // "attio" joins in PR 2
  export type CrmOutcomeStatus = "open" | "won" | "lost";
  export type CrmLinkMethod = "phone" | "manual";
  export type ConversationCrm = {
  	kind: CrmKind;
  	/** null: looked and found nothing (phone), or unlinked by an agent (manual). */
  	leadId: string | null;
  	leadName: string | null;
  	method: CrmLinkMethod | null;
  	outcome: CrmOutcomeStatus | null;
  	outcomeAt: string | null;
  	outcomeReason: string | null;
  	checkedAt: string;
  };
  // Conversation gains:  crm: ConversationCrm | null;
  export type CrmWorkItem = {
  	conversationId: string;
  	pipe: Pipe;
  	guestId: string;
  	crm: ConversationCrm | null;
  };
  export type MockCrmLeadRecord = {
  	id: string; officeId: string; name: string; phone: string | null;
  	outcome: CrmOutcomeStatus; outcomeAt: string | null; outcomeReason: string | null;
  };
  ```
- Produces (`InboxStore` methods):
  ```ts
  getCrmConnection(officeId: string): Promise<{ kind: CrmKind } | null>;
  setCrmConnection(officeId: string, kind: CrmKind | null): Promise<void>;
  /** Threads whose link is missing or checked before `staleBefore`, office-scoped. */
  crmWork(officeId: string, staleBefore: Date): Promise<CrmWorkItem[]>;
  saveCrmLink(conversationId: string, link: {
  	kind: CrmKind; leadId: string | null; leadName: string | null;
  	method: CrmLinkMethod; checkedAt: Date;
  }): Promise<void>;
  saveCrmOutcomes(updates: Array<{
  	conversationId: string; outcome: CrmOutcomeStatus | null;
  	outcomeAt: Date | null; outcomeReason: string | null;
  }>, checkedAt: Date): Promise<void>;
  upsertMockCrmLead(lead: MockCrmLeadRecord): Promise<void>;
  findMockCrmLeads(officeId: string, where: { phone?: string; query?: string; ids?: string[] }): Promise<MockCrmLeadRecord[]>;
  ```

- [ ] **Step 1: Write the failing store tests**

`apps/saas/modules/inbox/lib/crm-store.test.ts`:
```ts
import { conversationId } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { testInboxStore } from "./test-store";

const OFFICE = "office-a";
const OTHER_OFFICE = "office-b";
const inbound = (guestId: string, pipe: "whatsapp" | "zalo" = "whatsapp") => ({
	pipe,
	source: "guest" as const,
	guestId,
	guestName: null,
	text: "Xin chào",
	vendorMessageId: null,
});

test("an office has at most one CRM connection, and clearing it removes it", async () => {
	const store = await testInboxStore();
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	await store.setCrmConnection(OFFICE, "mock");
	expect(await store.getCrmConnection(OFFICE)).toEqual({ kind: "mock" });
	await store.setCrmConnection(OFFICE, null);
	expect(await store.getCrmConnection(OFFICE)).toBeNull();
	await store.close();
});

test("a link and its outcome ride on the conversation", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	const checkedAt = new Date("2026-09-27T10:00:00Z");
	await store.saveCrmLink(id, { kind: "mock", leadId: "lead-1", leadName: "Minji Park", method: "phone", checkedAt });
	await store.saveCrmOutcomes(
		[{ conversationId: id, outcome: "won", outcomeAt: new Date("2026-09-26T09:00:00Z"), outcomeReason: null }],
		checkedAt,
	);
	const conv = await store.getConversation(id);
	expect(conv?.crm).toEqual({
		kind: "mock", leadId: "lead-1", leadName: "Minji Park", method: "phone",
		outcome: "won", outcomeAt: "2026-09-26T09:00:00.000Z", outcomeReason: null,
		checkedAt: "2026-09-27T10:00:00.000Z",
	});
	await store.close();
});

test("relinking to another lead clears the old outcome", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("g1"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "g1");
	const at = new Date();
	await store.saveCrmLink(id, { kind: "mock", leadId: "a", leadName: "A", method: "manual", checkedAt: at });
	await store.saveCrmOutcomes([{ conversationId: id, outcome: "lost", outcomeAt: at, outcomeReason: "price" }], at);
	await store.saveCrmLink(id, { kind: "mock", leadId: "b", leadName: "B", method: "manual", checkedAt: at });
	expect((await store.getConversation(id))?.crm).toMatchObject({ leadId: "b", outcome: null, outcomeReason: null });
	await store.close();
});

test("crm work lists unlinked and stale threads of the office only", async () => {
	const store = await testInboxStore();
	await store.upsertInbound(inbound("fresh"), OFFICE);
	await store.upsertInbound(inbound("stale"), OFFICE);
	await store.upsertInbound(inbound("never"), OFFICE);
	await store.upsertInbound(inbound("elsewhere"), OTHER_OFFICE);
	const now = new Date("2026-09-27T10:00:00Z");
	const old = new Date("2026-09-27T09:00:00Z");
	await store.saveCrmLink(conversationId(OFFICE, "whatsapp", "fresh"), { kind: "mock", leadId: "f", leadName: "F", method: "phone", checkedAt: now });
	await store.saveCrmLink(conversationId(OFFICE, "whatsapp", "stale"), { kind: "mock", leadId: "s", leadName: "S", method: "phone", checkedAt: old });
	const work = await store.crmWork(OFFICE, new Date("2026-09-27T09:50:00Z"));
	expect(work.map((item) => item.guestId).sort()).toEqual(["never", "stale"]);
	await store.close();
});

test("mock leads are found by phone, by query, and by id, inside the office", async () => {
	const store = await testInboxStore();
	await store.upsertMockCrmLead({ id: "m1", officeId: OFFICE, name: "Minji Park", phone: "+84901234567", outcome: "open", outcomeAt: null, outcomeReason: null });
	await store.upsertMockCrmLead({ id: "m2", officeId: OTHER_OFFICE, name: "Minji Other", phone: "+84901234567", outcome: "open", outcomeAt: null, outcomeReason: null });
	expect((await store.findMockCrmLeads(OFFICE, { phone: "+84901234567" })).map((l) => l.id)).toEqual(["m1"]);
	expect((await store.findMockCrmLeads(OFFICE, { query: "minji" })).map((l) => l.id)).toEqual(["m1"]);
	expect((await store.findMockCrmLeads(OFFICE, { ids: ["m1", "m2"] })).map((l) => l.id)).toEqual(["m1"]);
	await store.close();
});

test("deleting an office deletes its CRM connection, links and mock leads", async () => {
	const store = await testInboxStore();
	await store.setCrmConnection(OTHER_OFFICE, "mock");
	await store.upsertMockCrmLead({ id: "gone", officeId: OTHER_OFFICE, name: "G", phone: null, outcome: "open", outcomeAt: null, outcomeReason: null });
	const { testDb } = await import("./test-store");
	await testDb.organization.delete({ where: { id: OTHER_OFFICE } });
	expect(await store.getCrmConnection(OTHER_OFFICE)).toBeNull();
	expect(await testDb.mockCrmLead.count({ where: { officeId: OTHER_OFFICE } })).toBe(0);
	await store.close();
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm-store.test.ts`
Expected: FAIL. TypeScript/runtime errors that `getCrmConnection` and the other methods are not functions.

- [ ] **Step 3: Add the schema**

In `schema.prisma`, add these to `model Organization`:
```prisma
  crmConnection      CrmConnection?
  mockCrmLeads       MockCrmLead[]
```
Add this to `model Conversation`:
```prisma
  crmLink         CrmLink?
```
Append after `model PipeConnection`:
```prisma
enum CrmKind {
  mock
}

enum CrmOutcomeStatus {
  open
  won
  lost
}

enum CrmLinkMethod {
  phone
  manual
}

/// The office's CRM (ADR 0003). One per office; set by the platform admin. Secrets stay in
/// env for the pilot; this row only names the kind.
model CrmConnection {
  officeId  String       @id
  office    Organization @relation(fields: [officeId], references: [id], onDelete: Cascade)
  kind      CrmKind
  updatedAt DateTime     @updatedAt

  @@map("inbox_crm_connection")
}

/// A thread's link to a CRM lead, with the lead's outcome cached as of `checkedAt`.
/// `leadId` null: a phone lookup found nothing, or an agent unlinked it (method manual,
/// which automatic matching never overrides).
model CrmLink {
  conversationId String            @id
  conversation   Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  officeId       String
  kind           CrmKind
  leadId         String?
  leadName       String?
  method         CrmLinkMethod
  outcome        CrmOutcomeStatus?
  outcomeAt      DateTime?
  outcomeReason  String?
  checkedAt      DateTime

  @@index([officeId, checkedAt])
  @@map("inbox_crm_link")
}

/// The mock CRM's leads (ADR 0003): development, tests and the demo. Phones are E.164.
model MockCrmLead {
  id            String           @id
  officeId      String
  office        Organization     @relation(fields: [officeId], references: [id], onDelete: Cascade)
  name          String
  phone         String?
  outcome       CrmOutcomeStatus @default(open)
  outcomeAt     DateTime?
  outcomeReason String?

  @@index([officeId, phone])
  @@map("inbox_mock_crm_lead")
}
```

Run: `pnpm --filter @repo/database generate`. The dev database gets `pnpm --filter @repo/database push` (plain; additive only).

- [ ] **Step 4: Add the zod enums and domain types**

In `packages/database/inbox/schema.ts`, next to the other enums:
```ts
export const CrmKind = z.enum(["mock"]);
export const CrmOutcomeStatus = z.enum(["open", "won", "lost"]);
export const CrmLinkMethod = z.enum(["phone", "manual"]);
```
In `types.ts`, add the types listed under **Interfaces**: `CrmKind = z.infer<typeof CrmKind>`, and the same for the other two. Add `crm: ConversationCrm | null;` to `Conversation`, after `lastAnswer`, with this doc comment:
```ts
	/** The thread's CRM lead and its cached outcome (ADR 0003); null until the office has a CRM and the thread was looked up. */
```
Add the new method signatures to `InboxStore`, each with a one-line doc comment.

- [ ] **Step 5: Implement the store methods**

In `store.ts`:
- Add `crmLink: true` to `CONVERSATION_INCLUDE`.
- In `mapConversation`, add `crm: record.crmLink ? mapCrmLink(record.crmLink) : null`. `mapCrmLink` turns Dates into ISO strings with `iso`/`isoOrNull`.
- Add the methods inside the returned object:
```ts
		async getCrmConnection(officeId) {
			const row = await db.crmConnection.findUnique({ where: { officeId }, select: { kind: true } });
			return row ? { kind: row.kind } : null;
		},

		async setCrmConnection(officeId, kind) {
			if (kind === null) {
				await db.crmConnection.deleteMany({ where: { officeId } });
				return;
			}
			await db.crmConnection.upsert({ where: { officeId }, create: { officeId, kind }, update: { kind } });
		},

		async crmWork(officeId, staleBefore) {
			const rows = await db.conversation.findMany({
				where: {
					officeId,
					OR: [{ crmLink: { is: null } }, { crmLink: { checkedAt: { lt: staleBefore } } }],
				},
				select: { id: true, pipe: true, guestId: true, crmLink: true },
			});
			return rows.map((row) => ({
				conversationId: row.id,
				pipe: row.pipe,
				guestId: row.guestId,
				crm: row.crmLink ? mapCrmLink(row.crmLink) : null,
			}));
		},

		async saveCrmLink(conversationId, link) {
			const conversation = await db.conversation.findUniqueOrThrow({
				where: { id: conversationId },
				select: { officeId: true, crmLink: { select: { leadId: true } } },
			});
			const sameLead = conversation.crmLink?.leadId === link.leadId;
			const data = {
				officeId: conversation.officeId,
				kind: link.kind,
				leadId: link.leadId,
				leadName: link.leadName,
				method: link.method,
				checkedAt: link.checkedAt,
				// Another lead's outcome is not this lead's.
				...(sameLead ? {} : { outcome: null, outcomeAt: null, outcomeReason: null }),
			};
			await db.crmLink.upsert({ where: { conversationId }, create: { conversationId, ...data }, update: data });
		},

		async saveCrmOutcomes(updates, checkedAt) {
			await db.$transaction(
				updates.map((update) =>
					db.crmLink.update({
						where: { conversationId: update.conversationId },
						data: {
							outcome: update.outcome,
							outcomeAt: update.outcomeAt,
							outcomeReason: update.outcomeReason,
							checkedAt,
						},
					}),
				),
			);
		},

		async upsertMockCrmLead(lead) {
			const data = {
				officeId: lead.officeId, name: lead.name, phone: lead.phone, outcome: lead.outcome,
				outcomeAt: lead.outcomeAt ? new Date(lead.outcomeAt) : null, outcomeReason: lead.outcomeReason,
			};
			await db.mockCrmLead.upsert({ where: { id: lead.id }, create: { id: lead.id, ...data }, update: data });
		},

		async findMockCrmLeads(officeId, where) {
			const rows = await db.mockCrmLead.findMany({
				where: {
					officeId,
					...(where.phone ? { phone: where.phone } : {}),
					...(where.ids ? { id: { in: where.ids } } : {}),
					...(where.query ? { name: { contains: where.query, mode: "insensitive" } } : {}),
				},
				orderBy: { name: "asc" },
				take: 20,
			});
			return rows.map((row) => ({
				id: row.id, officeId: row.officeId, name: row.name, phone: row.phone,
				outcome: row.outcome, outcomeAt: isoOrNull(row.outcomeAt), outcomeReason: row.outcomeReason,
			}));
		},
```
- Add a method that marks misses as checked without a lead. It reuses `saveCrmLink` with `leadId: null, leadName: null, method: "phone"`, so no extra store method is needed.
- In `packages/database/inbox/testing.ts`, add `"inbox_mock_crm_lead", "inbox_crm_connection"` to the `TRUNCATE` list (`inbox_crm_link` cascades from `inbox_conversation`).

- [ ] **Step 6: Run the tests and see them pass**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm-store.test.ts`
Expected: PASS, 6 tests. If the test database refuses the push, run `dropdb supastarter_test` (AGENTS) and run again.

- [ ] **Step 7: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add packages/database/prisma/schema.prisma packages/database/prisma/zod/index.ts packages/database/inbox/schema.ts packages/database/inbox/types.ts packages/database/inbox/store.ts packages/database/inbox/testing.ts apps/saas/modules/inbox/lib/crm-store.test.ts
git commit -m "feat(crm): the office's CRM connection, thread links with cached outcomes, and mock leads in the store (ADR 0003)"
```

---

### Task 2: The adapter seam, phone normalisation, and the mock adapter

**Files:**
- Create: `apps/saas/modules/inbox/lib/crm/types.ts`, `phone.ts`, `mock.ts`, `index.ts`
- Test: `apps/saas/modules/inbox/lib/crm/phone.test.ts`, `apps/saas/modules/inbox/lib/crm/mock.test.ts`

**Interfaces:**
- Consumes: `InboxStore.findMockCrmLeads`, `CrmKind`, `CrmOutcomeStatus` (Task 1)
- Produces:
  ```ts
  // types.ts
  export type CrmLead = { id: string; name: string; phone: string | null };
  export type CrmOutcome = { status: CrmOutcomeStatus; at: string | null; reason: string | null };
  export type CrmAdapter = {
  	kind: CrmKind;
  	/** Automatic match, phone only (ADR 0003). null when the guest has no phone or nothing matches. */
  	findLeadForConversation(conversation: { pipe: Pipe; guestId: string }): Promise<CrmLead | null>;
  	/** For the agent's manual picker. The agent chooses; nothing links on a name by itself. */
  	searchLeads(query: string): Promise<CrmLead[]>;
  	getLead(id: string): Promise<CrmLead | null>;
  	/** Current outcome per lead id; ids the CRM does not know are absent. */
  	outcomesFor(leadIds: string[]): Promise<Record<string, CrmOutcome>>;
  };
  // phone.ts
  export function toE164(raw: string, defaultCountry?: "84"): string | null;
  export function guestPhone(conversation: { pipe: Pipe; guestId: string }): string | null;
  // index.ts
  export function crmAdapterFor(connection: { kind: CrmKind }, deps: { store: InboxStore; officeId: string }): CrmAdapter;
  ```

- [ ] **Step 1: Write the failing phone tests**

`phone.test.ts`:
```ts
import { expect, test } from "vitest";

import { guestPhone, toE164 } from "./phone";

test("phone numbers in the shapes offices store them meet at one E.164", () => {
	for (const raw of ["+84901234567", "84901234567", "0901234567", "090 123 4567", "+84 90-123-4567", "(+84) 901.234.567"]) {
		expect(toE164(raw)).toBe("+84901234567");
	}
	expect(toE164("+82 10-1234-5678")).toBe("+821012345678");
	expect(toE164("821012345678")).toBe("+821012345678");
});

test("anything that is not a phone number is not one", () => {
	for (const raw of ["", "demo-ko-stay", "12345", "+1234567890123456", "abc0901234567"]) {
		expect(toE164(raw)).toBeNull();
	}
});

test("only a WhatsApp guest id is a phone; a Zalo id never is", () => {
	expect(guestPhone({ pipe: "whatsapp", guestId: "84901234567" })).toBe("+84901234567");
	expect(guestPhone({ pipe: "zalo", guestId: "84901234567" })).toBeNull();
	expect(guestPhone({ pipe: "whatsapp", guestId: "demo-ko-stay" })).toBeNull();
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm/phone.test.ts`
Expected: FAIL, "Cannot find module './phone'".

- [ ] **Step 3: Implement `phone.ts`**

```ts
import type { Pipe } from "../types";

/**
 * A phone number as E.164 (`+` and 8 to 15 digits), or null. A leading `0` is a national
 * number in the default country (Vietnam, `84`); digits without `+` already carry their
 * country code, which is how WhatsApp sends a `wa_id`. Formatting characters are ignored;
 * letters make it not a phone number.
 */
export function toE164(raw: string, defaultCountry = "84"): string | null {
	const trimmed = raw.trim();
	if (!/^[\s()+.\-\d]+$/.test(trimmed)) return null;
	const digits = trimmed.replace(/\D/g, "");
	const international = trimmed.replace(/[\s().-]/g, "").startsWith("+") ? digits
		: digits.startsWith("0") ? `${defaultCountry}${digits.slice(1)}`
		: digits;
	return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
}

/** The guest's phone, if the pipe identifies guests by phone: WhatsApp does, Zalo does not (ADR 0003). */
export function guestPhone(conversation: { pipe: Pipe; guestId: string }): string | null {
	return conversation.pipe === "whatsapp" ? toE164(conversation.guestId) : null;
}
```

- [ ] **Step 4: Run the phone tests and see them pass**

Same command. Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing mock adapter test**

`mock.test.ts`:
```ts
import { createInboxStore } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { resetTestInbox, testDb } from "../test-store";
import { crmAdapterFor } from "./index";

test("the mock CRM matches by phone, searches by name for the picker, and reports outcomes", async () => {
	await resetTestInbox();
	const store = createInboxStore(testDb);
	await store.upsertMockCrmLead({ id: "m1", officeId: "office-a", name: "Minji Park", phone: "+84901234567", outcome: "won", outcomeAt: "2026-09-20T00:00:00.000Z", outcomeReason: null });
	await store.upsertMockCrmLead({ id: "m2", officeId: "office-a", name: "Yuki Tanaka", phone: null, outcome: "open", outcomeAt: null, outcomeReason: null });
	const crm = crmAdapterFor({ kind: "mock" }, { store, officeId: "office-a" });

	expect(await crm.findLeadForConversation({ pipe: "whatsapp", guestId: "84901234567" })).toEqual({ id: "m1", name: "Minji Park", phone: "+84901234567" });
	expect(await crm.findLeadForConversation({ pipe: "zalo", guestId: "84901234567" })).toBeNull();
	expect(await crm.findLeadForConversation({ pipe: "whatsapp", guestId: "84999999999" })).toBeNull();
	expect((await crm.searchLeads("yuki")).map((lead) => lead.id)).toEqual(["m2"]);
	expect(await crm.getLead("nope")).toBeNull();
	expect(await crm.outcomesFor(["m1", "m2", "nope"])).toEqual({
		m1: { status: "won", at: "2026-09-20T00:00:00.000Z", reason: null },
		m2: { status: "open", at: null, reason: null },
	});
	await store.close();
});
```

- [ ] **Step 6: Run it and see it fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm/mock.test.ts`
Expected: FAIL, "Cannot find module './index'".

- [ ] **Step 7: Implement `types.ts`, `mock.ts`, and `index.ts`**

`types.ts`: exactly the types under **Interfaces**, importing `CrmKind`, `CrmOutcomeStatus`, `Pipe` from `../types`. Doc comment:
```ts
/**
 * One adapter per CRM (ADR 0003), shaped like the pipe adapters: product code never names
 * a vendor. Identity matching (phone formats, ids) lives inside each adapter.
 */
```
`mock.ts`:
```ts
import type { InboxStore } from "@repo/database/inbox";

import { guestPhone } from "./phone";
import type { CrmAdapter } from "./types";

/** The mock CRM (ADR 0003): leads in a local table, for development, tests and the demo. */
export function mockCrmAdapter(store: InboxStore, officeId: string): CrmAdapter {
	const toLead = (row: { id: string; name: string; phone: string | null }) => ({ id: row.id, name: row.name, phone: row.phone });
	return {
		kind: "mock",
		async findLeadForConversation(conversation) {
			const phone = guestPhone(conversation);
			if (!phone) return null;
			const [lead] = await store.findMockCrmLeads(officeId, { phone });
			return lead ? toLead(lead) : null;
		},
		async searchLeads(query) {
			const trimmed = query.trim();
			return trimmed ? (await store.findMockCrmLeads(officeId, { query: trimmed })).map(toLead) : [];
		},
		async getLead(id) {
			const [lead] = await store.findMockCrmLeads(officeId, { ids: [id] });
			return lead ? toLead(lead) : null;
		},
		async outcomesFor(leadIds) {
			if (leadIds.length === 0) return {};
			const leads = await store.findMockCrmLeads(officeId, { ids: leadIds });
			return Object.fromEntries(leads.map((lead) => [lead.id, { status: lead.outcome, at: lead.outcomeAt, reason: lead.outcomeReason }]));
		},
	};
}
```
`findMockCrmLeads` caps at 20 rows. `outcomesFor` batches of more than 20 must chunk. In `mock.ts`, split `leadIds` into chunks of 20 and merge the results.

`index.ts`:
```ts
import type { CrmKind, InboxStore } from "@repo/database/inbox";

import { mockCrmAdapter } from "./mock";
import type { CrmAdapter } from "./types";

export type { CrmAdapter, CrmLead, CrmOutcome } from "./types";
export { guestPhone, toE164 } from "./phone";

/** The only place a CRM kind becomes an adapter (ADR 0003). */
export function crmAdapterFor(connection: { kind: CrmKind }, deps: { store: InboxStore; officeId: string }): CrmAdapter {
	switch (connection.kind) {
		case "mock":
			return mockCrmAdapter(deps.store, deps.officeId);
	}
}
```

- [ ] **Step 8: Run both test files and see them pass**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm`
Expected: PASS, 4 tests.

- [ ] **Step 9: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add apps/saas/modules/inbox/lib/crm
git commit -m "feat(crm): the CRM adapter seam, E.164 phone matching and the mock adapter (ADR 0003)"
```

---

### Task 3: `refreshCrm`: automatic links and the 10-minute outcome cache

**Files:**
- Create: `apps/saas/modules/inbox/lib/crm/sync.ts`
- Modify: `apps/saas/modules/inbox/lib/runtime.ts` (optional `crm` factory)
- Test: `apps/saas/modules/inbox/lib/crm/sync.test.ts`

**Interfaces:**
- Consumes: `store.getCrmConnection`, `store.crmWork`, `store.saveCrmLink`, `store.saveCrmOutcomes` (Task 1); `CrmAdapter`, `crmAdapterFor` (Task 2)
- Produces:
  ```ts
  export const CRM_TTL_MS = 10 * 60 * 1000;
  export type CrmRefresh =
  	| { status: "none" }                    // the office has no CRM
  	| { status: "ok"; checked: number }
  	| { status: "failed"; error: string };  // cached outcomes kept
  export function refreshCrm(runtime: Runtime, officeId: string, now?: number): Promise<CrmRefresh>;
  // Runtime gains:  crm?: (connection: { kind: CrmKind }, deps: { store: InboxStore; officeId: string }) => CrmAdapter;
  ```

- [ ] **Step 1: Write the failing sync tests**

`sync.test.ts`:
```ts
import { conversationId, createInboxStore } from "@repo/database/inbox";
import { afterEach, expect, test } from "vitest";

import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { type Runtime } from "../runtime";
import { resetTestInbox, testDb } from "../test-store";
import { CRM_TTL_MS, refreshCrm } from "./sync";
import type { CrmAdapter } from "./types";

const OFFICE = "office-a";
const store = createInboxStore(testDb);
afterEach(async () => { await store.close(); });

/** A CRM that counts its calls and answers from fixed data. */
function fakeCrm(outcomes: Record<string, "open" | "won" | "lost">, byPhone: Record<string, string>) {
	const calls = { find: 0, outcomes: 0 };
	const adapter: CrmAdapter = {
		kind: "mock",
		async findLeadForConversation({ guestId }) {
			calls.find += 1;
			const id = byPhone[guestId];
			return id ? { id, name: `Lead ${id}`, phone: null } : null;
		},
		searchLeads: async () => [],
		getLead: async () => null,
		async outcomesFor(ids) {
			calls.outcomes += 1;
			return Object.fromEntries(ids.filter((id) => outcomes[id]).map((id) => [id, { status: outcomes[id], at: null, reason: null }]));
		},
	};
	return { adapter, calls };
}

function runtimeWith(adapter: CrmAdapter): Runtime {
	return { store, config: mockInboxConfig(), drafts: noDraftAdapter, crm: () => adapter };
}

const whatsapp = (guestId: string) => ({ pipe: "whatsapp" as const, source: "guest" as const, guestId, guestName: null, text: "hi", vendorMessageId: null });

test("an office without a CRM is left alone", async () => {
	await resetTestInbox();
	const { adapter, calls } = fakeCrm({}, {});
	expect(await refreshCrm(runtimeWith(adapter), OFFICE)).toEqual({ status: "none" });
	expect(calls).toEqual({ find: 0, outcomes: 0 });
});

test("unlinked threads are matched by phone, and outcomes are read in one batch", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	await store.upsertInbound(whatsapp("84900000000"), OFFICE);
	const { adapter, calls } = fakeCrm({ "lead-1": "won" }, { "84901234567": "lead-1" });
	const now = Date.now();
	expect(await refreshCrm(runtimeWith(adapter), OFFICE, now)).toEqual({ status: "ok", checked: 2 });
	const matched = await store.getConversation(conversationId(OFFICE, "whatsapp", "84901234567"));
	expect(matched?.crm).toMatchObject({ leadId: "lead-1", method: "phone", outcome: "won" });
	const missed = await store.getConversation(conversationId(OFFICE, "whatsapp", "84900000000"));
	expect(missed?.crm).toMatchObject({ leadId: null, method: "phone", outcome: null });
	expect(calls.outcomes).toBe(1);
});

test("inside the TTL nothing calls the CRM again, misses included", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84900000000"), OFFICE);
	await store.upsertInbound({ ...whatsapp("zalo-guest"), pipe: "zalo" }, OFFICE);
	const { adapter, calls } = fakeCrm({}, {});
	const now = Date.now();
	await refreshCrm(runtimeWith(adapter), OFFICE, now);
	const after = { ...calls };
	await refreshCrm(runtimeWith(adapter), OFFICE, now + CRM_TTL_MS - 1);
	expect(calls).toEqual(after);
	await refreshCrm(runtimeWith(adapter), OFFICE, now + CRM_TTL_MS + 1);
	expect(calls.find).toBeGreaterThan(after.find);
});

test("an agent's manual link or unlink is never overridden by phone matching", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	await store.saveCrmLink(id, { kind: "mock", leadId: null, leadName: null, method: "manual", checkedAt: new Date(0) });
	const { adapter, calls } = fakeCrm({}, { "84901234567": "lead-1" });
	await refreshCrm(runtimeWith(adapter), OFFICE);
	expect((await store.getConversation(id))?.crm).toMatchObject({ leadId: null, method: "manual" });
	expect(calls.find).toBe(0);
});

test("a CRM that throws keeps the cached outcomes and says so", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	const past = new Date(Date.now() - 2 * CRM_TTL_MS);
	await store.saveCrmLink(id, { kind: "mock", leadId: "lead-1", leadName: "L", method: "phone", checkedAt: past });
	await store.saveCrmOutcomes([{ conversationId: id, outcome: "lost", outcomeAt: past, outcomeReason: "price" }], past);
	const broken: CrmAdapter = { ...fakeCrm({}, {}).adapter, outcomesFor: async () => { throw new Error("503 from CRM"); } };
	expect(await refreshCrm(runtimeWith(broken), OFFICE)).toEqual({ status: "failed", error: "503 from CRM" });
	expect((await store.getConversation(id))?.crm).toMatchObject({ outcome: "lost", outcomeReason: "price" });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm/sync.test.ts`
Expected: FAIL, "Cannot find module './sync'".

- [ ] **Step 3: Add the optional factory to `Runtime`**

In `runtime.ts`, add this to `Runtime`:
```ts
	/** Tests swap the CRM adapter here; the app uses `crmAdapterFor` (ADR 0003). */
	crm?: (connection: { kind: CrmKind }, deps: { store: InboxStore; officeId: string }) => CrmAdapter;
```
It is optional, so the existing `setRuntimeForTests({ store, config, drafts })` calls still type-check.

- [ ] **Step 4: Implement `sync.ts`**

```ts
import type { Runtime } from "../runtime";
import { crmAdapterFor } from "./index";

/** How long a link's outcome, or a phone miss, is trusted before the CRM is asked again. */
export const CRM_TTL_MS = 10 * 60 * 1000;

export type CrmRefresh =
	| { status: "none" }
	| { status: "ok"; checked: number }
	| { status: "failed"; error: string };

/**
 * Fetch on view (ADR 0003, decided 2026-09-27): links unlinked threads by phone and
 * re-reads outcomes the cache no longer trusts. Only work older than `CRM_TTL_MS` reaches
 * the CRM, so the 10-second inbox poll costs nothing most of the time. A failure keeps
 * every cached outcome and is reported, never thrown.
 */
export async function refreshCrm(runtime: Runtime, officeId: string, now: number = Date.now()): Promise<CrmRefresh> {
	const connection = await runtime.store.getCrmConnection(officeId);
	if (!connection) return { status: "none" };
	const adapter = (runtime.crm ?? crmAdapterFor)(connection, { store: runtime.store, officeId });
	const checkedAt = new Date(now);
	try {
		const work = await runtime.store.crmWork(officeId, new Date(now - CRM_TTL_MS));
		const toRead: Array<{ conversationId: string; leadId: string }> = [];
		for (const item of work) {
			if (item.crm?.method === "manual" && !item.crm.leadId) {
				// Unlinked by an agent: nothing to read, and phone matching must not undo it.
				await runtime.store.saveCrmLink(item.conversationId, { ...item.crm, method: "manual", checkedAt });
				continue;
			}
			if (item.crm?.leadId) {
				toRead.push({ conversationId: item.conversationId, leadId: item.crm.leadId });
				continue;
			}
			const lead = await adapter.findLeadForConversation(item);
			await runtime.store.saveCrmLink(item.conversationId, {
				kind: connection.kind,
				leadId: lead?.id ?? null,
				leadName: lead?.name ?? null,
				method: "phone",
				checkedAt,
			});
			if (lead) toRead.push({ conversationId: item.conversationId, leadId: lead.id });
		}
		if (toRead.length > 0) {
			const outcomes = await adapter.outcomesFor([...new Set(toRead.map((item) => item.leadId))]);
			await runtime.store.saveCrmOutcomes(
				toRead.flatMap(({ conversationId, leadId }) => {
					const outcome = outcomes[leadId];
					return outcome
						? [{ conversationId, outcome: outcome.status, outcomeAt: outcome.at ? new Date(outcome.at) : null, outcomeReason: outcome.reason }]
						: [];
				}),
				checkedAt,
			);
		}
		return { status: "ok", checked: work.length };
	} catch (error) {
		return { status: "failed", error: error instanceof Error ? error.message : String(error) };
	}
}
```
A lead the CRM no longer returns (deleted there) must not keep its old outcome, and its `checkedAt` must still move, or it is re-read on every call. So the mapping writes a null outcome for it instead of skipping it. Replace the `flatMap` above with:
```ts
				toRead.map(({ conversationId, leadId }) => {
					const outcome = outcomes[leadId];
					return {
						conversationId,
						outcome: outcome?.status ?? null,
						outcomeAt: outcome?.at ? new Date(outcome.at) : null,
						outcomeReason: outcome?.reason ?? null,
					};
				}),
```
This widens `saveCrmOutcomes`' `outcome` to `CrmOutcomeStatus | null`, as declared in Task 1. Append to the Step 1 test file:
```ts
test("a lead the CRM no longer knows loses its outcome instead of being re-read forever", async () => {
	await resetTestInbox();
	await store.setCrmConnection(OFFICE, "mock");
	await store.upsertInbound(whatsapp("84901234567"), OFFICE);
	const id = conversationId(OFFICE, "whatsapp", "84901234567");
	const past = new Date(Date.now() - 2 * CRM_TTL_MS);
	await store.saveCrmLink(id, { kind: "mock", leadId: "deleted", leadName: "D", method: "phone", checkedAt: past });
	await store.saveCrmOutcomes([{ conversationId: id, outcome: "won", outcomeAt: past, outcomeReason: null }], past);
	const { adapter, calls } = fakeCrm({}, {});
	const now = Date.now();
	await refreshCrm(runtimeWith(adapter), OFFICE, now);
	expect((await store.getConversation(id))?.crm).toMatchObject({ leadId: "deleted", outcome: null });
	await refreshCrm(runtimeWith(adapter), OFFICE, now + 1000);
	expect(calls.outcomes).toBe(1);
});
```

- [ ] **Step 5: Run the tests and see them pass**

Same command. Expected: PASS, 6 tests.

- [ ] **Step 6: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add apps/saas/modules/inbox/lib/crm/sync.ts apps/saas/modules/inbox/lib/crm/sync.test.ts apps/saas/modules/inbox/lib/runtime.ts
git commit -m "feat(crm): refreshCrm links threads by phone and re-reads outcomes older than 10 minutes (ADR 0003)"
```

---

### Task 4: Won or lost threads leave the queue

**Files:**
- Modify: `apps/saas/modules/inbox/lib/queue.ts`
- Test: `apps/saas/modules/inbox/lib/queue.test.ts` (append)

**Interfaces:**
- Consumes: `Conversation.crm` (Task 1)
- Produces:
  ```ts
  export function isResolved(conversation: Pick<Conversation, "crm" | "lastGuestInboundAt">): boolean;
  export function inQueue(conversation: Pick<Conversation, "unansweredInboundId" | "crm" | "lastGuestInboundAt">): boolean;
  ```
  `inView`, `isQuiet`, and the counts in `buildQueueView` use `inQueue` in place of `yourTurn`. `yourTurn` stays: approval still depends on it.

- [ ] **Step 1: Write the failing queue tests**

The file builds threads with `conv({ id, guestName, ...partial })`, where the default is Your turn and the guest last wrote `2026-09-01`. First add `crm: null,` to the object `conv` returns, after `lastAnswer: null,`, so the fixture satisfies the widened `Conversation`. Then append:
```ts
const crm = (outcome: "open" | "won" | "lost", outcomeAt: string) => ({
	kind: "mock" as const, leadId: "lead-1", leadName: "Lead", method: "phone" as const,
	outcome, outcomeAt, outcomeReason: null, checkedAt: outcomeAt,
});

test("a won or lost lead leaves the queue and shows under Sent and All", () => {
	const lost = conv({ id: "lost", guestName: "L", lastGuestInboundAt: "2026-09-04T10:00:00.000Z", crm: crm("lost", "2026-09-04T11:00:00.000Z") });
	const open = conv({ id: "open", guestName: "O", lastGuestInboundAt: "2026-09-04T10:00:00.000Z", crm: crm("open", "2026-09-04T11:00:00.000Z") });
	expect(isResolved(lost)).toBe(true);
	expect(inQueue(lost)).toBe(false);
	expect(inQueue(open)).toBe(true);
	const queue = buildQueueView([lost, open], "yourTurn", "", NOW);
	expect(queue.visible.map((c) => c.id)).toEqual(["open"]);
	expect(queue.counts).toEqual({ yourTurn: 1, sent: 1, all: 2 });
	expect(buildQueueView([lost, open], "sent", "", NOW).visible.map((c) => c.id)).toEqual(["lost"]);
});

test("a guest who writes after the outcome is back in the queue", () => {
	const wroteBack = conv({ id: "back", guestName: "B", lastGuestInboundAt: "2026-09-04T12:00:00.000Z", crm: crm("lost", "2026-09-04T11:00:00.000Z") });
	expect(isResolved(wroteBack)).toBe(false);
	expect(inQueue(wroteBack)).toBe(true);
});

test("an unlinked or open thread is untouched by the CRM", () => {
	const plain = conv({ id: "plain", guestName: "P" });
	expect(isResolved(plain)).toBe(false);
	expect(inQueue(plain)).toBe(true);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/queue.test.ts`
Expected: FAIL, "isResolved is not a function".

- [ ] **Step 3: Implement**

In `queue.ts`, after `yourTurn`:
```ts
/**
 * The CRM reports the lead won or lost (CONTEXT, "Resolved"), and the guest has not written
 * since. A guest who writes after the outcome is back in the queue: a lost lead writing
 * again is exactly who the agent must see.
 */
export function isResolved(conversation: Pick<Conversation, "crm" | "lastGuestInboundAt">): boolean {
	const crm = conversation.crm;
	if (!crm?.leadId || (crm.outcome !== "won" && crm.outcome !== "lost")) return false;
	if (!crm.outcomeAt || !conversation.lastGuestInboundAt) return true;
	return time(conversation.lastGuestInboundAt) <= time(crm.outcomeAt);
}

/** In the queue: Your turn and not resolved. */
export function inQueue(conversation: Pick<Conversation, "unansweredInboundId" | "crm" | "lastGuestInboundAt">): boolean {
	return yourTurn(conversation) && !isResolved(conversation);
}
```
Replace `yourTurn(conversation)` with `inQueue(conversation)` in `isQuiet`, `inView`, and the counts loop of `buildQueueView`, and widen those `Pick`s to include `"crm" | "lastGuestInboundAt"`. `time` is declared above `isQuiet`; move it above `isResolved`.

- [ ] **Step 4: Run the tests and see them pass**

Same command. Expected: PASS, the whole file.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add apps/saas/modules/inbox/lib/queue.ts apps/saas/modules/inbox/lib/queue.test.ts
git commit -m "feat(inbox): a lead the CRM reports won or lost leaves the queue until the guest writes again (ADR 0003)"
```

---

### Task 5: API: the lead picker, link and unlink, and refresh on the list

**Files:**
- Create: `apps/saas/app/api/crm/leads/route.ts`, `apps/saas/app/api/conversations/[id]/crm-link/route.ts`, `apps/saas/modules/inbox/lib/crm/link.ts`
- Modify: `apps/saas/app/api/conversations/route.ts`
- Test: `apps/saas/modules/inbox/lib/crm/link.test.ts`

**Interfaces:**
- Consumes: `refreshCrm` (Task 3), `crmAdapterFor`, `CrmAdapter` (Task 2), `requireInboxSession`, `runInBackground` (existing, `lib/background.ts`)
- Produces (route logic lives in `link.ts`, so tests run it without HTTP):
  ```ts
  export type LinkResult =
  	| { ok: true; conversation: Conversation }
  	| { ok: false; status: 404 | 409; error: "not_found" | "crm_not_connected" | "lead_not_found" };
  export function searchCrmLeads(runtime: Runtime, viewer: InboxViewer, query: string): Promise<{ ok: true; leads: CrmLead[] } | { ok: false; status: 409; error: "crm_not_connected" }>;
  export function linkCrmLead(runtime: Runtime, viewer: InboxViewer, conversationId: string, leadId: string): Promise<LinkResult>;
  export function unlinkCrmLead(runtime: Runtime, viewer: InboxViewer, conversationId: string): Promise<LinkResult>;
  ```
  HTTP: `GET /api/crm/leads?q=` → `{ leads }` or `409 {error}`. `POST /api/conversations/:id/crm-link {leadId}` and `DELETE /api/conversations/:id/crm-link` → `{ conversation }` or `{ error }` with that status.

- [ ] **Step 1: Write the failing link tests**

`link.test.ts`:
```ts
import { conversationId, createInboxStore } from "@repo/database/inbox";
import { expect, test } from "vitest";

import { mockInboxConfig } from "../config";
import { noDraftAdapter } from "../drafts";
import { resetTestInbox, testDb } from "../test-store";
import { linkCrmLead, searchCrmLeads, unlinkCrmLead } from "./link";

const store = createInboxStore(testDb);
const runtime = { store, config: mockInboxConfig(), drafts: noDraftAdapter };
const viewer = { userId: "agent-1", officeId: "office-a" };
const zalo = { pipe: "zalo" as const, source: "guest" as const, guestId: "z1", guestName: null, text: "Chào", vendorMessageId: null };

async function setup() {
	await resetTestInbox();
	await store.setCrmConnection("office-a", "mock");
	await store.upsertMockCrmLead({ id: "thao", officeId: "office-a", name: "Thảo Nguyễn", phone: null, outcome: "open", outcomeAt: null, outcomeReason: null });
	await store.upsertMockCrmLead({ id: "foreign", officeId: "office-b", name: "Thảo Other", phone: null, outcome: "won", outcomeAt: null, outcomeReason: null });
	await store.upsertInbound(zalo, "office-a");
	await store.upsertInbound(zalo, "office-b");
}

test("an agent links a Zalo thread by hand and unlinks it", async () => {
	await setup();
	const id = conversationId("office-a", "zalo", "z1");
	const found = await searchCrmLeads(runtime, viewer, "thảo");
	expect(found.ok && found.leads.map((lead) => lead.id)).toEqual(["thao"]);
	const linked = await linkCrmLead(runtime, viewer, id, "thao");
	expect(linked.ok && linked.conversation.crm).toMatchObject({ leadId: "thao", method: "manual", outcome: "open" });
	const unlinked = await unlinkCrmLead(runtime, viewer, id);
	expect(unlinked.ok && unlinked.conversation.crm).toMatchObject({ leadId: null, method: "manual" });
});

test("another office's thread, or a lead the office's CRM does not have, is not found", async () => {
	await setup();
	expect(await linkCrmLead(runtime, viewer, conversationId("office-b", "zalo", "z1"), "thao")).toEqual({ ok: false, status: 404, error: "not_found" });
	expect(await linkCrmLead(runtime, viewer, conversationId("office-a", "zalo", "z1"), "foreign")).toEqual({ ok: false, status: 404, error: "lead_not_found" });
});

test("an office without a CRM gets crm_not_connected", async () => {
	await setup();
	await store.setCrmConnection("office-a", null);
	expect(await searchCrmLeads(runtime, viewer, "thảo")).toEqual({ ok: false, status: 409, error: "crm_not_connected" });
	expect(await linkCrmLead(runtime, viewer, conversationId("office-a", "zalo", "z1"), "thao")).toEqual({ ok: false, status: 409, error: "crm_not_connected" });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/crm/link.test.ts`
Expected: FAIL, "Cannot find module './link'".

- [ ] **Step 3: Implement `link.ts`**

```ts
import type { Conversation, InboxViewer } from "@repo/database/inbox";

import type { Runtime } from "../runtime";
import { crmAdapterFor } from "./index";
import type { CrmLead } from "./types";

export type LinkResult =
	| { ok: true; conversation: Conversation }
	| { ok: false; status: 404 | 409; error: "not_found" | "crm_not_connected" | "lead_not_found" };

async function officeAdapter(runtime: Runtime, officeId: string) {
	const connection = await runtime.store.getCrmConnection(officeId);
	return connection
		? { connection, adapter: (runtime.crm ?? crmAdapterFor)(connection, { store: runtime.store, officeId }) }
		: null;
}

/** The manual picker's search (ADR 0003): a person chooses the lead; nothing links on a name alone. */
export async function searchCrmLeads(runtime: Runtime, viewer: InboxViewer, query: string) {
	const crm = await officeAdapter(runtime, viewer.officeId);
	if (!crm) return { ok: false as const, status: 409 as const, error: "crm_not_connected" as const };
	return { ok: true as const, leads: await crm.adapter.searchLeads(query) };
}

export async function linkCrmLead(runtime: Runtime, viewer: InboxViewer, conversationId: string, leadId: string): Promise<LinkResult> {
	const conversation = await runtime.store.getConversation(conversationId, viewer);
	if (!conversation) return { ok: false, status: 404, error: "not_found" };
	const crm = await officeAdapter(runtime, viewer.officeId);
	if (!crm) return { ok: false, status: 409, error: "crm_not_connected" };
	const lead = await crm.adapter.getLead(leadId);
	if (!lead) return { ok: false, status: 404, error: "lead_not_found" };
	const checkedAt = new Date();
	await runtime.store.saveCrmLink(conversationId, { kind: crm.connection.kind, leadId: lead.id, leadName: lead.name, method: "manual", checkedAt });
	const outcome = (await crm.adapter.outcomesFor([lead.id]))[lead.id];
	if (outcome) {
		await runtime.store.saveCrmOutcomes(
			[{ conversationId, outcome: outcome.status, outcomeAt: outcome.at ? new Date(outcome.at) : null, outcomeReason: outcome.reason }],
			checkedAt,
		);
	}
	return { ok: true, conversation: (await runtime.store.getConversation(conversationId, viewer)) as Conversation };
}

/** Unlinking is remembered as an agent's choice, so phone matching never relinks it. */
export async function unlinkCrmLead(runtime: Runtime, viewer: InboxViewer, conversationId: string): Promise<LinkResult> {
	const conversation = await runtime.store.getConversation(conversationId, viewer);
	if (!conversation) return { ok: false, status: 404, error: "not_found" };
	const crm = await officeAdapter(runtime, viewer.officeId);
	if (!crm) return { ok: false, status: 409, error: "crm_not_connected" };
	await runtime.store.saveCrmLink(conversationId, { kind: crm.connection.kind, leadId: null, leadName: null, method: "manual", checkedAt: new Date() });
	return { ok: true, conversation: (await runtime.store.getConversation(conversationId, viewer)) as Conversation };
}

export type { CrmLead };
```

- [ ] **Step 4: Run the tests and see them pass**

Same command. Expected: PASS, 3 tests.

- [ ] **Step 5: Write the routes**

`apps/saas/app/api/crm/leads/route.ts`:
```ts
import { searchCrmLeads } from "@inbox/lib/crm/link";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** `?q=` searches the office's CRM for the "link to CRM lead" picker (ADR 0003). */
export async function GET(request: Request): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
	const result = await searchCrmLeads(getRuntime(), gate.viewer, query);
	return result.ok
		? NextResponse.json({ leads: result.leads })
		: NextResponse.json({ error: result.error }, { status: result.status });
}
```
`apps/saas/app/api/conversations/[id]/crm-link/route.ts`:
```ts
import { type LinkResult, linkCrmLead, unlinkCrmLead } from "@inbox/lib/crm/link";
import { requireInboxSession } from "@inbox/lib/require-session";
import { getRuntime } from "@inbox/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function respond(result: LinkResult): Response {
	return result.ok
		? NextResponse.json({ conversation: result.conversation })
		: NextResponse.json({ error: result.error }, { status: result.status });
}

/** Link the thread to a CRM lead the agent picked (ADR 0003). Body: `{ leadId }`. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const { id } = await context.params;
	let leadId: string | undefined;
	try {
		const body = (await request.json()) as { leadId?: unknown };
		if (typeof body.leadId === "string" && body.leadId.trim()) leadId = body.leadId;
	} catch {
		// A malformed body links nothing; refused below.
	}
	if (!leadId) return NextResponse.json({ error: "lead_required" }, { status: 400 });
	return respond(await linkCrmLead(getRuntime(), gate.viewer, decodeURIComponent(id), leadId));
}

/** Unlink; remembered as the agent's choice so phone matching never relinks it. */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
	const gate = await requireInboxSession(request);
	if (gate.denied) return gate.denied;
	const { id } = await context.params;
	return respond(await unlinkCrmLead(getRuntime(), gate.viewer, decodeURIComponent(id)));
}
```

In `apps/saas/app/api/conversations/route.ts`, after `scheduleMissingTranslations(...)`:
```ts
	// Fetch on view (ADR 0003): links and outcomes land by the next poll; the list never waits on the CRM.
	void runInBackground("crm-refresh", async () => {
		await refreshCrm(runtime, gate.viewer.officeId);
	});
```
Import `runInBackground` from `@inbox/lib/background`, and `refreshCrm` from `@inbox/lib/crm/sync`.

- [ ] **Step 6: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add apps/saas/modules/inbox/lib/crm/link.ts apps/saas/modules/inbox/lib/crm/link.test.ts apps/saas/app/api/crm apps/saas/app/api/conversations/route.ts "apps/saas/app/api/conversations/[id]/crm-link"
git commit -m "feat(crm): search, link and unlink a thread's CRM lead, and refresh links on the inbox list (ADR 0003)"
```

---

### Task 6: The thread's CRM chip and the "Link to CRM lead" picker

**Files:**
- Create: `apps/saas/modules/inbox/components/CrmLink.tsx`
- Modify: `apps/saas/modules/inbox/lib/inbox-queries.ts`, `apps/saas/modules/inbox/components/ThreadDetail.tsx`, `packages/i18n/translations/{de,en,es,fr,vi}/saas.json` (`inbox.crm`)

**Interfaces:**
- Consumes: the Task 5 routes, `Conversation.crm`, `isResolved` (Task 4)
- Produces: `useCrmLeadSearch(query: string)`, `useLinkCrmLead()`, `useUnlinkCrmLead()`; `<CrmLink conversation={conversation} />`

- [ ] **Step 1: Add the query hooks**

In `inbox-queries.ts`:
```ts
export function useCrmLeadSearch(query: string) {
	const trimmed = query.trim();
	return useQuery({
		queryKey: ["inbox", "crm-leads", trimmed],
		queryFn: () => api<{ leads: Array<{ id: string; name: string; phone: string | null }> }>(`/api/crm/leads?q=${encodeURIComponent(trimmed)}`),
		enabled: trimmed.length >= 2,
		staleTime: 30_000,
	});
}

export function useLinkCrmLead() {
	const mutation = useConversationMutation("crm-link");
	return { ...mutation, mutateAsync: ({ id, leadId }: { id: string; leadId: string }) => mutation.mutateAsync({ id, body: { leadId } }) };
}

export function useUnlinkCrmLead() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id }: { id: string }) =>
			api<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}/crm-link`, { method: "DELETE" }),
		onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: conversationsQueryKey }); },
	});
}
```

- [ ] **Step 2: Build `CrmLink.tsx`**

The header shows one of four states:

| `conversation.crm` | Shows |
|---|---|
| `null` (office has no CRM, or not looked up yet) | nothing |
| `leadId` set, outcome `won` / `lost` | chip "Won" (success tone) / "Lost" (neutral) with the lead name, and the reason in a tooltip |
| `leadId` set, outcome `open` or null | chip "In CRM: {leadName}" |
| `leadId` null | ghost button "Link to CRM lead" |

Clicking the chip or the button opens a `Popover` (`@repo/ui/components/popover`) with an `Input` (autofocus; min 2 characters), results from `useCrmLeadSearch` as buttons (name plus phone in muted mono), and, when linked, an "Unlink" text button. Choosing a lead calls `useLinkCrmLead().mutateAsync` and closes the popover. An error shows the `inbox.crm.errors.<code>` string inline. Use `CompactFlag` from `ThreadParts.tsx` for the chip, so it matches the pipe and turn flags. Buttons in the popover are at least 44 px tall (`min-h-11`), matching the thread header.

Render `<CrmLink conversation={conversation} />` in `ThreadDetail.tsx`'s header, right after `<ThreadFlags conversation={conversation} />`.

- [ ] **Step 3: Add the strings**

In `inbox` of every `saas.json` (`de`, `en`, `es`, `fr`, `vi`), add `crm`. English:
```json
"crm": {
	"won": "Won",
	"lost": "Lost",
	"inCrm": "In CRM: {name}",
	"link": "Link to CRM lead",
	"searchPlaceholder": "Search the CRM by name or phone",
	"searchHint": "Type at least 2 letters.",
	"noResults": "No lead matches.",
	"unlink": "Unlink",
	"errors": {
		"crm_not_connected": "This office has no CRM connected.",
		"lead_not_found": "That lead is not in this office's CRM.",
		"not_found": "This thread is no longer here.",
		"lead_required": "Pick a lead first."
	}
}
```
For `vi`, write Vietnamese. For `de`, `es`, and `fr`, follow each file's existing `inbox` block: translate it if that block is translated, and copy the English if the block is English.

- [ ] **Step 4: Check it in the browser**

Start `pnpm --filter saas dev --port 3012` (worktree) or use 3010, sign in as `walk@nhip.local`, and open Inbox. The seed from Task 9 is not in yet, so use a Prisma one-off: set the walk office's CRM to mock and add one mock lead named "Thảo Nguyễn". Then:
1. Open Thảo's thread. The header shows "Link to CRM lead".
2. Search "thả", pick the lead. The header shows "In CRM: Thảo Nguyễn".
3. Unlink. The button returns.
4. Set the lead's outcome to `lost` in the database, and wait for the next poll after the 10-minute TTL, or call the link route again. The thread leaves Your turn and shows "Lost" under Sent.
Take a screenshot of states 2 and 4 for the PR.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add apps/saas/modules/inbox/components/CrmLink.tsx apps/saas/modules/inbox/components/ThreadDetail.tsx apps/saas/modules/inbox/lib/inbox-queries.ts packages/i18n/translations/*/saas.json
git commit -m "feat(inbox): the thread shows its CRM lead and outcome, and an agent can link or unlink it by hand (ADR 0003)"
```

---

### Task 7: Home counts Closings and Lost from the CRM

**Files:**
- Modify: `packages/database/inbox/schema.ts` (`Funnel.crm`), `packages/database/inbox/store.ts` (`funnel`), `apps/saas/modules/home/lib/funnel.ts`, `apps/saas/modules/home/components/Home.tsx`, `packages/i18n/translations/{en,vi}/saas.json` (`home`)
- Test: `apps/saas/modules/inbox/lib/funnel.test.ts` (append)

**Interfaces:**
- Consumes: `CrmLink` rows (Task 1), `refreshCrm` (Task 3)
- Produces:
  ```ts
  // Funnel gains:
  crm: { linked: number; closings: number; lost: number } | null;   // null: the office has no CRM
  // HomeFunnel's success arm gains:  crmStale: boolean;
  ```

- [ ] **Step 1: Write the failing funnel tests**

Append to `funnel.test.ts`:
```ts
test("closings and lost count distinct CRM leads in the cohort; no CRM means null", async () => {
	const store = await testInboxStore();
	const now = Date.now();
	for (const guestId of ["a", "b", "c", "d"]) {
		await store.upsertInbound(inbound(guestId, now - 60 * MINUTE), OFFICE);
	}
	const window = { since: new Date(now - DAY), countMock: true };
	expect((await store.funnel(viewer, window)).crm).toBeNull();

	await store.setCrmConnection(OFFICE, "mock");
	const at = new Date(now);
	const link = async (guestId: string, leadId: string, outcome: "open" | "won" | "lost") => {
		const id = conversationId(OFFICE, "zalo", guestId);
		await store.saveCrmLink(id, { kind: "mock", leadId, leadName: leadId, method: "manual", checkedAt: at });
		await store.saveCrmOutcomes([{ conversationId: id, outcome, outcomeAt: at, outcomeReason: null }], at);
	};
	await link("a", "deal-1", "won");
	await link("b", "deal-1", "won"); // the same guest on another thread: one deal
	await link("c", "deal-2", "lost");
	expect((await store.funnel(viewer, window)).crm).toEqual({ linked: 3, closings: 1, lost: 1 });
	await store.close();
});
```
The outcome of a thread that is not linked, or linked with `leadId: null`, counts toward nothing. `d` covers that.

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/funnel.test.ts`
Expected: FAIL: `crm` is `undefined`.

- [ ] **Step 3: Implement**

In `schema.ts`, add to `Funnel`:
```ts
	/** From the office's CRM (ADR 0003): distinct leads, so one deal on two threads counts once. null: no CRM connected. */
	crm: z.object({ linked: z.number().int().nonnegative(), closings: z.number().int().nonnegative(), lost: z.number().int().nonnegative() }).nullable(),
```
In `store.ts`, in `funnel`, after the leads query:
```ts
			const connected = await db.crmConnection.findUnique({ where: { officeId: viewer.officeId }, select: { officeId: true } });
			let crm: Funnel["crm"] = null;
			if (connected) {
				const [row] = await db.$queryRaw<Array<{ linked: bigint; closings: bigint; lost: bigint }>>`
					SELECT COUNT(*) FILTER (WHERE "l"."leadId" IS NOT NULL) AS "linked",
					       COUNT(DISTINCT "l"."leadId") FILTER (WHERE "l"."outcome" = 'won') AS "closings",
					       COUNT(DISTINCT "l"."leadId") FILTER (WHERE "l"."outcome" = 'lost') AS "lost"
					FROM "inbox_crm_link" "l"
					JOIN "inbox_conversation" "c" ON "c"."id" = "l"."conversationId"
					WHERE "c"."officeId" = ${viewer.officeId}
					  AND (SELECT MIN("m"."at") FROM "inbox_message" "m" WHERE "m"."conversationId" = "c"."id" AND "m"."direction" = 'in') >= ${since}
				`;
				crm = { linked: Number(row.linked), closings: Number(row.closings), lost: Number(row.lost) };
			}
```
Add `crm` to the returned `funnel` object.

In `apps/saas/modules/home/lib/funnel.ts`, before `store.funnel`:
```ts
	// Fetch on view (ADR 0003): at most 3 s for the CRM, then count what is cached.
	const refresh = await Promise.race([
		refreshCrm(runtime, office.officeId),
		new Promise<{ status: "failed"; error: string }>((resolve) => setTimeout(() => resolve({ status: "failed", error: "timeout" }), 3000)),
	]);
```
Return `{ funnel, crmStale: refresh.status === "failed" }`, and add `crmStale: boolean` to the success arm of `HomeFunnel`.

In `Home.tsx`, `FROM_CRM` stages:
- `funnel?.crm === null` or no funnel: keep today's "Connect your CRM" block, unchanged.
- Otherwise: `<Count value={funnel.crm[stage]} of={funnel.leadsIn} hint={t("fromCrm", { linked: funnel.crm.linked, leads: funnel.leadsIn })} />`.
- Under the funnel, when `crmStale`: a muted line with `t("crmStale")`.

Strings (en; vi translated) in `home`:
```json
"fromCrm": "From your CRM · {linked} of {leads} leads linked",
"crmStale": "Your CRM did not answer in time. Closings and lost may be out of date."
```
Change `responseTimeHint` to `"First inbound to the office's first reply."` (the phone-reply change in #32 already made "approved send" wrong).

- [ ] **Step 4: Run the tests and see them pass**

Same command. Expected: PASS, the whole file.

- [ ] **Step 5: Check Home in the browser**

With the Task 6 one-off data, `/en/home` shows Closings and Lost as numbers with the "From your CRM · n of m leads linked" hint. With the office's CRM cleared (`setCrmConnection(walk, null)`), both show "Connect your CRM" again.

- [ ] **Step 6: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add packages/database/inbox/schema.ts packages/database/inbox/store.ts apps/saas/modules/inbox/lib/funnel.test.ts apps/saas/modules/home packages/i18n/translations/en/saas.json packages/i18n/translations/vi/saas.json
git commit -m "feat(home): closings and lost come from the office's CRM, counted per deal (ADR 0003)"
```

---

### Task 8: The platform admin connects an office's CRM

**Files:**
- Create: `packages/api/modules/admin/procedures/organization-crm.ts`, `apps/saas/modules/admin/component/organizations/CrmConnectionCard.tsx`
- Modify: `packages/api/modules/admin/router.ts`, `apps/saas/modules/admin/component/organizations/OrganizationForm.tsx`, `packages/i18n/translations/{de,en,es,fr,vi}/saas.json` (`admin.organizations.crm`)
- Test: `packages/api/modules/admin/procedures/organization-crm.test.ts`. `packages/api` runs `vitest run`; follow `orpc/procedures.test.ts` for how it builds an admin and a non-admin context.

**Interfaces:**
- Consumes: `store.getCrmConnection`, `store.setCrmConnection` (Task 1)
- Produces: `orpc.admin.organizations.crm.get({ id }) → { kind: "mock" | null }`, `orpc.admin.organizations.crm.set({ id, kind: "mock" | null }) → { kind }`

- [ ] **Step 1: Write the procedures**

```ts
import { db } from "@repo/database";
import { CrmKind, createInboxStore } from "@repo/database/inbox";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

const store = () => createInboxStore(db);
const Output = z.object({ kind: CrmKind.nullable() });

/** The office's CRM (ADR 0003). Nhịp assigns it, like the office itself (ADR 0010). */
export const getOrganizationCrm = adminProcedure
	.route({ method: "GET", path: "/admin/organizations/{id}/crm", tags: ["Administration"], summary: "Get the office's CRM" })
	.input(z.object({ id: z.string() }))
	.output(Output)
	.handler(async ({ input }) => ({ kind: (await store().getCrmConnection(input.id))?.kind ?? null }));

export const setOrganizationCrm = adminProcedure
	.route({ method: "PUT", path: "/admin/organizations/{id}/crm", tags: ["Administration"], summary: "Set the office's CRM" })
	.input(z.object({ id: z.string(), kind: CrmKind.nullable() }))
	.output(Output)
	.handler(async ({ input }) => {
		await store().setCrmConnection(input.id, input.kind);
		return { kind: input.kind };
	});
```
Check that `@repo/database/inbox` is importable from `packages/api`: its `package.json` has `@repo/database: workspace:*` and the `./inbox` export exists. The store must not be `close()`d here, because it shares the app's client.

Router: `organizations: { list, find, crm: { get: getOrganizationCrm, set: setOrganizationCrm } }`.

- [ ] **Step 2: Build `CrmConnectionCard.tsx`**

It is a `Card` titled `t("admin.organizations.crm.title")` with a `Select` (`@repo/ui/components/select`) offering "None" and "Mock CRM (development and demo)". It reads `useQuery(orpc.admin.organizations.crm.get.queryOptions({ input: { id } }))`, and on change calls `useMutation(orpc.admin.organizations.crm.set.mutationOptions())`, then shows `toast` success or error and invalidates the get query. Under the select, a muted hint: `t("admin.organizations.crm.hint")`. Render it in `OrganizationForm.tsx` inside the `organization && (...)` block, before `OrganizationMembersBlock`.

Strings in `admin.organizations` of all five locales:
```json
"crm": {
	"title": "CRM",
	"hint": "Closings and lost on Home come from this CRM. API keys live in the deployment's environment.",
	"none": "None",
	"mock": "Mock CRM (development and demo)",
	"saved": "CRM saved",
	"failed": "Could not save the CRM"
}
```

- [ ] **Step 3: Test the procedure**

Call `setOrganizationCrm` and `getOrganizationCrm` through the router with an admin context, as `orpc/procedures.test.ts` does. Assert that `set({ kind: "mock" })` then `get` returns `{ kind: "mock" }`, that `set({ kind: null })` then `get` returns `{ kind: null }`, and that a non-admin context is refused with `FORBIDDEN`. If `procedures.test.ts` mocks `@repo/database` instead of using a database, mock `createInboxStore` the same way and assert on the calls.

- [ ] **Step 4: Check it in the browser**

Sign in as `admin@nhip.local`, open Admin → Organizations → walk office, set "Mock CRM", and reload: the choice persists. Set "None": Home shows "Connect your CRM" for the walk agent.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
git add packages/api/modules/admin apps/saas/modules/admin/component/organizations packages/i18n/translations/*/saas.json
git commit -m "feat(admin): the platform admin sets an office's CRM (ADR 0003)"
```

---

### Task 9: Seed, docs, and the whole-branch check

**Files:**
- Modify: `apps/saas/modules/inbox/lib/seed.ts`, `apps/saas/modules/inbox/scripts/seed.ts`, `apps/saas/modules/inbox/lib/seed.test.ts`
- Modify: `docs/adr/0003-crm-adapter.md`, `CONTEXT.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above
- Produces: `seedCrm(officeId: string): Promise<void>` in `seed.ts`

- [ ] **Step 1: Write the failing seed test**

Append to `seed.test.ts`:
```ts
test("the walk office's mock CRM: four leads, Thảo linked open, Alexei linked lost", async () => {
	await resetTestInbox();
	const store = createInboxStore(testDb);
	setRuntimeForTests({ store, config: mockInboxConfig(), drafts: noDraftAdapter });
	await seedInbox(WALK_OFFICE_ID);
	await seedCrm(WALK_OFFICE_ID);
	await seedCrm(WALK_OFFICE_ID); // idempotent
	expect(await store.getCrmConnection(WALK_OFFICE_ID)).toEqual({ kind: "mock" });
	expect(await testDb.mockCrmLead.count({ where: { officeId: WALK_OFFICE_ID } })).toBe(4);
	const list = await store.listConversations({ userId: "seed", officeId: WALK_OFFICE_ID });
	const crmOf = (name: string) => list.find((c) => c.guestName === name)?.crm;
	expect(crmOf("Thảo")).toMatchObject({ method: "manual", outcome: "open" });
	expect(crmOf("Alexei")).toMatchObject({ method: "manual", outcome: "lost" });
	expect(crmOf("Minji")).toBeNull();
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/saas && pnpm exec dotenv -c -e ../../.env.local -- vitest run modules/inbox/lib/seed.test.ts`
Expected: FAIL, "seedCrm is not a function".

- [ ] **Step 3: Implement `seedCrm`**

In `seed.ts`:
```ts
/** The demo's mock CRM (ADR 0003). Minji and Yuki stay unlinked so the walk shows "Link to CRM lead". */
export const DEMO_CRM_LEADS = [
	{ id: "demo-lead-minji", name: "Minji Park", phone: "+84901234567", outcome: "open", link: null },
	{ id: "demo-lead-yuki", name: "Yuki Tanaka", phone: null, outcome: "open", link: null },
	{ id: "demo-lead-alexei", name: "Alexei Volkov", phone: "+84907654321", outcome: "lost", reason: "Chose a Ciputra villa from another agency", link: "demo-ru-ciputra" },
	{ id: "demo-lead-thao", name: "Nguyễn Thị Thảo", phone: null, outcome: "open", link: "demo-vi-tayho" },
] as const;

export async function seedCrm(officeId: string): Promise<void> {
	const { store } = getRuntime();
	await store.setCrmConnection(officeId, "mock");
	const now = new Date();
	for (const lead of DEMO_CRM_LEADS) {
		await store.upsertMockCrmLead({
			id: lead.id, officeId, name: lead.name, phone: lead.phone, outcome: lead.outcome,
			outcomeAt: lead.outcome === "open" ? null : now.toISOString(),
			outcomeReason: "reason" in lead ? lead.reason : null,
		});
		if (!lead.link) continue;
		const thread = DEMO_THREADS.find((t) => t.guestId === lead.link);
		if (!thread) continue;
		const id = conversationId(officeId, thread.pipe, thread.guestId);
		await store.saveCrmLink(id, { kind: "mock", leadId: lead.id, leadName: lead.name, method: "manual", checkedAt: now });
		await store.saveCrmOutcomes([{ conversationId: id, outcome: lead.outcome, outcomeAt: lead.outcome === "open" ? null : now, outcomeReason: "reason" in lead ? lead.reason : null }], now);
	}
}
```
In `scripts/seed.ts`, call `await seedCrm(WALK_OFFICE_ID)` after `seedInbox`, and print `Mock CRM: 4 leads; Thảo linked (open), Alexei linked (lost, leaves the queue)`. Alexei's lost `outcomeAt` is the seed time, which is after his message 80 hours earlier, so he leaves Quiet and shows under Sent. Yuki stays in Quiet.

- [ ] **Step 4: Run the seed test and see it pass**

Same command. Expected: PASS.

- [ ] **Step 5: Update the docs**

- `docs/adr/0003-crm-adapter.md`: add a `## Decided when building (2026-09-27)` section with these points:
  - fetch on view with a 10-minute cache on the link
  - the platform admin sets the kind, and secrets stay in env
  - `listOutcomes(period)` became `outcomesFor(leadIds)`, because Home counts the cohort's linked leads
  - resolved leaves the queue until the guest writes again
  - closings count distinct leads
  - Attio is PR 2, built from docs
- `CONTEXT.md`, **Resolved**: "The CRM reports won or lost. Leaves the queue until the guest writes again; visible under Sent / All." **CRM link**: add "An agent's unlink is remembered; phone matching never relinks it."
- `ARCHITECTURE.md`: one paragraph after the office paragraph:
  - where `lib/crm/` sits and what it holds
  - the three tables
  - `refreshCrm`, and where it runs (the list in the background, Home with a 3 s cap)
  - the admin procedures
- `AGENTS.md`, seed paragraph: "The walk office gets the mock CRM with four leads; Thảo and Alexei are linked, Alexei lost."
- `CHANGELOG.md`: a dated `## 2026-09-2x (CRM seam)` entry with the user-visible changes.

- [ ] **Step 6: Whole-branch verification**

```bash
pnpm lint && pnpm format:check && pnpm type-check && pnpm test
pnpm --filter @repo/database push      # dev DB, additive
pnpm seed --reset
```
Then walk it on the dev server as `walk@nhip.local`:
1. Your turn holds Minji and Thảo. Quiet holds Yuki. Alexei is under Sent with "Lost".
2. Thảo's header reads "In CRM: Nguyễn Thị Thảo".
3. On Minji, "Link to CRM lead" → search "minji" → pick → the chip shows.
4. Home shows Closings 0 and Lost 1, with "From your CRM · 3 of 4 leads linked".
5. As `admin@nhip.local`, set the walk office's CRM to None → Home shows "Connect your CRM", and the thread chips disappear on the next load.

Paste the gate output and the walk into the PR.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/modules/inbox/lib/seed.ts apps/saas/modules/inbox/lib/seed.test.ts apps/saas/modules/inbox/scripts/seed.ts docs/adr/0003-crm-adapter.md CONTEXT.md ARCHITECTURE.md AGENTS.md CHANGELOG.md
git commit -m "feat(seed): the walk office's mock CRM, and docs for the CRM seam (ADR 0003)"
```

---

## Not in this plan

- **Attio (PR 2).** `crmAdapterFor` gains an `attio` case. `CrmKind` gains `attio` (enum + zod), `InboxConfig` gains `crm.attioApiKey` (env `ATTIO_API_KEY`, validated at startup), and the admin select gains the option. The adapter is built from Attio's REST docs with recorded fixtures.
- **Write-back** (creating a CRM lead when a guest first writes in) is second, behind the same seam (ADR 0003).
- **Audit findings 3** (per-connection pipe credentials) **and 8** (draft guardrails): these are separate work.
