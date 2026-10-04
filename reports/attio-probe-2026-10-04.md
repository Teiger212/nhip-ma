# Attio probe, Nhip Dev (2026-10-04)

These are live API calls against the free workspace "Nhip Dev", made with a workspace token (scopes: `object_configuration:read-write`, `record_permission:read-write`, `user_management:read`, `webhook:read-write`). They settle the "Still unknown" list in [attio-research-2026-10-04.md](./attio-research-2026-10-04.md).

IDs used:
- deals object `29a6dde0-6812-4e2b-950e-97681df28bc8`
- `stage` attribute `285e3bbc-5566-4b5b-aac3-8cb77ceae0f8`
- the one member `b0fd043e-71fe-4ad1-9cc4-4b9c3da919cd`
- stages: Lead `12958083…`, In Progress `c407c147…`, Won 🎉 `42ff4ec0…`, Lost `50d99fdb…`

## Results

| Fact | Verdict | Evidence |
|---|---|---|
| A webhook can be created on the free plan | **PROVEN YES** | `POST /v2/webhooks` returned **200**, `status: "active"`, and a 64-char `secret`. The secret comes back on create only; `GET /v2/webhooks/{id}` has no `secret` key. `DELETE` returned 200 and the list is now `[]`. |
| A duplicate webhook subscription is rejected | **PROVEN YES** | The identical POST returned **409** `uniqueness_conflict`. |
| A webhook count limit exists | **UNCLEAR** | No limit in the docs or the pricing page; the only one documented is delivery at 25 req/s per target URL. One webhook can't prove a limit. |
| One webhook can filter to deals' `stage` via `id.object_id` + `id.attribute_id` | **PROVEN YES** (accepted) | `record.updated` with `$and:[{field:"id.object_id",operator:"equals",value:<deals>},{field:"id.attribute_id",operator:"equals",value:<stage>}]` returned 200 and was echoed back unchanged. Delivery wasn't observed (the target was example.com). |
| A custom-attribute limit exists on the free plan | **UNCLEAR** (none found) | Creating attributes worked (200). Neither the pricing page nor the help pages give a custom-attribute count limit; the help page says "available on all plans". Two creates can't prove the absence of one. |
| A unique custom attribute can be created on **people** | **PROVEN NO** | `POST /v2/objects/people/attributes` with `is_unique:true` returned **400** `validation_type` "Cannot set attribute as unique." Creating it non-unique, then `PATCH is_unique:true`, gave the same 400. This is product policy, not plan: [Attio help](https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes) allows custom unique attributes on custom objects and on Deals/Users/Workspaces, but **not on People or Companies**. |
| A unique custom attribute can be created on **deals** | **PROVEN YES** | `nhip_probe_thread`, `is_unique:true`, returned **200**. |
| Re-POSTing the same slug is rejected | **PROVEN YES** | **409** `slug_conflict` ("An attribute with the same API slug already exists on this Object"). This holds after archiving too: an archived slug still blocks re-creation. |
| Attributes can be archived and unarchived | **PROVEN YES** | `PATCH {data:{is_archived:true}}` returned 200 with `is_archived:true`; `PATCH is_archived:false` brings it back. `GET /attributes/{slug}` returns archived attributes. |
| A deal can be created without `owner` | **PROVEN NO** | POST with `name` + `stage` returned **400** `missing_value` "Required value for attribute with ID 8353c6b3… (owner) was not provided." |
| A deal can be created with `owner` | **PROVEN YES** | `owner:[{referenced_actor_type:"workspace-member",referenced_actor_id:<member>}]` returned **200**. |
| Phone `$eq` matches national format `0901234567` | **PROVEN NO** | Stored `+84901234567` normalised to `phone_number:"+84901234567"`, `country_code:"VN"`. Query results: `"+84901234567"` → 1; `"0901234567"` → **0**; `"84901234567"` → 1 (missing "+" tolerated); `{phone_number:{$eq:"0901234567"}}` → 0; `{$contains:"901234567"}` → 1; `{$ends_with:"901234567"}` → 1. Negative controls: `"+84909999999"` → 0, `$contains "909999999"` → 0. `original_phone_number` isn't filterable (400 `invalid_filter_field`). |
| People can be found by querying a custom (non-unique) Zalo id | **PROVEN YES** | `POST /v2/objects/people/records/query` with `{filter:{nhip_probe_zalo:"zalo-probe-001"}}` returned 200 and 1 result; the explicit `{$eq:…}` form also returned 1. Negative control `"zalo-probe-999"` → 0. This is the search half of search-then-create. |
| People upsert keyed on a custom Zalo id | **PROVEN NO** | People can't have a unique custom attribute (see above). `PUT /v2/objects/people/records?matching_attribute=nhip_probe_zalo` on the non-unique attribute returned **400** `matching_attribute_definition_not_unique`. |
| Deal upsert keyed on a unique thread id | **PROVEN YES** | The same `PUT /v2/objects/deals/records?matching_attribute=nhip_probe_thread` twice returned 200 and the **same `record_id`** (`7c6ad2f8…`). A plain POST with the same thread id returned **400** `uniqueness_conflict`, and the error names the conflicting record id. |
| One query combines a person's deals with a stage filter | **PROVEN YES** | `POST /v2/objects/deals/records/query` with `$and:[{associated_people:{target_object:"people",target_record_id:<p>}},{stage:"Lead"}]` → 1 (`7c6ad2f8…`; a second Lead deal with no person link was excluded). With `stage:"Won 🎉"` → 0. "Open" by stage id works as `$and:[<person>, {$not:<won $eq>}, {$not:<lost $eq>}]`: 1 while the deal was Lead, **0 after PATCHing it to Won**. Status filters accept `$eq` only: `$in` gives 400 `invalid_filter_operator`, and `$not:{$or:[…]}` gives 400 `unknown_filter_attribute_slug: $or`. `$or` of two `$eq` filters works. |
| `POST /v2/objects/records/search` exists on this plan | **PROVEN YES** | **200** (the endpoint is beta). `request_as` is **required**: leaving it out returned 400; `{"type":"workspace"}` works. For "Nhip Probe" on `["people","deals"]` it returned the person plus both probe deals. Each item has `{id:{workspace_id,object_id,record_id}, object_slug, record_text, record_image}`, and people also carry `email_addresses` and `phone_numbers`. Fuzzy matching: `"0901234567"` and `"901234"` both found the person; the Zalo-id text attribute value was **not** searchable (0 results). |

