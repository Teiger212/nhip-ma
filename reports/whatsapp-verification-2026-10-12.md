# WhatsApp Cloud API claims: verification against Meta's own pages (2026-10-12)

Verifier: a fresh, skeptical agent. Sources are Meta pages only: developers.facebook.com, both `/docs/whatsapp/...` and `/documentation/business-messaging/whatsapp/...`, plus business.whatsapp.com, whatsapp.com/legal and the Meta Business Help Center. The "Updated" date is the one the page itself shows.

**Source caveat.** Meta serves two versions of some pages, and they disagree:

- The rendered HTML page is current. Checked with Jina and a real Chromium (Playwright).
- The `.md` endpoint is stale. WebFetch also receives the stale version.

The pricing page shows the difference most clearly:

- The rendered page is "Updated: Sep 30, 2026" and reflects the October 1, 2026 changes.
- `/documentation/business-messaging/whatsapp/pricing.md` still says "All non-template messages are free" and gives a 72-hour FEP.
- business.whatsapp.com/products/platform-pricing still says "we do not charge for service messages".
- The AI-providers page (Updated Sep 1, 2026) still says non-template messages in an open window are not charged. That is the same stale wording.

This report uses the rendered developer pages wherever the sources conflict.

## Verdicts

| #   | Claim (short)                                                                                            | Verdict                                              |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Test setup auto-creates a test number and test WABA; no verification, payment method or review needed    | PARTLY                                               |
| 2   | Up to 5 test recipients, each verified by code                                                           | UNVERIFIABLE (Meta docs)                             |
| 3   | Dashboard token lasts 24h; System User token can be non-expiring                                         | PARTLY                                               |
| 4   | Webhook: HTTPS with a valid certificate, GET hub.* handshake, `messages` field, X-Hub-Signature-256 HMAC | VERIFIED                                             |
| 5   | Production number must receive SMS/voice; numbers on WhatsApp must be deleted unless Coexistence         | VERIFIED                                             |
| 6   | Coexistence only via Embedded Signup by a Tech Provider or Solution Partner; `smb_message_echoes`        | VERIFIED (Vietnam: not explicitly listed, see below) |
| 7   | Display names reviewed by Meta, must relate to the business                                              | PARTLY                                               |
| 8   | Unverified: 250/24h; replies uncapped; verification raises it; 2 phone numbers                           | PARTLY                                               |
| 9   | 24h window; per-message pricing; service charged above 1,000/month from 2026-10-01                       | VERIFIED (claim TRUE), with a correction on utility  |
| 10  | Payment method needed only for paid templates                                                            | WRONG                                                |
| 11  | Tech Provider = business verification + App Review (advanced access) + access verification               | PARTLY                                               |
| 12  | Embedded Signup = FL4B `config_id` + JS SDK -> code -> business integration system user token            | VERIFIED                                             |
| 13  | Real estate is permitted                                                                                 | VERIFIED                                             |

## Claim by claim

### 1. Testing without verification, payment or review: PARTLY

What holds:

- Test assets are created automatically. [About the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform) (Updated Aug 4, 2026): "When you get started with Cloud API, a test WhatsApp account, test Messaging account, and test business phone number are automatically created for you. Test accounts and test phone numbers ... have relaxed messaging limits and don't require a payment method on file in order to send template messages."
- No review is needed for your own use. [App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review) (Updated Jun 16, 2026): "Business apps are automatically approved for Standard Access ... if you are using the API for yourself as a Direct Developer, you do not need Advanced access or app review."

What needs correcting:

- You no longer pick an app of "type Business". [Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started) (Updated Jun 16, 2026) says to select the **"Connect with customers through WhatsApp"** use case, then "Select an existing business portfolio or create a new one".
- A business portfolio is therefore required, but it doesn't have to be verified.
- Prerequisites are a "Facebook account or managed Meta account" plus developer registration.

### 2. Up to 5 test recipients: UNVERIFIABLE on Meta's current pages

- The current Get Started page, both the rendered and `.md` versions, only says "Add a **To** phone number". It gives no count.
- About-the-platform, Phone numbers and Messaging limits don't state a cap either.
- A Wayback copy of Meta's page could not be read: the content is JS-only and Jina was blocked.
- Only a third party (WATI) and a search summarizer paraphrase "up to 5". The figure is probably right, but it isn't proven here.

