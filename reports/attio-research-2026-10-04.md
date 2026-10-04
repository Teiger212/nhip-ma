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

## Round-1 research, later on 2026-10-04

Five sub-agents. The live probe's full results are in `reports/attio-probe-2026-10-04.md`.

- **The probe in Nhip Dev:**
  - **Webhook:** creating one works on the free plan. It can be filtered to deals' `stage` through `id.object_id` and `id.attribute_id`. The secret is returned on create only, and a duplicate gives 409.
  - **Unique attributes:** a custom unique attribute works on **deals** but is **refused on people** (Attio's design). So people are found by search, then created, and the Zalo id is a plain text attribute.
  - **Deal upsert:** an upsert by `nhip_thread_id` works, but sending `stage` overwrites the agency's stage (Won went back to Lead). So Nhịp sends the stage only on create.
  - **Owner:** a deal without one gives 400.
  - **Phones:** the phone filter needs `+84…`, and `$ends_with` on the national tail works.
  - **Open deals:** one query (`associated_people` plus `$not` per closed stage id) returns a person's open deals. Stage filters take only `$eq`.
  - **Search:** `POST /v2/objects/records/search` works (beta, needs `request_as:{type:"workspace"}`, fuzzy matching, doesn't search custom text).
  - **Safe to repeat:** an attribute POST that gets 409 → GET it by slug → unarchive it → check its type.
- **Lists vs. stage:**
  - Attio's default deals board, and its advice, use `deals.stage`. Lists are for other processes.
  - Store the office's config as `{target, status attribute id, won ids[], lost ids[]}` so a list can be added later.
  - Nhip Dev's "Won 🎉" stage has `celebration_enabled: false`, so that flag is no signal.
- **Notes vs. columns:**
  - Custom attributes are on all plans with no documented cap. They can show on kanban cards and in a record-page sidebar section.
  - There's no URL attribute type, and a text URL isn't confirmed clickable.
  - Notes are markdown, `PATCH`-able, show on the timeline, and their links are clickable. They need `note:read-write`, which **the dev token lacks**.
  - Comments and tasks are plaintext and unfit.
- **The App SDK:**
  - It can add record widgets and tabs, and it's included on the free plan.
  - It's private-installable through an invite link without review, but the installer sees a "not reviewed" warning.
  - The widget fetches through Attio-sandboxed server functions. The app's token can't replace Nhịp's backend key.
  - OAuth tokens are workspace-level with no refresh token, so the adapter is unchanged by OAuth.
  - Showing guest messages in Attio is a PDPL cross-border question.
- **Cookbooks:**
  - **No messaging integration creates deals and reads won/lost back.**
  - The closest is ackinax/ackinax-website `worker/attio`: a person, then reuse an open deal through `associated_people` with a stage check in code, otherwise create one with a fixed owner email, then a note. It fails closed on unknown stages.
  - attio/aircall-app writes notes with a lock.
  - attio-whatsapp-crm-os keeps a note id per conversation.
  - Whatsable puts a "Live Chat Link" attribute back to its own app.
  - runmorph maps won by `celebration_enabled`.

## Grill round 1: decided (Eyal, 2026-10-04, all as recommended)

1. **HubSpot's decisions carry over** unless Attio forces a change.
2. **The API key** is entered by the platform admin, with scopes:
   - object config and records read/write;
   - members read;
   - webhooks read/write;
   - **notes read/write**.
   The app and OAuth come at the second agency on Attio, or when this one asks for a panel.
3. **Thread details: a hybrid.**
   - Columns: `nhip_thread_id` (unique) plus the filterable fields (pipe, area, rent or buy, budget).
   - One markdown note per deal with the clickable link and the summary. Nhịp stores the note id and PATCHes that note, never creates a second one.
4. **Setup at connect, safe to repeat,** plus a "Re-check setup" action. Attributes: 409 → GET → unarchive → check the type. A lost webhook secret means the webhook is deleted and recreated.
5. **Won and lost:** the admin ticks the stages, stored by id, on `deals.stage` only. The config shape can take a list later. An unmapped stage counts as open.
6. **Owner:**
   - the thread's agent, matched to an Attio member by email;
   - otherwise the office's default owner;
   - if the default owner has gone, stop and show "Not in CRM yet: owner missing", and #64 retries.
7. **Person:**
   - first the Attio id stored on the Nhịp contact;
   - then `nhip_zalo_user_id`, then the phone as `+…`;
   - create only if neither matches, under a Nhịp lock;
   - several matches mean ambiguous, and the person is linked by hand through record search.
8. **Deal:**
   - first the stored id, then `nhip_thread_id`, then the person's open deals (HubSpot's rule: none → create, one → reuse, several → ambiguous);
   - a second thread from a known person reuses the open deal;
   - the stage is sent on create only.
9. **Testing:**
   - recorded calls, E2E on the mock, a tunnel rehearsal, a recorded webhook;
   - plus "a Won deal stays Won when Nhịp re-saves it" and "two concurrent leads from one person make one person".

**Phones (Eyal):** Nhịp serves high-end clients such as expats, so every international number must work. Tracked in #125.

## Docs pass, after round 1 (REST and SDK, 2026-10-04)

- **The SDK verdict: keep REST plus the API key** (round 1 unchanged).
  - Attio's walkthrough ("Acme Lead Checker") writes over REST, and its docs call API keys "the simplest option for internal apps".
  - Workflow blocks would hand matching to the agency's workflow. That costs about 3 credits per lead (inferred; the free plan has 250 a month), stops silently if the workflow is disabled, and can't hold rules 7 and 8.
  - An app gets no native record events (only `connection-added` and `connection-removed`).
  - Updates reach private installs at once.
  - For later, at the second Attio agency: a "Nhịp lead created" trigger plus a deal widget, with REST still the only writer.
- **Notes:** a PATCH replaces the whole note, so human edits to the Nhịp note are overwritten. Listing notes is throttled to 10/s, so read the note by its stored id.
- **Webhooks:**
  - The secret is returned on create only, but it's viewable in the developer settings for webhooks made with an API key (inferred). The `target_url` can be updated in place.
  - The body carries `webhook_id`; check it and `workspace_id` after verifying the signature.
  - The payload is an `events[]` array, so loop over it.
  - `record.deleted` and `record.merged` have no `attribute_id`, so they need their own subscriptions filtered on `id.object_id`.
  - "Send test event" ignores filters.
- **Reconcile can be incremental:** the stage filter `stage: {active_from: {$gte: <last run>}}`. SQL is Enterprise only. The "write record attribute values" endpoints (2026-08-17) don't fire webhooks.
- **Merges produce a NEW record.** Both originals become unreadable. Each merge fires two `record.merged` events with the new `id.record_id` and a `duplicate_record_id`. A 404 `merge_in_progress` means retry. A unique `nhip_thread_id` probably keeps only one value after a merge (inferred), so Nhịp must repoint the threads first. People merge the same way.
- **Deletes are permanent**, and there's no archived event.
- **Members are never deleted;** a departed member's `access_level` becomes `suspended`. `owner` can't get a usable default, so leave `owner` out of update bodies.
- **The only person upsert key is `email_addresses`.** There's no sync best-practice guide, and `record.updated` still carries no values.

## Grill round 2: decided (Eyal, 2026-10-04, all as recommended)

Round 1 stands, with these corrections:
- Decision 6: "the default owner has gone" means their `access_level` is `suspended`.
- Decision 4: a lost webhook secret can probably be recovered from the developer settings.

1. **Phones for go-live:**
   - A WhatsApp `wa_id` is always `+` plus the digits, never tried as Vietnamese first.
   - Input with no country code that isn't valid Vietnamese gives "no phone", never a guess.
   - The CRM-side re-check uses the same rule.
   - The rest of #125 comes after the first client.
2. **Column types:** select for pipe and rent-or-buy; text for area, timeframe, household, budget, language and the thread link.
3. **Webhook:** one per workspace, with these subscriptions:
   - deals `record.updated`, filtered to stage;
   - deals `record.deleted` and `record.merged`;
   - people `record.merged`.

   The URL carries a Nhịp connection key that picks the secret. Verify the body HMAC, then check `webhook_id` and `workspace_id`.
4. **Handling:**
   - loop over `events[]`;
   - deduplicate on `Idempotency-Key` for 7 days;
   - re-read the deal;
   - answer 200 within 5 s and do the work in the background;
   - the hourly reconcile is incremental through `stage.active_from >= last run`, which also gives the outcome's time.
5. **Deleted and merged deals:**
   - **Deleted:** "Not in CRM", no auto-recreate, and a manager re-links.
   - **Merged:** repoint every thread on either original to the new id first. `merge_in_progress` means retry.
   - **People:** drop the stored id and re-find the person by Zalo id, then phone.
   - **Reconcile:** on `not_found`, re-query by `nhip_thread_id` before marking the deal gone.
6. **Owner:** set on create only, and never in update bodies.
7. **The Nhịp note:** its title says it's maintained by Nhịp and that edits are overwritten ("Nhịp · Zalo thread (auto-updated)"). Agents add their own notes.

## Grill round 3: decided (Eyal, 2026-10-04, as recommended)

1. **Agents without an Attio seat** (the free plan has 3 seats):
   - The deal falls back to the default owner without a warning.
   - Connections shows "N of M agents have an Attio seat".
   - The deal carries a `nhip_agent` text column with the Nhịp agent who handled it.
2. **A stage added later:** it counts as open, and Connections shows a notice ("N new stages in Attio aren't mapped to won or lost") whenever the webhook or the reconcile meets an unmapped stage. "Re-check setup" re-reads the stages.

**Actions:**
- Eyal adds `note:read-write` to the Nhip Dev token; the client's key needs it too.
- Attio is named as a processor in the A05 dossier (goes into #99 with the tickets).

**Noted for later:**
- #125: the international phone normalizer.
- #126: an epic for a built-in CRM forked from Twenty.

## Grill round 4: the CRM rule (Eyal, 2026-10-04)

1. **An agency connects its own CRM, or uses Nhịp's built-in CRM** (#126, Twenty-based). Nhịp never sets up a third-party CRM for an agency that has none, so Attio is only for clients already on Attio. HubSpot stays the demo.
2. **The first client's CRM is unknown.** Eyal asks the client (#99).
   - Meanwhile: the Attio ADR amendment and spec get written now. Build tickets go under "After first client" until the client confirms Attio. Code days go to #112, #113, #98, #85 and #84.
   - With no CRM, the client goes live without a CRM connection (supported: `crm/sync.ts` skips an office with none), and #126 follows. Its leading option is Twenty unmodified, self-hosted in Vietnam (`reports/twenty-research-2026-10-04.md`).