## Surprises that change the design

1. **No Zalo-id upsert on people.** Attio forbids custom unique attributes on People and Companies. For people, `nhip_zalo_user_id` has to be **non-unique**, with Nhịp doing search-then-create (query `{nhip_zalo_user_id:"<id>"}`, then POST). Under concurrency that can create duplicates, so Nhịp needs its own lock or a mapping table. The "safe to repeat" direction for people in the research report needs revising. Deals are unaffected.
2. **Upsert overwrites the stage.** After the deal was moved to Won, a re-upsert that included `stage:"Lead"` set it back to **Lead**. A re-upsert without `stage` kept Won and kept `associated_people`. But a *new* thread upserted without `stage` fails with 400 `missing_value`, because stage is required on create. So Nhịp can't send one blind upsert body: it has to query first (or catch the error), sending stage only on create and never on update.
3. **Archived slugs are permanent.** Re-POSTing an archived slug returns 409 `slug_conflict`. "Safe to repeat" means: POST, and on 409 `GET /attributes/{slug}`; if it's archived, `PATCH is_archived:false`. Check `type` and `is_unique` match too, since an office could have made a same-slug attribute by hand.
4. **Normalise phones to E.164 before querying.** Attio normalises stored numbers, but `$eq` doesn't localise input: `0901234567` misses, while `84901234567` matches. `$ends_with` on the 9-digit national tail is a usable fallback.
5. **Owner is mandatory, and Nhịp has to choose one.** There's no default owner.
6. **"Open stage" can't use `$in`.** Use `$not` per closed stage id, which proves out for won/lost mapped by id.

## Cleanup state

- Webhook `05a083ac…`: **deleted**. `GET /v2/webhooks` returns `[]`.
- Deals `8ee4b874…` (A) and `7c6ad2f8…` (B): **deleted**. The deals query returns 0. The no-owner deal and deal C were never created (both 400).
- Persons `2c145b02…` ("Nhip Probe") and `9b1c2133…` (the Zalo-query check, created after briefly unarchiving `nhip_probe_zalo`): **deleted**. The people query returns 0.
- Attributes `people.nhip_probe_zalo` (`ba0b1983…`, non-unique) and `deals.nhip_probe_thread` (`84cd2146…`, unique): **archived**. They can't be deleted, so both slugs stay taken in Nhip Dev. The production slugs (`nhip_zalo_user_id`, `nhip_thread_id`) are untouched.
- Unchanged: the 10 existing companies, the stages (Lead / In Progress / Won 🎉 / Lost) and the one member.
- The webhook secret was never written to disk; it's redacted in the scratch call log.
