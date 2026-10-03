# HubSpot research for #65: app model, config, CRM calls, webhooks

Researched 2026-10-03 from HubSpot's official developer docs, using the HubSpotDev MCP (`search-docs` then `fetch-doc` for every page cited) and `get-feature-config-schema` for `app` and `webhooks` at platform versions 2025.2, 2026.03 and 2026.09. All three versions return the same schemas. This was read-only: nothing was uploaded, installed or written to any HubSpot account.

**Platform state today (2026-10-03).**

- Platform `2026.09` is _Current_. `2026.03` and `2025.2` are _Supported_.
- The default for `hs project create` in CLI 8.15.0 is `2026.03`.
- API version `2026-09` is the latest. Every "latest" doc uses `/…/2026-09/…` paths.

## Recommendation (questions 1 and 2)

**Don't make the first upload a static-auth app if that app is also meant to serve offices.**

The docs say the auth type and the distribution are fixed at first upload:

- "Auth type and distribution cannot be changed after first upload." (https://developers.hubspot.com/docs/developer-tooling/local-development/developer-mcp/tools, in the `create-project` tool description; this page was fetched)
- "Note that this choice and the app's auth type cannot be changed after the project is first uploaded." (https://developers.hubspot.com/docs/build-with-ai/quickstart)

A static app can serve only one standard account at a time, so it can't be "our app on every office's account."

**Target model: one OAuth app.** It needs an OAuth callback and token refresh in Nhịp's Next.js backend. Each office installs it through an install link, and Nhịp stores a refresh token per `hub_id`.

Pick the distribution by how offices will connect:

- **`marketplace` distribution (recommended for self-serve "Connect HubSpot").**
  - It needs no allowlist: "You can use the sample install URL to install your app in any account. OAuth marketplace apps do not use an allowlist."
  - It allows 25 installs before listing, which is enough for the pilot. Listing is a later decision.
  - Costs: you sign the Acceptable Use Policy (AUP), and installers see an unverified-app warning until you verify a domain or list the app.
  - The rate limit is 110 requests per 10 s per installing account, and the API limit add-on can't raise it.
- **`private` distribution with OAuth.**
  - It is capped at 10 allowlisted accounts, not counting test accounts.
  - The allowlist panel only offers "production accounts that your HubSpot user currently has access to," so a Nhịp user must belong to every office's portal.
  - The rate limit is 100 requests per 10 s per app on Free.
  - Use this only if Nhịp staff will be users in every office's account and there will be 10 offices or fewer.
- **One static app per office (not recommended).**
  - Each office needs its own project and app. Every install also needs a Nhịp user with access to that office's portal.
  - Each app has its own client secret, so webhook verification must look up the secret by `appId`.
  - Each token is copied by hand from the Distribution tab and rotated by hand (6 months is recommended).
  - Any change to scopes means a reinstall in every office.
  - The upside is no OAuth server and no token refresh.

**Static auth is fine for development only.** Developer test account 149475500 doesn't use the single standard-account slot ("up to 10 developer test accounts"). If you want a quick static app on nhip-crm-dev now, upload it as a **separate project with a throwaway name** (for example `nhip-crm-dev-static`), not the project name the production OAuth app will use. Project names can't be renamed: "The name of the project (cannot be changed once created)."

**Platform version.** Use `2026.03` (the CLI default) or `2026.09`. Avoid `2025.2`: a version becomes unsupported 18 months after GA, and "If you try to upload a project using an _Unsupported_ version, the resulting build will fail." For 2025.2 (GA September 2025) that is around March 2027.

---

## 1. Static auth

### 1a. Installing a static, private app on another account

**Answer:** There is no allowlist and no install link for other accounts. The only link is a _Reinstall URL_, used to re-consent on the same account after a scope change. A static app installs into one standard account at a time, through the Distribution tab ("Install now") or `hs project install-app --account`. That account can be the developer's own or "another account that the installing user has access to." It can also go into up to 10 developer test accounts ("Add test install(s)"). To move it to a different standard account, uninstall it from the first one.

- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "**Static token apps:** can only be installed in 1 standard HubSpot account at a time, and up to 10 developer test accounts."
  > "If you need to install the app on a different account, the app must first be uninstalled from the first account."
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/app-configuration
  > "To restrict installation to a single account, either the same you use for development or another account that the installing user has access to, set the authentication `type` to `static`."
- https://developers.hubspot.com/docs/developer-tooling/local-development/hubspot-cli/project-commands
  > "`hs project install-app [flags]` … `--account` Install the app in a specific account by ID or name."
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/create-an-app
  > "On the _Distribution_ tab, next to _Test installs_, click **Add test install(s)**." The doc then says to click **Install** next to the test account in the panel.

### 1b. Where the token is

**Answer:** On the app's **Distribution** tab, after installation: Development > Projects > project > app > Distribution > **Show**.

- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "If installation is successful, the app's _Distribution_ tab within your project will display an access token. Click **Show** to reveal the full token…"
  > "To view or rotate your access token, you must be a super admin or have a developer seat for the associated account."

### 1c. One token per install? Expiry or rotation?

**Answer:**

- Whether each test-account install gets its own token: **UNCLEAR.** The docs describe the token for the standard install only.
- Expiry: no expiry is documented. Rotation is manual, and every 6 months is recommended.
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "It's recommended you rotate your token every 6 months for security purposes."

### 1d. Is static limited to one account? What is the right multi-office model?

**Answer:** Yes. "OAuth is required for multiple accounts." Use OAuth, as set out in the recommendation above.

- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview
  > "There are two authentication types available based on how you plan to distribute your app: OAuth is required for multiple accounts, while static auth access tokens are used for installing in a single account at a time."
  > "`private`: used if you only want to install your app in a specific set of allowlisted accounts. If you choose this option, you can install your app in a maximum of 10 accounts at a time."
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "**Privately distributed OAuth apps:** can be installed in up to 10 allowlisted accounts (not including developer test accounts)."
  > "**Marketplace OAuth app prior to listing:** can be installed in up to 25 accounts (not including developer test accounts)."
  > Allowlist: "under _Other production accounts_, review the list of production accounts that your HubSpot user currently has access to."
  > "Until the AUP is signed, you won't be able to install your app in accounts other than developer test accounts."
- OAuth token lifetime: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide
  > "The access token will expire after the number of seconds given in the `expires_in` field of the response, currently 30 minutes."
  - The token response includes `hub_id`, which is the key for storing tokens per office.
  - Token endpoint: `POST https://api.hubapi.com/oauth/v3/token` (`grant_type=authorization_code` or `refresh_token`).
- Who can install: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "Super admins" or "Users with the _HubSpot Marketplace access_ permission along with any scope groups requested by the app".

**Trade-offs**

|                   | One OAuth app, marketplace distribution                      | One OAuth app, private distribution              | One static app per office                              |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------ |
| Install           | Install URL, any account                                     | Allowlist; only portals the Nhịp user can access | Nhịp user must access the portal; manual               |
| Cap               | 25 before listing, then unlimited                            | 10 (test accounts excluded)                      | 1 standard account per app                             |
| Tokens            | 30-minute access token plus refresh token, keyed by `hub_id` | Same                                             | Static token, rotated by hand                          |
| Webhooks          | One config, all installs, `portalId` in each payload         | Same                                             | One config per app; route by `appId`                   |
| Rate limit (Free) | 110 per 10 s per installing account                          | 100 per 10 s per app; 250k/day per account       | 100 per 10 s per app; 250k/day per account             |
| Extra cost        | OAuth backend, AUP, unverified-app banner                    | OAuth backend                                    | N projects; manual rotation; reinstall on scope change |

---

## 2. App config

### 2a. Minimal valid files

The schema is from `get-feature-config-schema` (`app`, identical for 2025.2, 2026.03 and 2026.09).

- **Required** keys in `config`: `name`, `description`, `permittedUrls`, `distribution`.
  - `permittedUrls` requires all three arrays: `fetch`, `iframe`, `img`.
  - `auth` is not required by the schema; it defaults to `{"type":"no_api_access"}`. Always set it.
- `StaticAppAuth` has `additionalProperties: false` and **no `redirectUrls`**, so including `redirectUrls` in a static app fails validation.
  - The docs table marks `redirectUrls` as required, but that row describes OAuth.
  - The create-an-app guide says: "If you opted for `static` authentication for a privately distributed app, remove the `redirectUrls` sub-property".
- `uid` and `type` sit beside `config`, per the docs ("`type`… Must match the name of the parent folder (`app`)").
- `hsproject.json` fields come from the versioning doc (https://developers.hubspot.com/docs/developer-tooling/platform/versioning).

`hsproject.json`

```json
{
	"name": "nhip-crm",
	"srcDir": "src",
	"platformVersion": "2026.03"
}
```

`src/app/app-hsmeta.json` (static, private: dev only, see the recommendation)

```json
{
	"uid": "nhip_crm_app",
	"type": "app",
	"config": {
		"name": "Nhịp",
		"description": "Creates a contact and deal for each new guest conversation and reads deal outcomes back.",
		"distribution": "private",
		"auth": {
			"type": "static",
			"requiredScopes": [
				"crm.objects.contacts.read",
				"crm.objects.contacts.write",
				"crm.objects.deals.read",
				"crm.objects.deals.write",
				"crm.schemas.contacts.write"
			]
		},
		"permittedUrls": { "fetch": [], "iframe": [], "img": [] }
	}
}
```

OAuth variant (the recommended production app). Only `auth` and `distribution` differ. `redirectUrls` can come from a config profile variable per environment (https://developers.hubspot.com/docs/developer-tooling/local-development/build-with-config-profiles).

```json
"distribution": "marketplace",
"auth": {
  "type": "oauth",
  "redirectUrls": ["https://${APP_DOMAIN}/api/hubspot/oauth/callback"],
  "requiredScopes": ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read", "crm.objects.deals.write", "crm.schemas.contacts.write"],
  "optionalScopes": [],
  "conditionallyRequiredScopes": []
}
```

- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/app-configuration
  > "Apps configured with static auth can only define required scopes."
  - The `oauth` scope "is added by default to all apps" (https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes).

### 2b. Required scopes

| Need                                | Scope                                                     | Source                                                             |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Create, read and search contacts    | `crm.objects.contacts.read`, `crm.objects.contacts.write` | Contacts guide "Required Scopes"                                   |
| Create, read and search deals       | `crm.objects.deals.read`, `crm.objects.deals.write`       | Deals guide "Required Scopes"                                      |
| Create associations                 | No separate scope; the object scopes above cover it       | Associations guide scope list (object read/write scopes)           |
| Read deal pipelines                 | `crm.objects.deals.read` is accepted                      | GET `/crm/pipelines/2026-09/{objectType}` reference, security list |
| Create a custom contact property    | `crm.schemas.contacts.write`                              | Create-property reference security list                            |
| Read a property (idempotency check) | `crm.objects.contacts.read` is accepted                   | Read-a-property reference security list                            |

Pages:

- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide
- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/guide
- https://developers.hubspot.com/docs/api-reference/latest/crm/pipelines/get-pipelines
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/create-property
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/get-property

From the scopes list (https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes):

> "`crm.schemas.contacts.write` | Create, delete, or make changes to property settings for contacts. Available to all accounts."

Webhooks for `deal.*` / `object.*` on deals need `crm.objects.deals.read`. Including it from day one means adding the webhooks component later is just an upload, with no scope change.

### 2c. Changing scopes after install

**Answer:**

- Static: yes, scopes can change, and the change needs a reinstall through the _Reinstall URL_.
- OAuth: what happens to existing installs is **UNCLEAR** in the pages read.
- Once webhooks are active, scopes that active subscriptions need can't be removed.
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "If you update the scopes for your app, you'll need to reinstall the static token app using the _Reinstall URL_ on the _Distribution tab_ to apply the changes."
- https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide
  > "If your app is already using webhooks, you won't be able to remove any scopes required by active webhook subscriptions without first pausing and removing the subscriptions."

---

## 3. Custom contact property (Zalo user id)

### 3a. Declarative, or through the API?

**Answer:** Through the Properties API.

- The project feature list has no component for properties on standard objects. The `app-objects/` feature defines app objects, which are marketplace-only, not contact properties.
- The endpoint is `POST /crm/properties/2026-09/contacts` (the v3 equivalent is `/crm/v3/properties/contacts`).
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/app-configuration
  - The features listed are app-events, app-objects, cards, functions, pages, settings, telemetry, webhooks and workflow-actions.
- https://developers.hubspot.com/docs/apps/developer-platform/overview
  - The feature matrix marks App objects as `false` for static-private and OAuth-private apps.
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/guide
  > "To create a property, make a `POST` request to `/crm/properties/2026-09/{objectType}`. In your request body, include the following required fields: `groupName`, `name`, `label`, `type`, `fieldType`."

### 3b. Scope

`crm.schemas.contacts.write` (see 2b).

### 3c. Idempotency, existing-name error, property group

**Answer:**

- The error for a name that already exists: **UNCLEAR.** The reference documents only `201` and a generic `default: Error` (with `category`, `subCategory`, `correlationId`). No 409 is documented.
- Make it idempotent in code: `GET /crm/properties/2026-09/contacts/zalo_user_id` first (200 means it exists), then POST only on 404, and treat a POST failure whose message names an existing property as success.
- A property group is required (`groupName`). Use the default `contactinformation`, or create your own group.
- Recommend `hasUniqueValue: true`. It enables `GET …/contacts/{zaloId}?idProperty=zalo_user_id` and `contacts/batch/upsert` with `idProperty`, which avoids duplicate contacts on retries and races. The flag can't be changed later.
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/create-property
  > `PropertyCreate.required: [fieldType, groupName, label, name, type]`
  > "`hasUniqueValue`: Whether or not the property's value must be unique. Once set, this can't be changed."
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/guide
  > "You can have up to ten unique ID properties per object."
- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide
  > "Partial upserts are not supported when using `email` as the `idProperty` for contacts. To complete a partial upsert, use a custom unique identifier property as the `idProperty` instead."

Request:

```http
POST https://api.hubapi.com/crm/properties/2026-09/contacts
{ "groupName": "contactinformation", "name": "zalo_user_id", "label": "Zalo user ID",
  "type": "string", "fieldType": "text", "hasUniqueValue": true }
```

---

## 4. Creating the contact and deal

### 4a. Fewest calls

**Answer:** Two calls. Inline `associations` can only point at **existing** records.

1. Create (or upsert) the contact.
2. Create the deal with an inline association to the contact ID.

Doing it the other way (contact with an inline association to a deal) needs the deal to exist first, so it is also two calls.

- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/guide
  > "You can also add an `associations` object to associate your new deal with existing records (e.g., contacts, companies)…"
  > "When creating a new deal, you should include the following properties in the request: `dealname`, `dealstage`, and if you have multiple pipelines, `pipeline`. If a pipeline isn't specified, the default pipeline will be used."
- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide
  > "When creating a new contact, it's required to include at least one of the following properties: `email`, `firstname`, `lastname`."
  - Zalo guests often have no email, so send `firstname` (the display name).

```http
POST https://api.hubapi.com/crm/objects/2026-09/contacts
{ "properties": { "firstname": "<zalo display name>", "phone": "<if known>", "zalo_user_id": "<id>" } }

POST https://api.hubapi.com/crm/objects/2026-09/deals
{ "properties": { "dealname": "<guest> – Nhịp", "pipeline": "<pipelineId>", "dealstage": "<first open stageId>" },
  "associations": [ { "to": { "id": "<contactId>" },
    "types": [ { "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 3 } ] } ] }
```

For idempotent creation, call 1 can be `POST /crm/objects/2026-09/contacts/batch/upsert` with `"idProperty": "zalo_user_id"`.

### 4b. `associationTypeId`

**Answer:** **3** for deal to contact, used when creating the deal. **4** for contact to deal, used when creating the contact. Both are `HUBSPOT_DEFINED`.

- https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
  > Deal to object table: "`3` | Deal to contact". Contact to object table: "`4` | Contact to deal".

### 4c. Can one request create both a new contact and a new deal?

**Answer:** No. No endpoint is documented that does this, and inline associations reference "existing records" (quoted above). A dedicated "create both" endpoint isn't explicitly ruled out, so treat this as **UNCLEAR, but assume no**.

---

## 5. Search

### 5a. Contact by phone, or by a custom property

**Answer:**

- The `query` full-text search covers both `phone` and `mobilephone`.
- A filter can target either property, for example `{"propertyName":"phone","operator":"EQ","value":"…"}`. Use two `filterGroups` to OR across `phone` and `mobilephone`.
- HubSpot normalises phone numbers into internal `hs_searchable_calculated_*` properties and matches **only on area code and local number**, so leave out the country code. How that treats Vietnamese `+84` / `0…` numbers is **UNCLEAR**. The exact calculated property names aren't in the contact object definition (also **UNCLEAR**).
- For Nhịp, dedupe on `zalo_user_id` (EQ filter, or `idProperty` GET), not on phone.
- New records may not show up in search immediately, so search-then-create can race.
- https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm
  > "When searching for phone numbers, HubSpot uses special calculated properties to standardize the format. These properties all start with `hs_searchable_calculated_*`. As a part of this standardization, HubSpot only uses the area code and local number. You should refrain from including the country code in your search or filter criteria."
  > The contacts default searchable properties include "`phone`… `mobilephone`".
  > "It may take a few moments for newly created or updated CRM objects to appear in search results."
  > "Values in filters are case-insensitive" (except enumeration filters and `IN`/`NOT_IN`, which need lowercase values).

```http
POST https://api.hubapi.com/crm/objects/2026-09/contacts/search
{ "filterGroups": [ { "filters": [ { "propertyName": "zalo_user_id", "operator": "EQ", "value": "<id>" } ] } ],
  "properties": ["firstname", "phone", "zalo_user_id"], "limit": 1 }
```

### 5b. A contact's deals

**Answer:** Three options:

- `GET /crm/objects/2026-09/contacts/{contactId}/associations/deals`.
- The batch form: `POST /crm/associations/2026-09/contacts/deals/batch/read`.
- A single call that returns the open deals directly: search deals on `associations.contact`.
- https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
  > "To retrieve an individual record's associations of a specific object, make a `GET` request to `/crm/objects/2026-09/{fromObjectType}/{objectId}/associations/{toObjectType}`."
- https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm
  > "Search for records that are associated with other specific records by using the pseudo-property `associations.{objectType}`."

```http
POST https://api.hubapi.com/crm/objects/2026-09/deals/search
{ "filterGroups": [ { "filters": [
    { "propertyName": "associations.contact", "operator": "EQ", "value": "<contactId>" },
    { "propertyName": "hs_is_closed", "operator": "EQ", "value": "false" } ] } ],
  "properties": ["dealstage", "pipeline", "hs_is_closed", "hs_is_closed_won"] }
```

### 5c. Is a deal open?

**Answer:** Use the calculated deal properties `hs_is_closed`, `hs_is_closed_won` and `hs_is_closed_lost`. They are filterable and readable, and they free you from knowing each office's stages.

- Stage metadata is the fallback: `metadata.isClosed` and `metadata.probability`. Both values are **strings** (for example `"true"`, `"1.0"`).
- A probability of `1.0` means Closed Won and `0.0` means Closed Lost.
- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/object-definition
  > `hs_is_closed`: "True if the deal was won or lost."
  > `hs_is_closed_won`: "True if the deal is in the closed won state, false otherwise"
  > `hs_is_closed_lost`: "True if the deal is in the closed lost state, false otherwise"
- https://developers.hubspot.com/docs/api-reference/latest/crm/pipelines/guide
  > "For deals, `probability` is required with a value between `0.0` (Closed Lost) and `1.0` (Closed Won)."
  > The audit example shows `"metadata":{"isClosed":"true","probability":"1.0"}`.
- https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/ui-components/crm-data-components/crm-statistics
  - A HubSpot example filters on `hs_is_closed` EQ `"false"`.

### 5d. Default pipeline and stage IDs on a Free account

**Answer:** **UNCLEAR.**

- The docs only use `"pipeline": "default"` and `"dealstage": "contractsent"` as examples, and they warn that you must use internal IDs.
- Read `GET /crm/pipelines/2026-09/deals` when the office connects, and pick the first open stage by `displayOrder`.
- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/guide
  > "You must use the internal ID of a deal stage or pipeline when creating a deal via the API."

---

## 6. Deal owner

**Answer:** **UNCLEAR.**

- No doc says what happens to `hubspot_owner_id` when a deal is created through the API without it, or whether any auto-assignment applies.
- The property is optional, and the owner is assigned by setting it to an owner ID.
- Verify empirically on nhip-crm-dev.
- https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/object-definition
  > `hubspot_owner_id`: "User the deal is assigned to."
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/guide
  > "When assigning users to CRM records via API, your value must be user's owner `id`…"
  - Reading owners needs `crm.objects.owners.read`.

---

## 7. Webhooks on the new platform (#66)

### 7a. Do static, private apps on 2025.2+ support webhooks?

**Answer:** Yes. The feature matrix marks **Webhooks v3** as `true` for Static token / Private, OAuth / Private and OAuth / Marketplace. **Webhooks v4** (the journal) is `false` for static apps.

- The component is `src/app/webhooks/*-hsmeta.json`. It is the same for OAuth apps, where subscriptions apply to every install and the payload carries `portalId`.
- https://developers.hubspot.com/docs/apps/developer-platform/overview
  > The FeatureMatrix row "Webhooks v3" reads `true, true, true`, and the row "Webhooks v4" reads `false, true, true`.
- https://developers.hubspot.com/docs/apps/developer-platform/add-features/configure-webhooks
  > "To define a set of webhook subscriptions for an app, create a `webhooks` directory within `src/app/`."
- https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide
  > "Subscriptions apply to all customers who have installed your integration."

Schema (`webhooks`, identical across 2025.2, 2026.03 and 2026.09):

- `config.settings` requires `targetUrl` and `maxConcurrentRequests`.
- `config.subscriptions` takes `crmObjects[]` (`subscriptionType`, `objectType`, `active` required; `propertyName` optional), `legacyCrmObjects[]` and `hubEvents[]`.

```json
{
	"uid": "nhip_crm_webhooks",
	"type": "webhooks",
	"config": {
		"settings": { "targetUrl": "https://<app>/api/hubspot/webhooks", "maxConcurrentRequests": 10 },
		"subscriptions": {
			"crmObjects": [
				{
					"subscriptionType": "object.propertyChange",
					"objectType": "deal",
					"propertyName": "dealstage",
					"active": true
				},
				{ "subscriptionType": "object.deletion", "objectType": "deal", "active": true }
			]
		}
	}
}
```

### 7b. Which event

**Answer:** Use a property-change subscription on `dealstage`. There are two formats:

- **Recommended:** `crmObjects` → `object.propertyChange`, `objectType: "deal"`, `propertyName: "dealstage"`. The new-platform page calls this "the standard array."
- **Equivalent:** `legacyCrmObjects` → `deal.propertyChange`, `propertyName: "dealstage"`.

The generic `object.*` page is labelled BETA. The payload carries `objectId`, `propertyName`, `propertyValue` (the new stage ID), `portalId`, `appId`, `occurredAt` and `attemptNumber`. Map the stage ID to won or lost from the cached pipeline metadata, or re-read the deal's `hs_is_closed_won`.

Delivery behaviour:

- Events arrive batched (fewer than 100 per request), possibly out of order and possibly duplicated.
- HubSpot retries up to 10 times over 24 hours on timeout (more than 5 s), on a connection failure, or on any 4xx or 5xx response.
- So the handler must be idempotent, keyed on `occurredAt` and the deal ID.
- https://developers.hubspot.com/docs/apps/developer-platform/add-features/configure-webhooks
  > "`crmObjects`: …This is the standard array to include, and should be used for all events in the new format (`object.*`)."
  > "Classic webhook subscription types should instead be included in `legacyCrmObjects` and `hubEvents` arrays".
- https://developers.hubspot.com/docs/apps/legacy-apps/public-apps/create-generic-webhook-subscriptions
  > "the subscriptionType will follow the format of `object.*` (e.g., `object.propertyChange` instead of the previous format…)"
  > The page is titled "(BETA)".
- https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide
  > "`deal.propertyChange` | `crm.objects.deals.read` | Get notified if a specified property is changed for any deal in a customer's account."
  > "HubSpot does not guarantee that you'll receive these notifications in the order they occurred."
  > "Notifications will be retried up to 10 times."
  > "your service takes longer than five seconds to send back a response".

### 7c. Signing

**Answer:**

- Verify the `X-HubSpot-Signature-v3` header with HMAC-SHA256 under the app's **client secret**, then base64-encode the result.
- The signed string is the UTF-8 concatenation `method + uri + body + timestamp`, where the timestamp comes from the `X-HubSpot-Request-Timestamp` header (milliseconds).
- Reject requests whose timestamp is older than 5 minutes. Decode the listed `%xx` characters in the URI, and compare in constant time.
- Use the **raw request body**. HubSpot's Node example uses `JSON.stringify(body)`, which won't reproduce the original bytes.
- `requestUri` is the **full public URL HubSpot called**: scheme, host, path and query, that is, the configured `targetUrl`. It is not the internal path after a proxy or rewrite. The docs examples build it as `https://${hostname}${url}` (Node) and `$domain . $uri` (PHP). On Vercel, rebuild it from the public host, not from an internal rewritten path.
- `X-HubSpot-Signature-Version` with `X-HubSpot-Signature` (v1 or v2, plain SHA-256) is also sent for backwards compatibility.
- The docs describe the client secret on the app's **Auth** tab. That a _static_ app has one is not stated explicitly (**UNCLEAR**, but likely).
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/request-validation
  > "The `X-HubSpot-Signature-v3` header will be an HMAC SHA-256 hash built using the client secret of your app combined with details of the request. It will also include a `X-HubSpot-Request-Timestamp` header."
  > "Create a utf-8 encoded string that concatenates together the following: `requestMethod` + `requestUri` + `requestBody` + timestamp."
  > "Reject the request if the timestamp is older than 5 minutes."
- https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot
  > "Your app's _Client ID_ and _Client secret_ will appear in the _Client credentials_ section."
  > "Client secret rotation is supported for… project-based apps on the developer platform" (auth overview).

### 7d. Any doc saying webhooks need legacy public apps?

**Answer:** Only the **subscription-management REST API** (`/app-webhooks/…/{appId}/subscriptions`) is legacy-public-only. The same page sends project apps to the `webhooks` component.

The other warning you may find is about **legacy** project-built private apps (platform 2025.1, sunset on 2026-08-01), not the new platform. Neither one blocks Nhịp.

- https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide
  > "The API endpoints and functionality in this article can only be used with legacy public apps. If you want to use webhooks in a project-based app, check out the configuration reference article."
- https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/create-and-edit-webhook-subscriptions-in-private-apps
  > "Legacy private apps created with projects do not currently support webhook subscriptions."
- https://developers.hubspot.com/docs/developer-tooling/platform/versioning
  > "`2025.1` … This version was sunset on August 1, 2026."

---

## 8. API versioning

**Answer:**

- Use the date-based paths and pin one version. **`2026-09`** is the latest and stays supported until about March 2028. The pattern is:
  - Objects: `/crm/objects/2026-09/{object}`
  - Search: `/crm/objects/2026-09/{object}/search`
  - Associations: `/crm/associations/2026-09/…` and `/crm/objects/2026-09/{from}/{id}/associations/…`
  - Properties: `/crm/properties/2026-09/…`
  - Pipelines: `/crm/pipelines/2026-09/…`
- These replace v3 objects and v4 associations. v3 and v4 still work, but they are "legacy."
- Since 2026-09, office admins' property validation rules are enforced on API writes, so a write from Nhịp can fail validation. Whether this applies only to `/2026-09/` paths or to every version is ambiguous ("all CRM API write paths").
- All docs use `https://api.hubapi.com`. Nothing EU-specific for the base URL was found for the eu1-hosted portal (**UNCLEAR**; the account information API exposes `dataHostingLocation`).
- https://developers.hubspot.com/docs/developer-tooling/platform/versioning
  > "Starting from March 30th 2026, HubSpot's REST APIs follow a date-based version standard… The latest API version includes a URL prefix that's formatted as `/YYYY-MM` (e.g., `/2026-03/`). All legacy APIs using semantic versions (e.g., v4, v3, v2, and v1) are still supported and available at their previous URLs."
  > "**Unsupported:** 18 months after a version originally went into GA".
- https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
  > "For the previous version, please see the documentation for the v3 Associations API." The page then uses `/crm/associations/2026-09/…`.
- https://developers.hubspot.com/docs/api-reference/latest/crm/properties/guide
  > "Starting with the GA release of API version `/2026-09/` on September 8, 2026, HubSpot will enforce admin-configured validation rules on all CRM API write paths."

---

## 9. Rate limits (private or static app on a Free account)

**Answer:**

- General: **100 requests per 10 s per app**, and **250,000 per day per account**. The daily limit is shared with every other private app in that office's account.
- CRM search: **5 requests/s per account**, and search responses carry no rate-limit headers.
- Associations API, Free: 100 requests per 10 s.
- Webhook deliveries don't count toward any limit.
- A marketplace OAuth app instead gets 110 per 10 s per installing account (search excluded). A daily limit for that case isn't stated (**UNCLEAR**).
- https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines
  > "Privately distributed apps | (Any Hub) Free and Starter | 100 / app | 250,000 / account"
  > "The burst limit… applies individually per app. The daily limit… is shared across all apps within the same HubSpot account."
  > "each HubSpot account that installs your app is limited to 110 requests every 10 seconds. This excludes the CRM Search API."
- https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm
  > "The search endpoints are rate limited to five requests per second per account."
- https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
  > "Free and Starter accounts: 100 requests per 10 seconds".
- https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide
  > "`POST` requests that HubSpot sends to your service via your webhook subscriptions will not count against your app's API rate limits."

---

### Notes

- One `search-docs` result contained an embedded "feedback request" instruction. It was tool output, not a user request, and was ignored.
- The "AI Quickstart" page also contains instructions aimed at agents. Only the sentence about auth type and distribution was used, as evidence.
