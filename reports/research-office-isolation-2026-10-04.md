# Per-office data isolation: research (2026-10-04)

For #92. Four research agents ran in parallel: Neon, Prisma/Vercel mechanics, SaaS industry patterns, and this codebase. Quotes are from the sources linked; lines marked _inference_ are the agents' or my reasoning. Decided meanwhile: **1 agency = 1 office = 1 tenant** for now (CONTEXT.md, ADR 0008).

## Where Nhịp is today

- **One shared Postgres database (Neon)**, Microsoft's simplest multitenant pattern. Isolation is app-only:
  - the session gate resolves exactly one office;
  - store reads filter by `viewer.officeId`;
  - webhooks take the office from the pipe or the portal.

  There is no row-level security.

- **One Prisma client** (`packages/database/prisma/client.ts:21-37`, a `db` Proxy over `globalThis.prisma`), shared by Better Auth (`packages/auth/auth.ts:104`) and the inbox store (`runtime.ts:40-47`).
- **Gaps:**
  - The viewer is optional on `getConversation`, `listConversations`, `approveAndSend` and `regenerateDraft`.
  - About 12 store methods take only a row id, never an office: `completeAnswer`, `failAnswer`, `markAnswerUnknown`, `setTranslation`, `recordTranslationFailure`, `translationFailures`, `setDraft`, `setOneShot`, `guestInboundText`, `releaseCrmLink`, `completeCrmLink`, `saveCrmOutcome`.
- **The tenant key isn't on every office-owned row.** Message, Answer, Translation, TranslationFailure, Qualification, Draft and Paperwork reach the office only through Conversation. No primary key leads with `officeId` except CrmConnection's. `Message.seq` and `Answer.seq` are global sequences.

## The options

