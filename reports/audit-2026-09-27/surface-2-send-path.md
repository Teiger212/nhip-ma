Read `reports/audit-2026-09-27/brief.md` first and follow it. Surface: **the send path and inbound pipes**. Use id prefix `S`.

Files to start from: `apps/saas/modules/inbox/lib/inbox.ts` (approve, inbound, drafts orchestration), `packages/database/inbox/store.ts` (beginAnswer, completeAnswer, failAnswer, markAnswerUnknown, upsertInbound), `apps/saas/modules/inbox/lib/pipes/**` (vendors, webhook, adapters), `apps/saas/app/webhooks/**`, `apps/saas/app/dev/inbound/route.ts`, `apps/saas/app/api/conversations/**`, `apps/saas/modules/inbox/lib/config.ts`, `runtime.ts`, `background.ts`, `apps/saas/instrumentation.ts`, `packages/database/prisma/schema.prisma` (inbox models).

Attack ideas (go beyond them):

1. Make one guest message produce two vendor sends (ADR 0011): concurrent approves, retry after `failed`, `unknown` handling, crash between vendor success and `completeAnswer`, a guest message landing mid-send, the OA-echo path.
2. Approve a reply to the wrong message or with text the operator did not review: stale `inboundId`, swapped thread id vs inbound id, cross-thread inbound ids.
3. Forge or replay inbound webhooks: signature checks (WhatsApp HMAC, Zalo mac + timestamp window), verify-token GET handshake, body parsing differences between what is verified and what is parsed, oversized bodies, batch entries mixing offices.
4. File a message under another office, or create threads without a connected pipe; spoof `pipeExternalId`; guest-controlled names/text reaching places they are trusted (display, operator note, draft prompt framing — note known finding 8).
5. `/dev/inbound` and any dev/test route: is it reachable in production? What guards it?
6. Send-mode confusion: can anything send live when `SEND_MODE` is not exactly `live`, or send from the wrong credentials? Vendor error bodies leaking to clients.
7. Resource abuse: unbounded background work per request (translations/drafts), polling amplification, no rate limits on public endpoints.
