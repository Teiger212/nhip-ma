# Attio research for epic #101 (2026-10-04)

Facts gathered for the Attio grill. Sources: Attio's docs (linked), read-only API calls against the free dev workspace **Nhip Dev** (`ATTIO_TEST_TOKEN` in the main `.env.local`), and Nhịp's HubSpot code and plan (`reports/crm-seam-plan-2026-10-03.md`, ADR 0003, #59, `apps/saas/modules/inbox/lib/crm/`).

## The dev workspace (verified 2026-10-04)

- **The token:** active, workspace-level (`GET /v2/self`), workspace id `e47a2d6c…`, one member (`b0fd043e…`, the admin who made the key).
- **Scopes:** `object_configuration:read-write`, `record_permission:read-write`, `user_management:read`, `webhook:read-write`.
- **Objects:** people, deals (enabled), companies. That's all three free-plan object slots.
- **Deal stages:** Lead, In Progress, Won 🎉, Lost. Each has a stable id separate from its title.
- **Webhooks:** `GET /v2/webhooks` answers 200. Creating a subscription on the free plan is not proven yet.
- **Plan:** API keys are "Available on all plans" ([help](https://attio.com/help/apps/other-apps/generating-an-api-key)).

## What carries over from the HubSpot decisions

- **Carries unchanged:** Q1, Q2 (the demo stays on staging), Q3, Q4 (webhook plus hourly reconcile; registering the webhook is Attio-specific), Q5, Q6, Q7, Q8, Q11, Q16, Q17, Q19, Q22, Q23.
- **Not applicable:** Q2c, Q9, Q10, Q21.
- **Attio-specific:**
  - **Q12:** HubSpot writes the thread details into the deal `description`. Attio deals have no description, so they need custom attributes or a note.
  - **Q13:** "reuse an open deal" uses HubSpot's `hs_is_closed`. Attio has no closed flag, only stage titles and ids.
  - **Q14:** the Zalo id needs a custom unique text attribute on people.
  - **Q15:** "deals start unassigned" fails, because a deal's `owner` is required.
  - **Q18:** API key now, OAuth later, plus a per-webhook secret to store.
  - **Q20:** reverses "Attio dropped as the default".
- **ADR 0003's 2026-10-03 amendment:** "HubSpot is the demo CRM" and the credentials bullet are Attio-specific. Write-back first, `outcomeObservedAt`, no fetch on view, managers link, "matching never guesses" and neutral badges all carry.

### What the HubSpot adapter does today (the shape to mirror)

- **Contact:**
  - `firstname`, `phone` (E.164);
  - `zalo_user_id`: a custom unique string, created on demand.
- **Deal:**
  - `dealname`;
  - the first pipeline, and its first open stage;
  - `description` lines: thread URL, pipe, language, area, rent or buy, budget, timeframe, household;
  - an inline association to the contact;
  - no owner.
- **Reuse:**
  - search contacts by national digits and the Zalo id, re-checked as E.164;
  - then their open deals;
  - `decideLead` (rules.ts): none means create, one means reuse, several means ambiguous and the claim is released.
- **Outcome:** batch-read `hs_is_closed`, `hs_is_closed_won`, `closedate` and `closed_lost_reason`.
- **Webhook:**
  - v3 HMAC with the app secret over method, URL, body and timestamp, at most 5 minutes old;
  - `dealstage` changes grouped by `portalId`;
  - `crmOfficesOnAccount` maps the portal to offices; the account is learned lazily and cleared when the token changes.
- **Code that's specific to each CRM kind:**
  - the Prisma `enum CrmKind {mock, hubspot}`;
  - `KINDS_WITH_TOKEN` and `KINDS_WITH_ACCOUNT`;
  - the `crmAdapterFor` and `crmWebhookFor` switches. `crmWebhookFor` reads secrets from deployment config, and Attio's secret is per webhook, so it doesn't fit.

## Attio API facts

1. **Finding people by phone:** query `POST /v2/objects/people/records/query` with `{"filter":{"phone_numbers":"+84…"}}` (`$eq`, `$contains`, `$starts_with`, `$ends_with`). Writes must be E.164 with "+" ([doc](https://docs.attio.com/rest-api/attribute-types/attribute-types-phone-number.md)). `phone_numbers` is multi-valued and **not unique**, so it's search then create; `email_addresses` is the only built-in unique attribute.
2. **Custom attributes:** `POST /v2/objects/{people|deals}/attributes` with `{title, api_slug, type, is_required, is_unique, is_multiselect, config}` ([doc](https://docs.attio.com/rest-api/endpoint-reference/attributes/create-an-attribute.md)).
   - A unique text attribute for the Zalo id allows an upsert: `PUT /v2/objects/people/records?matching_attribute=<slug>`.
   - Select attributes can't be unique, and writing an unknown option errors instead of creating it ([doc](https://docs.attio.com/rest-api/attribute-types/attribute-types-select.md)), so text is simpler for pipe and language.
   - `is_unique` applies to new data only.
3. **Deals:**
   - required: `name`, `stage` (status), `owner` (actor reference); optional: `value`, `associated_people` (inverse of `associated_deals`), `associated_company`;
   - `owner` is a workspace member, given by `referenced_actor_id` or email ([doc](https://docs.attio.com/rest-api/attribute-types/attribute-types-actor-reference.md));
   - create with `POST /v2/objects/deals/records`; deals have no unique attribute by default.
4. **Members:** `GET /v2/workspace_members`, with scope `user_management:read`.
5. **Webhooks:**
   - **Create:** `POST /v2/webhooks` with `{data:{target_url (https), subscriptions:[{event_type, filter}]}}`; workspace-level tokens only.
   - **Filters:** `$and`/`$or` of `{field, operator: equals|not_equals, value}` over the payload, so `id.object_id` and `id.attribute_id` can be targeted.
   - **Secret:** returned only on creation. A duplicate subscription returns 409.
   - **The event:** `record.updated`. Its payload carries `{workspace_id, object_id, record_id, attribute_id}` and the actor, but **no new value**, so Nhịp re-reads the record.
   - **Signature:** `Attio-Signature`, hex HMAC-SHA256 of the **body only**. There's **no timestamp**, so no replay window; deduplicate on the `Idempotency-Key` header.
   - **Retries:** up to 10 over about 3 days, with a 5 s timeout ([guide](https://docs.attio.com/rest-api/guides/webhooks.md)).
   - **The account:** `workspace_id`.
6. **Rate limits:** 100 reads/s and 25 writes/s. A 429's `Retry-After` is an HTTP **date**, not seconds. Query endpoints also have score-based limits over a 10 s window ([doc](https://docs.attio.com/rest-api/guides/rate-limiting.md)).
7. **Won and lost:** no meaning beyond the stage's title and id. Statuses carry only `title`, `is_archived`, `target_time_in_status` and `celebration_enabled`, and workspaces can rename them.

## Still unknown (prove in the spec's first step, in Nhip Dev)

- Whether the free plan accepts creating a webhook subscription, and its limits on webhooks and custom attributes.
- Whether a deal can be created without `owner`.
- Whether the phone `$eq` filter matches national-format input.
- Whether one query can combine a person's `associated_deals` with a stage filter.
- Whether one webhook can be limited to deals' `stage` through `id.object_id` and `id.attribute_id`.
- The manual-link search (`POST /v2/objects/records/search`).

## Direction from Eyal (2026-10-04): use custom attributes

Attio is customisable, so Nhịp creates the attributes it needs when the office connects, safe to repeat:

- **`nhip_zalo_user_id`** on people: unique text, for find-or-create keyed on the Zalo id.
- **`nhip_thread_id`** on deals: unique text. One thread = one deal is then enforced by Attio itself: find-or-create keyed on the thread id, so retries never make a second deal.
- **The thread details as columns,** not a text blob: `nhip_thread_url`, `nhip_pipe`, `nhip_language`, plus the extracted fields (area, rent or buy, budget, timeframe, household).

**Won and lost stay on the stage.** That's what the agency moves; a custom flag would have no writer. Nhịp maps which stage is won and which is lost per office, by stage id. Whether the free plan includes Attio automations is unchecked and not needed.

**To prove first:** the free plan's custom-attribute limit, if any.