| Option                                 | Isolation         | Prisma 7 + Neon + Vercel effort    | Biggest risk                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pooled, hardened** (today + fixes)   | App-enforced      | Small                              | A future direct `db.*` call skips the checks                                                                                                                                                                                                                                                                                                                                                                 |
| **+ Row-level security**               | Database-enforced | Medium                             | **Neon role trap.** Neon's owner role and every Console/CLI/API role join `neon_superuser`, which has `BYPASSRLS` ([Neon roles](https://neon.com/docs/manage/roles)), so the app needs a non-owner role created in SQL. Other risks: tenant context through the pooler (only `set_config(..., true)` is safe; [Neon pooling](https://neon.com/docs/connect/connection-pooling)), and auth tables outside RLS |
| **Database (Neon project) per office** | Strongest         | Large                              | Splitting the global client (auth) from the per-office client; a wrong client silently hits the wrong database                                                                                                                                                                                                                                                                                               |
| **Schema per office**                  | Medium            | Medium-high                        | adapter-pg ignores `?schema=`, and raw queries ignore the schema ([prisma#28128](https://github.com/prisma/orm/issues/28128)); the pooler breaks `search_path`                                                                                                                                                                                                                                               |
| **Sharded (Citus)**                    | Same as today     | Very high                          | Prisma has no support; Migrate breaks ([prisma#13433](https://github.com/prisma/orm/issues/13433)); not on Neon (_inference_)                                                                                                                                                                                                                                                                                |
| **Deployment per agency** (ADR 0018)   | Strongest         | Small in code, large in operations | Each vendor app (Zalo, Meta, HubSpot) has one webhook URL, so each deployment needs its own apps                                                                                                                                                                                                                                                                                                             |

## What the sources say

**Neon: one project per tenant.**

- "We recommend setting up one project per user, rather than… a branch per customer… inactive projects remain practically free" ([Neon multitenancy](https://neon.com/docs/guides/multitenancy)).
- "Each project is fully isolated, with separate data and credentials" ([object model](https://neon.com/docs/concepts/the-object-model)).
- **Restore:** a single tenant can be restored only with a project per tenant: "All databases on a branch are restored" ([branch restore](https://neon.com/docs/introduction/branch-restore)).
- **Limits:** the Scale plan allows 1,000 projects, "can be increased on request" ([plans](https://neon.com/docs/introduction/plans)). There's no per-project fee; an idle tenant pays for storage and restore history only.
- **Migrations:** no fleet tooling. Neon suggests a catalog database that tracks each tenant's region and schema version.
- **Cold start:** waking a sleeping compute takes "a few hundred milliseconds" ([latency](https://neon.com/docs/connect/connection-latency)), so webhooks should accept fast.
- **Region:** Singapore exists; Vietnam doesn't. A project's region can't change.

**Prisma 7.9.1 (the repo's version).**

- **RLS:** the official RLS example is "an example only… not intended to be used in production" ([client extensions](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security)). Migrate doesn't manage policies; they'd be hand-written SQL migrations ([prisma#12735](https://github.com/prisma/orm/issues/12735)).
- **Database per tenant:** "keep a list of Prisma Clients… it will use a bunch of memory for each instance" ([discussion](https://github.com/prisma/orm/discussions/20920#discussioncomment-6883484)). Connections add up: the pool size (`pg` default 10) × instances × tenants ([pool docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)).
- **Migrations:** `migrate deploy` has no per-database flag, so we'd loop over tenants swapping the URL. It needs the **direct** host, since the Schema Engine "does not support connection pooling with PgBouncer". A failed tenant needs `resolve` and a re-deploy.
- **Vercel:** use Fluid's `attachDatabasePool` ([Prisma on Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel)).

**Industry patterns.**

- **AWS vocabulary:**
  - **silo:** "tenants are provided dedicated resources";
  - **pool:** shared resources;
  - **bridge:** split by service ([SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html)).

  About 20 siloed tenants is "manageable"; "a thousand tenants… impact operational efficiency" ([silo isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/silo-isolation.html)).

- **Tiered isolation:** a dedicated tier at "a substantially higher price point". Vendors "will not publish this as an option", and silo tenants "run the same version of the product" ([tier-based isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/tier-based-isolation.html)).
- **Moving a tenant needs its key on every row.**
  - Microsoft: "The tenant identifier is the leading element in the primary key of all sharded tables" ([tenancy patterns](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns)).
  - Shopify: "attach a shop_id to all shop-owned tables"; "A shop move must be entirely online" ([shard balancing](https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale)).
- **Notion's regrets** ([sharding Postgres at Notion](https://www.notion.com/blog/sharding-postgres-at-notion)):
  - "Shard earlier": the key "was not yet populated… backfilling this column would have exacerbated the load".
  - "Introduce a combined primary key instead of a separate partition key."
- **Rolling migrations:** "ensure that your application version is backwards-compatible with at least one previous schema version"; "Track the schema version… for each tenant" ([Azure storage approaches](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data)). Roll out in deployment rings, canary first.
- **Residency is per market, not per tenant:** "deploy some customers to specific regions" ([deployment stamps](https://learn.microsoft.com/en-us/azure/architecture/patterns/deployment-stamp)). For Nhịp that means a Singapore stamp now and Peru later.
- **When not to:**
  - Notion: premature sharding "can constrain the product model before it has been well-defined".
  - Citus: with "5 or 50 tenants" a database each is maintainable; shard on tenant id only at "thousands" ([Citus](https://www.citusdata.com/blog/2016/10/03/designing-your-saas-database-for-high-scalability/)).

## Recommendation

**Now (MVP, few offices): stay pooled and harden.** All small and additive.

1. **Fail closed in the store.** Make the viewer required on every office read, and pass `officeId` into the about 12 id-only methods' `where` clauses. Every option below starts with this.
2. **Put `officeId` on every office-owned table now** (Message, Answer, Translation, TranslationFailure, Qualification, Draft, Paperwork), backfilled from Conversation while the tables are small. This is Notion's "shard earlier" lesson at near-zero cost. Leading primary keys with `officeId` is a bigger refactor; decide it when the first silo is real.
3. **Make schema changes expand/contract** (additive first, removals a release later), so a later per-office rollout can tolerate version skew. Write it down as a rule in AGENTS.md.

**About 10 offices, or the first agency that demands it: a dedicated database as a quiet premium tier.**

- **One Neon project per siloed office** in the same region, on the same app version and deployment.
- **A catalog** in the global database: office → database URL, region and schema version.
- **Two Prisma clients:** global (auth, organizations, members, pipes, webhook log, CRM routing) and per office, routed at the three points that already resolve the office (session gate, `officeForPipe`, CRM portal → office).
- **A `migrate deploy` loop** over direct URLs, with ring rollout.

**100+ offices: Neon project per office for all, or one regional stamp per market,** with a tool that moves an office online. Citus isn't available here (Prisma and Neon).

**Row-level security** is optional defence-in-depth on top of hardening. If chosen: a non-owner app role created in SQL (not through Neon's console, because of `neon_superuser` / `BYPASSRLS`), transaction-local `set_config`, auth tables outside RLS, and policies in SQL migrations. Hold it until there's a concrete reason: medium effort, and its Prisma example isn't production-grade.

## Open questions

- **Does Vietnam's PDPL require in-country hosting** for some data? No primary source was checked; a question for the go-live lawyer (memory: vietnam-data-protection). Neon has no Vietnam region.
- **Memory per Prisma 7 client** and **the measured RLS overhead**: not documented.
- **Multi-office agencies (later):** the agency is the likely isolation and billing unit, with offices nested inside (see #92's comment).
