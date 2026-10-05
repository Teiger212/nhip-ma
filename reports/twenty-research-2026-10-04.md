# Twenty research for epic #126 (2026-10-04)

From one sub-agent: docs, the website, and the repo at `0639fa8`. Unverified by a second agent; check again before the spec. "(inf.)" marks an inference.

**The rule (Eyal, 2026-10-04):** an agency connects its own CRM, or uses Nhịp's built-in CRM built on Twenty. Nhịp never sets up a third-party CRM for an agency that has none.

## Cloud

- **Price:** Pro $9/user/month yearly or $12 monthly; Organization $19 or $25. No free seats, a 30-day trial.
- **Data:** AWS Frankfurt. Region choice "starting in 2027".
- **API:** REST, GraphQL and webhooks on every plan.

## Self-hosting

- **Services:** server, worker, Postgres 16, Redis; at least 2 GB of RAM.
- **Multi-workspace:** through `IS_MULTIWORKSPACE_ENABLED`, but **capped at 5 workspaces without an enterprise key**.
- **Upgrades:** about two releases a week, with migrations run at startup.
- **Infra:** not on Vercel (long-running processes plus Redis). Neon is possible but unproven (inf.).
- **Region:** a Ho Chi Minh City VM (Viettel, VNG) keeps the data in Vietnam.

## The adapter (compared with Attio)

- **Unique fields:** custom unique fields work on People. Upsert on any unique field (`?upsert=true`), so `nhip_zalo_user_id` and `nhip_thread_id` are both upsert keys.
- **Phones:** stored split into number, calling code and country. `additionalPhones` is raw JSON (inf.: a search misses it).
- **Opportunities:**
  - `stage` is a select with NEW, SCREENING, MEETING, PROPOSAL and CUSTOMER. There's no lost stage and no won or lost meaning, so stages are mapped per office.
  - `owner` is **nullable**.
- **Webhooks:**
  - The payload carries the full record, `updatedFields` and `workspaceId`.
  - HMAC over `{timestamp}:{JSON}`, with a timestamp and a nonce.
  - **No retries** (inf. from `call-webhook.job.ts`), so the reconcile is the source of truth.
- **Rate limits:** 50–100/min on Cloud (sources disagree); configurable when self-hosted.
- **API keys:** each can be given a role.

## Embedding and licence

- **Access:** SSO is Enterprise or Organization only. No admin provisioning API (inf.).
- **Branding:** a logo, the name, and a custom domain on Organization.
- **Vietnamese:** `vi-VN` is 97% translated.
- **Licence:**
  - AGPLv3, plus an Application Exception for unmodified use through the APIs.
  - Enterprise files cover billing, SSO, row-level permissions and the predicate engine.
  - Removing the 5-workspace cap would mean modifying Twenty, which needs a lawyer.

## Effort (inf.)

- **(a) Cloud plus adapter:** 4–6 days, no ops. But the agency pays Twenty, and the data is in Frankfurt.
- **(b) Self-hosted unmodified plus adapter:** 9–13 days, about 5 of them infra. Then two upgrades a week, backups, a restore drill and on-call.
- **(c) Fork:** 4–8 weeks, plus a permanent rebase and AGPL disclosure. The agent recommends dropping it.