### 3. Token lifetimes: PARTLY

- **Dashboard token.** Current Meta docs give no 24h figure:
  - [Get Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started): the temporary token "expires quickly and is not suitable for development purposes".
  - [Access tokens](https://developers.facebook.com/docs/whatsapp/access-tokens) (Updated Sep 19, 2026): user tokens "expire quickly, so you have to keep generating a new one every few hours".
  - Meta's own [2022 blog](https://developers.facebook.com/blog/post/2022/12/05/auth-tokens) says "the token expires in less than 24 hours". So 24h is an upper bound, not the actual lifetime.
- **System user token.** Verified. Generation lets you "choose a token expiration preference", and Get Started calls it a "permanent token".
- **What Nhịp actually stores:**
  - Nhịp stores a **business integration system user token**, not a system user token.
  - [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business) (rendered): it "Defaults to never expire for the common offline server-to-server communication". There is also a `set_token_expires_in_60_days` option.
  - Meta's quick template for Embedded Signup is literally named "WhatsApp Embedded Signup Configuration **With 60 Expiration Token**" ([ES implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)).
  - Decision needed: build a custom configuration with a non-expiring token, or build a refresh or re-onboard path.
  - In either case the agency can revoke the token at any time: "Business Settings > Integrations > Connected apps and removing your app". Nhịp needs a "disconnected" state.

### 4. Webhooks: VERIFIED

Source: [Create a webhook endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint).

- **Certificate:** "must have a valid TLS or SSL digital security certificate ... Self-signed certificates are not supported."
- **Verification GET:** `GET <CALLBACK_URL>?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...`. Your endpoint must "respond with HTTP status 200 and the hub.challenge value".
- **Signature:** `X-Hub-Signature-256: sha256=<...>`, which is an "HMAC-SHA256 hash, calculated using the post body payload and your app secret as the secret key".
- **`messages` field:** [Webhooks overview](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks) (Updated Jun 26, 2026): "The messages webhook describes messages sent from a WhatsApp user to a business and the status of messages sent by a business."

Also from these pages:

- Retries run for up to 7 days and can produce duplicates, so deduplicate on message id.
- Payloads can be up to 3 MB.
- POSTs are batched, with up to 1000 updates each.
- "Make sure your app is in **Live** mode; some webhooks will not be sent if your app is in **Dev** mode."
- Partners also need advanced access through App Review before customers can grant webhook permissions.
- Each onboarded customer needs `POST /<WABA_ID>/subscribed_apps` (see 12).

### 5. Production number eligibility: VERIFIED

Source: [Business phone numbers](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers) (Updated May 21, 2026).

- Eligible numbers must "be able to receive voice calls or SMS", be "owned by you" and "have a country and area code (short codes are not supported)".
- "Numbers already in use with WhatsApp cannot be registered unless they are deleted first."
- Registered numbers "cannot be used with WhatsApp Messenger".
- The Coexistence exception is confirmed in 6.
- Registration also needs a 6-digit two-step verification PIN, set via the `register` call.

### 6. Coexistence: VERIFIED. Vietnam is not explicitly confirmed, but no country restriction is listed.

Source: [Onboard WhatsApp Business app users](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users) (Updated Jun 26, 2026).

**Requirements on Meta's page:**

- "You must already be a Solution Partner or Tech Provider."
- "You must use Embedded Signup with session logging."
- "The business customer must use WhatsApp Business app version 2.24.17 or higher."

**Echoes:** "Each time a business sends a message with one of these apps, it triggers an smb_message_echoes webhook."

**Countries:** the current page lists no country restrictions at all. My grep for country or region terms found nothing. Third-party blogs say an older list of excluded countries has since been lifted. Vietnam is not named anywhere, so treat Vietnam as "not restricted on Meta's page" rather than "confirmed".

**Conditions:**

- Throughput is fixed at 20 mps.
- After onboarding you have **24 hours to sync** contacts and history, "otherwise they must be offboarded and complete the flow again". Each sync step can run only once.
- History covers up to 180 days. Media IDs are included only for the last 14 days.
- Group chats are not synced.
- Disappearing messages, view-once, live location and broadcast lists are disabled for 1:1 chats.
- Companion devices are unlinked at onboarding and can be re-linked. Unsupported companions produce no webhooks.
- The number can't be deregistered from Cloud API while it's in both apps.
- Pricing: "messages sent by the business via the WhatsApp Business app will continue to be free, but messages sent via Cloud API will be subject to Cloud API pricing."

**Product implication for Nhịp:** with Coexistence, an agent can reply straight from the phone app, which bypasses Nhịp's approval step. Echoes let Nhịp show those replies, but it can't gate them.

### 7. Display names: PARTLY

- **Guidelines:** [Display name guidelines](https://www.facebook.com/business/help/757569725593362) say "A display name must have a clear relationship with your business's legal name" and must be consistent with external branding.
- **Timing of the full review.** [Display names](https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names) (Updated Jun 16, 2026): "When you reach a higher messaging limit, your business phone number's display name automatically undergoes verification".
  - The name shows in chat threads and the chat list only after approval. Until then it appears on the profile.
- **Inline rejection.** Embedded Signup can reject a name inline, for example "Your verified name violates WhatsApp guidelines".
- **Changes:** at most 10 per 30 days. After each approval you must re-register the number within 14 days.

### 8. Limits for unverified businesses: PARTLY

Source: [Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits) (Updated May 21, 2026).

- **What the limit counts.** It is "the maximum number of unique WhatsApp user phone numbers your business can deliver messages to, outside of a customer service window, within a moving 24-hour period".
  - So the unit is unique users, not conversations.
  - Replies inside the window are not counted, which confirms that part of the claim.
- **Portfolio level.** The limit is set at the business portfolio level and "shared by all business phone numbers within a portfolio".
  - With Embedded Signup, each agency has its own portfolio, so each agency has its own limit.
- **Starting point and scaling.** "Newly created business portfolios have a messaging limit of 250".
  - Verification is one of three paths to 2,000. The others are partner-led verification, or 2,000 delivered template messages in 30 days.
  - The increase is not automatic: "Meta analyzes your message quality", and the outcome is then approved or denied.
- **Phone numbers.** [Phone numbers](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers): "New business portfolios are initially capped at two registered business phone numbers."
  - The cap rises to 20 on verification **or** on reaching the 2,000 limit. It is tied to "new", not strictly "unverified".

### 9. Window and pricing: VERIFIED. The October 2026 claim is TRUE.

Source: [Pricing](https://developers.facebook.com/docs/whatsapp/pricing), rendered, Updated Sep 30, 2026. Confirmed in Chromium.

**Window.** Non-template messages "can only be sent in an open 24-hour customer service window, which opens and resets with each user message". Outside the window, only templates can be sent. [Service messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages) confirms the 24h timer.

**Per-message pricing.** "Effective July 1, 2025 – Meta charges on a per-message basis", per delivered message, by category and recipient market. Messages from users to businesses are free.

**Service messages above 1,000 per month: TRUE.**

- "As Meta resumes charging for service messages, Meta provides every business phone number with a free tier of 1,000 service messages per month ... Meta charges as of the 1,001st service message per month".
- The free tier does not roll over and resets at 12am in the Messaging account timezone.
- The change took effect "12am by Messaging account timezone on October 1, 2026".

**What is free now.** Only "two instances":

- the free entry point (FEP) window, which comes from Click-to-WhatsApp ads or a Page CTA and "may remain open for up to 7 days" (not 72h);
- the first 1,000 service messages per number per month.

**Utility in the window is no longer free.** Under "Prior updates > Effective October 1, 2026" the page lists: "Utility messages sent in response to users (thus in an open customer service window), which became free as of July 1, 2025 ... pricing type ... will change from `free_customer_service` to `regular`."

**Vietnam rates.** Vietnam (+84) is in "Rest of Asia Pacific". USD rate card effective Oct 1, 2026:

| Category                     | USD per message |
| ---------------------------- | --------------- |
| Marketing                    | 0.0842          |
| Utility                      | 0.0113          |
| Authentication               | 0.0113          |
| Service, after the free tier | 0.0113          |

The market is set by the **guest's** country code, so a foreign guest is billed at their own country's rate.

**New category.** Meta Business Agent, introduced July 1, 2026, is a separate category charged at about $2 per million tokens. Nhịp's replies are written by people or a third-party AI, so they are "Service", not this category.

### 10. Payment method only for paid templates: WRONG

- **Since Oct 1, 2026, beyond the free tier.** Pricing: "If businesses do not have a payment method for their Messaging account(s), Meta will deliver service messages within the free tier but not deliver them after the free tier has been used."
- **Before any messaging, for Tech Provider customers.** [ES overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview) (Updated Jul 24, 2026): "If you are not a Solution Partner, or not partnered with one, the customer must first attach a payment method to their Messaging account before they can begin messaging."
- **Only test assets are exempt.** See claim 1.
- **Avoiding card collection.** Customers skip it only with a Solution Partner's credit line, either directly or through a Multi-Partner Solution.

### 11. Becoming a Tech Provider: PARTLY

Source: [Become a Tech Provider](https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers). The current steps:

1. **Meta app.** It needs the WhatsApp use case and a connected business portfolio. Go to App Dashboard > Use cases > Customize > **Tech Provider onboarding**.
2. **Business verification.** "To become a tech provider you need to verify your business with Meta".
   - You provide the legal name, address, phone, email and website. The website must load over HTTPS.
   - If Meta can't match a record, you upload official documents: articles of incorporation, a business registration or licence, a government tax document, or a business bank statement ([accepted documents](https://www.facebook.com/business/help/159334372093366)).
   - A decision "may take up to 14 business days" ([verify your business](https://www.facebook.com/business/help/2058515294227817)).
   - **No country requirement was found.** Documents in Vietnamese, Hebrew and English (among others) are accepted.
   - A **registered legal entity is required**, so Nhịp needs one.
3. **App Review** for **Advanced access** to `whatsapp_business_messaging` and `whatsapp_business_management`.
   - Basic settings needed: "app icon, privacy policy, and app category".
   - Two videos are required: one of a message sent and received in WhatsApp, and one of template creation.
   - **The videos can show the API Setup cURL script and WhatsApp Manager instead of your own app**, so you don't need to build Nhịp's UI first.
   - You need one written explanation plus one separate screencast per permission. Screenshots are not accepted.
   - "The average turnaround time for App Review is about 24 hours" ([App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)).
   - The Tech Provider page does not list a data-deletion instructions URL. [Basic settings](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings) has the field but does not mark it required for Live mode. Privacy policy, Terms of Service URL, icon, category and purpose are required for Live mode.
4. **Access verification.** [Access Verification](https://developers.facebook.com/docs/development/release/access-verification) (Updated Dec 12, 2024) is required for `whatsapp_business_management` when other businesses use the app.
   - A business admin describes how the business uses other businesses' data.
   - "a decision will be made within approximately 5 days".
   - The Tech Provider page doesn't list this step. The ES overview ties the 200-customer cap to it (see below).

### 12. Embedded Signup mechanics: VERIFIED

**Frontend.**

- [ES overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview): "Embedded Signup uses the Facebook Login for Business product and our JavaScript SDK."
- [Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation): `FB.login(cb, { config_id, response_type: 'code', override_default_response_type: true, ... })`.
- The code has a "time-to-live of 30 seconds".
- The page that launches the flow must be on an HTTPS domain listed in Allowed domains.

**Server.** [Onboarding customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider) (Updated Aug 5, 2026) gives three server-to-server steps per office:

1. `GET /oauth/access_token?client_id&client_secret&code` returns the business token.
2. `POST /<WABA_ID>/subscribed_apps`.
3. `POST /<PHONE_NUMBER_ID>/register` with a 6-digit PIN.

The Implementation page also requires a subscription to `account_update`. Token lifetime is covered under 3.

### 13. Real estate: VERIFIED (not prohibited)

Source: [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy).

- Section 4 lists the prohibited goods and services: firearms, alcohol and tobacco, drugs, medical products, endangered species, live animals, hazardous goods, currencies, body parts, fraudulent models, real-money gambling, adult content, dating, MLM, and payday loans and debt collection.
- Real estate and property rental are not on the list.

Relevant obligations from the same policy:

- **Opt-in.** "You may only contact people on WhatsApp if ... you have received opt-in permission". This matters for any outbound template.
- **Human escalation.** "You may use automation when responding during the 24-hour window, but must also have available prompt, clear, and direct escalation paths ... In-Chat Human Agent transfer". Nhịp's human approval meets this.
- **Non-discrimination.** Organizations "must not wrongfully discriminate or suggest a preference for or against people because of ... national origin, citizenship, ... family status ...". This is directly relevant to rental listings and reply drafts.

## Important items the claims missed

1. **Onboarding cap for Tech Providers.** [ES overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview): "By default, you can onboard up to 10 new business customers in a rolling 7-day window."
   - After business verification, App Review and access verification, the cap is "automatically increased to 200".
   - Beyond 200 a week, you apply to become a Meta Business Partner.
2. **Embedded Signup v2 and v3 are deprecated on October 15, 2026**, three days from now. Build on **v4** only.
3. **The account model is changing.** The WABA splits into a WhatsApp account (WAAC: phone numbers and identity) and a Messaging account (templates, billing, webhooks).
   - "existing `waba_id` values are unchanged and now denote Messaging account IDs".
   - Standard Embedded Signup creates a **per-partner Messaging account**. Billing is set per Messaging account.
   - Coexistence onboarding converts the existing WABA instead.
4. **Prerequisites for Embedded Signup and Hosted Embedded Signup.**
   - You must _already_ be a Tech Provider or Solution Partner.
   - You must be subscribed to `account_update`.
   - Domains must be HTTPS, so localhost won't work. Use a tunnel or a staging domain.
   - [Hosted ES](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/hosted-es) is a "zero integration" link with no JavaScript. It has the same Tech Provider prerequisite and can't be customized.
5. **Possible pilot path before full review. This is inferred, not verified end to end.**
   - [Access Verification](https://developers.facebook.com/docs/development/release/access-verification): if the person who granted the permission "does have a role on the app, the endpoint accepts the call", with no Tech Provider check.
   - [ES overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview): "while your app is in development mode, these permissions will appear in Embedded Signup's authorization screen to anyone who has an admin, developer, or tester role on your app".
   - So design-partner agency admins could be given **Tester** roles and onboard while the app is in Dev mode.
   - Risk: the webhooks page says "some webhooks will not be sent if your app is in Dev mode". Once the app is switched to Live, only permissions with advanced access appear in the flow.
   - Test this before promising it.
   - **What this means in practice.** Take a real agency whose admin has no role on Nhịp's app. Read together, the docs imply that all three gates (business verification, App Review and access verification) must be complete before onboarding works:
     - In Live mode, Embedded Signup shows only advanced-access permissions.
     - Without access verification, `whatsapp_business_management` calls on that agency's assets fail with error 100. That includes `subscribed_apps` and template management.
   - Meta's pages don't say which stage the default 10-per-week bucket applies to.
   - The tester path is unproven on two counts:
     - The Implementation page's prerequisite: "You must already be a Solution Partner or Tech Provider".
     - The Dev-mode webhook gap.
   - Quick check for Eyal: in the App Dashboard, see whether Tech Provider onboarding or the Embedded Signup Builder will issue a usable `config_id` before verification.
6. **Sandbox for testing Embedded Signup.** App Dashboard > WhatsApp > Quickstart > "Claim sandbox account".
   - It is valid for 30 days.
   - It returns a real token code, but its number "cannot be used to send or receive messages".
7. **Terms of Service 4.7 on AI providers.** [Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms) prohibit AI providers when AI is "the primary (rather than incidental or ancillary) functionality".
   - Nhịp drafts replies that a human approves, for the agency's own guests. That reads as ancillary, so the special [AI-provider pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers) (Updated Sep 1, 2026) should not apply.
   - Keep the positioning as "agency customer-service tool", not "AI assistant".
8. **Billing model.** Tech Providers have no credit line. Meta bills each agency directly for API usage, and Nhịp bills only for its own service ([Partners](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)).
   - A Multi-Partner Solution with a Solution Partner would let agencies skip entering a card.
9. **Agencies keep their own WhatsApp Manager.** Agencies onboarded through Embedded Signup "own all of their WhatsApp assets" and "have full access to WhatsApp Manager ... you cannot restrict this access in any way."
10. **555 numbers.** Business customers can claim up to two US +1 555 numbers that are verified automatically. Display names must be approved before these numbers can send. Probably irrelevant for Vietnam.
