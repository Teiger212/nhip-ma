# Zalo OA + WhatsApp Cloud API: claim verification (2026-10-12)

A fresh check of 16 claims against Zalo's and Meta's own pages, all fetched 2026-10-12 and rendered with Playwright.
Zalo developer docs are read from `stc-developers.zdn.vn/docs/v2/...`, the iframe content behind `developers.zalo.me/docs/...`.
Translations are mine.

## Verdicts

| #   | Claim (short)                                                                            | Verdict                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OA admin = personal Zalo on a verified +84 number; citizenship not required              | PARTLY: +84 is VERIFIED; "citizenship not required" is UNVERIFIABLE (no page mentions it)                                                                                                                              |
| 2   | Verified OA needs Giấy ĐKKD; verify within 14 days; review 2–3 working days              | VERIFIED (14 days is the deadline to _submit_)                                                                                                                                                                         |
| 3   | No-licence "Hồ sơ quảng cáo" cannot message                                              | VERIFIED                                                                                                                                                                                                               |
| 4   | Open API linking needs Growth or Comprehensive; Basic/Standard have none                 | PARTLY: the FAQ and the API row confirm it, but "Nâng cao" is the wrong name (it is "Tăng trưởng"), and the table's "authorised apps" row gives Basic and Standard 1 app each, which contradicts the FAQ               |
| 5   | Growth/Comprehensive prices, rate limits, apps, outside-48h quota                        | VERIFIED (and more detail below)                                                                                                                                                                                       |
| 6   | Plan needs verified OA + ZBS account; non-refundable, non-transferable; reverts to Basic | VERIFIED                                                                                                                                                                                                               |
| 7   | Consultation reply within 7 days; free in 48h, then 55đ                                  | PARTLY: the plan's monthly quota is used before 55đ applies                                                                                                                                                            |
| 8   | Access token 25h; refresh token 3 months, single-use                                     | VERIFIED                                                                                                                                                                                                               |
| 9   | OAuth v4 + PKCE; callback gets `code` and `oa_id`                                        | VERIFIED                                                                                                                                                                                                               |
| 10  | No OA chat sandbox; Test OA only for Extensions; dev mode only for ZNS-to-admins         | VERIFIED (as far as the docs go)                                                                                                                                                                                       |
| 11  | Legal rep confirms by Zalo request (A) or a signed CVXT letter (B)                       | VERIFIED                                                                                                                                                                                                               |
| 12  | Hộ kinh doanh licence verifies only one OA, no CVXT route                                | VERIFIED                                                                                                                                                                                                               |
| 13  | One naming route needs a "Công ty …"/"Cửa hàng …" prefix                                 | PARTLY: prefix _or suffix_, and only for verification method 1                                                                                                                                                         |
| 14  | App must verify its domain before callback/webhook URLs work                             | PARTLY: the general rule is VERIFIED (only verified domains or URLs work for Zalo Platform services); its application to callback and webhook URLs is inferred, not named; tunnels are exempt; webhooks must use HTTPS |
| 15  | `X-ZEvent-Signature` = "mac=" + sha256(appId + body + timestamp + OA secret key)         | PARTLY: the formula is right, but the header format is unclear                                                                                                                                                         |
| 16  | WhatsApp test number messages ~5 verified recipients with no business verification       | PARTLY: the auto-created test number and the absence of business verification are VERIFIED; the "5 recipients" cap was not found on the pages checked                                                                  |

## Evidence per claim

### 1. Admin must be a personal Zalo account on a verified +84 number: PARTLY (+84 VERIFIED; citizenship UNVERIFIABLE)

- https://oa.zalo.me/home/documents/guides/khoi-tao-zalo-official-account_61
  > "⚠ Lưu ý: Chỉ có SĐT Việt Nam (+84) đã xác thực Zalo cá nhân thành công mới được hỗ trợ tạo và quản lý OA."
  > (Only Vietnamese (+84) numbers that have verified a personal Zalo account can create and manage an OA.)
- https://stc-developers.zdn.vn/docs/v2/official-account/bat-dau/kham-pha
  > "Admin (Quản trị viên) Zalo OA, Zalo App, ZCA là người dùng Zalo cá nhân. Admin của các tài khoản kể trên không nhất thiết phải cùng là một người dùng Zalo."
  > (The admins of the OA, the App and the ZCA are personal Zalo users, and they need not be the same user.)
- No page mentions citizenship. The legal-representative form asks for "Số CMND/CCCD/Hộ chiếu" (ID card _or passport_; https://oa.zalo.me/home/documents/guides/huong-dan-xac-thuc_70), which suggests non-citizens are accepted, but no page says so outright. "Not required" is a reasonable inference, not a documented fact.

### 2. Business registration, 14 days, 2–3 working days: VERIFIED, with a wording fix

- https://oa.zalo.me/home/documents/guides/khoi-tao-zalo-official-account_61
  > "OA xác thực: dành cho Doanh nghiệp/Hộ kinh doanh có Giấy phép Đăng ký kinh doanh"
  > (A verified OA is for enterprises or household businesses that hold a business registration licence.)
  > "vui lòng thực hiện xác thực trong vòng 14 ngày" … "BQT Zalo OA thường sẽ phản hồi kết quả trong vòng 2-3 ngày làm việc, có 1 số trường hợp thời gian sẽ có thể mất nhiều thời gian hơn."
  > (Verify within 14 days; the board usually replies within 2–3 working days, sometimes longer.)
- https://oa.zalo.me/home/documents/guides/huong-dan-xac-thuc_70
  > "OA cần nộp hồ sơ xác thực trong vòng 14 ngày từ khi tạo OA." (The OA must **submit** its verification dossier within 14 days of creation.)
- https://oa.zalo.me/home/documents/policy/dang-ky-va-su-dung-tai-khoan-zalo-official-account-doanh-nghiep
  > "Sau 14 ngày nếu tài khoản OA không nộp lại bộ hồ sơ xác thực, tài khoản sẽ tự động bị khóa vĩnh viễn"
  > (If a rejected OA does not resubmit within 14 days, it is **permanently locked**.)
- Fix: the 14 days is a deadline to _submit_, not to be approved. A household-business licence (Giấy chứng nhận đăng ký hộ kinh doanh) also qualifies.

### 3. "Hồ sơ quảng cáo" cannot message: VERIFIED

- https://oa.zalo.me/home/documents/guides/khoi-tao-zalo-official-account_61
  > "Hồ sơ quảng cáo: dành riêng cho người dùng chưa có Giấy đăng ký kinh doanh, chỉ hoạt động với mục đích chạy quảng cáo trên Zalo … không thể sử dụng các tính năng: Nhắn tin, Broadcast và Bài viết, Chatbot, Gọi thoại."
  > (The ads profile is only for users without a business registration and only runs ads; it cannot use Messaging, Broadcast and Posts, Chatbot, or Calls.)

### 4. Open API requires Growth or Comprehensive: PARTLY (the rule is right, one guessed name is wrong, and one table row conflicts)

Exact plan names (https://zalo.cloud/oa/pricing):

| English       | Vietnamese      |
| ------------- | --------------- |
| Basic (free)  | **Cơ bản**      |
| Standard      | **Tiêu chuẩn**  |
| Growth        | **Tăng trưởng** |
| Comprehensive | **Toàn diện**   |

- "Nâng cao" is **wrong**. It was an older plan and is being discontinued. https://stc-developers.zdn.vn/docs/v2/official-account/quan-ly/mua-san-pham-dich-vu-oa/danh-sach-san-pham
  > "Gói OA Nâng cao 12 tháng (Dừng cung cấp từ 01/06/2026)" (Advanced plan, discontinued from 01/06/2026). The same applies to "Premium". The products still sold are Tiêu chuẩn 12 tháng, Tăng trưởng 6/12 tháng and Toàn diện 6/12 tháng.
- Pricing FAQ (https://zalo.cloud/oa/pricing):
  > "Nếu tôi đang sử dụng phần mềm nội bộ hoặc bên thứ 3 (ứng dụng liên kết) … thì có cần mua gói không? — Có. Để liên kết ứng dụng với OA thông qua API, bạn cần sử dụng Gói tăng trưởng hoặc toàn diện."
  > (Do I need a plan if I use internal or third-party linked software? Yes. To link an app to the OA through the API you need the Growth or Comprehensive plan.)
- The comparison table's "Tích hợp Zalo Open API" row shows "---" for Cơ bản and Tiêu chuẩn and a tick for Tăng trưởng and Toàn diện (checked by screenshot).
- Oddity: the same table's row "Số lượng App được ủy quyền" ("Số lượng ứng dụng tối đa mà 1 OA được ủy quyền khi tích hợp Zalo Open API", the most apps one OA can authorise when integrating the Open API) reads **1 / 1 / 3 / Không giới hạn** (unlimited). So Cơ bản and Tiêu chuẩn show one authorised app, which contradicts their "---" Open API row. The FAQ is explicit, so treat the API as Growth and above. Before relying on it either way, ask Zalo (oa@zalo.me) what that one app on Basic and Standard can do.

### 5. Prices and limits: VERIFIED

https://zalo.cloud/oa/pricing ("Dành cho OA đã xác thực", for verified OAs only; prices include 10% VAT):

|                                              | Cơ bản | Tiêu chuẩn        | Tăng trưởng      | Toàn diện                  |
| -------------------------------------------- | ------ | ----------------- | ---------------- | -------------------------- |
| Price / year                                 | free   | 1.000.000đ        | **2.500.000đ**   | **6.000.000đ**             |
| Price / 6 months                             | –      | – (12-month only) | **1.400.000đ**   | **3.400.000đ**             |
| Open API                                     | —      | —                 | ✓                | ✓                          |
| API rate limit (per OA)                      | —      | —                 | **100 req/phút** | **2.000 req/phút**         |
| Authorised apps                              | 1      | 1                 | **3**            | Không giới hạn (unlimited) |
| Consultation msgs outside 48h included/month | —      | —                 | **500**          | 2.000                      |
| Staff accounts                               | 3      | 5                 | 15               | 100                        |
| Extensions ("Cài đặt tiện ích")              | —      | ✓                 | ✓                | ✓                          |

- Separately, there is an app-level cap of "Official Account API: 4.000 requests/phút" (https://stc-developers.zdn.vn/docs/v2/official-account/phu-luc/gioi-han-toc-do-api), and error `-32` when it is exceeded.

### 6. Purchase prerequisites and refunds: VERIFIED

https://zalo.cloud/oa/pricing (FAQ):

- > "B1: Xác thực OA và chờ BQT Zalo Official Account duyệt. B2: Liên kết tài khoản Zalo Business Solutions (ZBS Account) và nạp tiền để mua gói" (Step 1: verify the OA and wait for approval. Step 2: link a ZBS account and top it up to buy a plan.)
- > "Số tiền đã mua gói sẽ không được hoàn lại." (Plan payments are not refunded.)
- > "Gói đã mua chỉ sử dụng cho 1 OA duy nhất, không thể chuyển nhượng." (A plan serves one OA only and cannot be transferred.)
- > "Trường hợp gói hết hạn … thì OA sẽ được chuyển về dùng gói Cơ bản." (On lapse the OA reverts to the Basic plan.)
- Extra: the buyer must hold the OA Admin or plan-manager role **and** be Admin or Editor on the ZBS account. The developer docs still call the ZBS account "Zalo Cloud Account (ZCA)". Purchases can also be made by API (Create Order and Confirm Order, which debit the ZCA).

### 7. Consultation window and cost: PARTLY

- 7 days: https://stc-developers.zdn.vn/docs/v2/official-account/tin-nhan/tin-tu-van/dieu-kien-gui-tin-tu-van
  > "User (người nhận tin): có tương tác với OA trong vòng 7 ngày." (The recipient interacted with the OA within 7 days.) The overview adds "và đang không chặn OA" (and has not blocked the OA).
- Free in 48h, and unlimited since 2026: https://stc-developers.zdn.vn/docs/v2/official-account/tin-nhan/tin-tu-van/gui-tin-tu-van-dang-van-ban
  > "Từ ngày 1/1/2026, đối tác có thể gửi tin Tư vấn miễn phí không giới hạn trong khung 48h" (From 1/1/2026, unlimited free consultation messages inside the 48h window.)
  - Stale conflict: https://stc-developers.zdn.vn/docs/v2/official-account/tin-nhan/quan-ly-tin-nhan/kiem-tra-tin-tu-van-trong-khung-48h still says "OA được miễn phí 08 Tin Tư vấn gửi trong khung 48 giờ" (8 free messages).
- After 48h it is not straight 55đ. https://stc-developers.zdn.vn/docs/v2/official-account/tin-nhan/tong-quan
  > "Sau 48 giờ kể từ tương tác cuối của người dùng, giá tin Tư vấn được tính theo bảng giá" (after 48h, priced per the price list.)
  > The pricing page reads "Tin Tư vấn (Ngoài khung 48h) … 55 đ/tin" and "Sau khi dùng hết hạn mức miễn phí, hệ thống bắt đầu tính phí theo lượt tin nhắn" (charging per message starts once the plan's included quota is used up). So on Growth the first 500 outside-48h messages each month are included, and 55đ applies after that. Send responses report the funding source as `quota_type`: `reply`, `sub_quota`, `purchase_quota` or `reward_quota`.

### 8. Token lifetimes: VERIFIED

https://stc-developers.zdn.vn/docs/v2/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new

- > "Thời hạn hiệu lực của Access Token: 25 giờ" (`expires_in: "90000"`)
- > "Refresh Token chỉ được sử dụng một lần … Thời hạn hiệu lực của Refresh Token: 3 tháng" (A refresh token can be used once and lasts 3 months.)
- Extra: "Access Token cũ sẽ hết hiệu lực ngay khi Access Token mới được tạo thành công" (the old access token dies as soon as a new one is issued), so refreshing must be serialised. The authorization code is single-use and valid for 10 minutes.

### 9. OAuth v4 + PKCE, callback params: VERIFIED

Same page:

- > "Zalo sử dụng code challenge và code verifier (theo phương thức PKCE)" and `code_challenge = Base64.encode(SHA-256.hash(ASCII(code_verifier)))` (no padding; the verifier is 43 characters).
- > "https://yourdomain.com/abc?code=<AUTHORIZATION_CODE>&oa_id=<OA_ID>"
- Token endpoint: `POST https://oauth.zaloapp.com/v4/oa/access_token` with header `secret_key`.
- Nuance: `code_verifier` is "yes nếu ở bước 2 có thiết lập code challenge" (required only if a code challenge was set), so PKCE is technically optional. The permission link is configured in the Zalo for Developers portal and sent to the OA admin. Use `state` to match codes to verifiers.

### 10. No chat sandbox: VERIFIED (absence across the docs sitemap)

- The OA docs sitemap (https://stc-developers.zdn.vn/docs/sitemap.xml) has only three test or dev pages: the Extension sandbox, ZNS dev mode, and ZBS Template dev mode. None covers consultation chat.
- https://stc-developers.zdn.vn/docs/v2/official-account/extension/bat-dau/sandbox: "Kiểm thử Extension trên OA test" (test an Extension on a test OA).
- https://stc-developers.zdn.vn/docs/v2/zalo-notification-service/gui-tin-zns/gui-zns-su-dung-development-mode
  > "Chế độ development chỉ hỗ trợ gửi thử mẫu ZNS đến quản trị viên của ứng dụng hoặc quản trị viên của OA." (Development mode only sends test ZNS to app or OA admins.)
  > The page is frozen: "Từ ngày 01/01/2026, dịch vụ ZNS được hợp nhất vào ZBS Template Message." The ZBS Template Message successor keeps the same admin-only dev mode: https://stc-developers.zdn.vn/docs/v2/zbs-template-message/gui-tin-template-qua-sdt/api-gui-tin-qua-sdt/api-gui-tin-su-dung-development-mode
- The closest thing to a test path for chat is the **API Explorer** (Công cụ & Hỗ trợ > API Explorer), which mints an OA access token by hand. It still needs a real OA, and presumably a plan that allows API access.

### 11. Legal-rep confirmation, routes A and B: VERIFIED

https://oa.zalo.me/home/documents/guides/huong-dan-xac-thuc_70

- > "Thông tin người đại diện pháp luật gồm: Tên người đại diện, Số điện thoại (Zalo) người đại diện, Số CMND/CCCD/Hộ chiếu." (The legal-rep fields are name, Zalo phone number, and ID card or passport number.)
- > "Đối với tài khoản OA nộp theo bộ hồ sơ 1A, 2A hoặc 3A, người đại diện pháp luật sẽ nhận được Yêu cầu xác nhận qua Zalo … Trường hợp người đại diện pháp luật không sẵn sàng thực hiện xác nhận qua Zalo, vui lòng sử dụng Công văn xác thực (CVXT) theo mẫu"
  > (With dossiers 1A, 2A or 3A the legal rep gets a confirmation request on Zalo. If they cannot confirm on Zalo, use a CVXT verification letter on the template.)
- > "Người đại diện pháp luật nhấn Từ chối hoặc không xác nhận trong thời hạn 48H, bộ hồ sơ bị từ chối" (If the rep declines or does not confirm within **48h**, the dossier is rejected.)
- The B dossiers (1B, 3B) are the CVXT route. "CVXT" means _công văn xác thực_, a verification letter on Zalo's template, rather than an authorisation letter in the strict sense.

### 12. Household business: one OA, no CVXT: VERIFIED

https://oa.zalo.me/home/documents/guides/xac-thuc-cach-1

> "Giấy chứng nhận Đăng ký Hộ kinh doanh chỉ dùng xác thực cho 01 OA và không hỗ trợ xác thực theo Công văn"
> (A household-business certificate verifies only one OA and does not support verification by letter.)

### 13. Naming prefix: PARTLY

- https://oa.zalo.me/home/documents/guides/xac-thuc-cach-1 (verification method 1, by company or shop name):
  > "Ví dụ tên OA cần có tiền tố/ hậu tố về tên công ty: CTCP NGUYỄN TRẦN LÊ; Công ty Nguyễn Trần Lê" … "Ví dụ tên OA cần có tiền tố/ hậu tố về tên cửa hàng: Shop BéBiBo; Cửa hàng BéBiBo"
  > (The OA name needs a company or shop **prefix or suffix**, e.g. "CTCP …", "Công ty …", "Shop …", "Cửa hàng …".)
- The general rule (https://oa.zalo.me/home/documents/guides/huong-dan-dat-ten-zalo-oa_66) is "Tên OA = [Tiền tố] + Tên chính + [Hậu tố]", with the prefix in brackets (optional). A prefix is mandatory only "Nếu tên doanh nghiệp/hộ kinh doanh có tên đăng ký mang ý nghĩa rộng" (if the registered name is generic).
- Two other naming routes need no such prefix: method 2 (a trademark registered with the IP Office) and method 3 (another trade name or product name, with supporting papers).
- Other rules: 2–40 characters, no phone numbers, no special characters or emoji. **Real-estate rule:** a project-specific OA name needs the prefix "Dự án", e.g. "Dự án biệt thự Zalo". This matters for property agencies.

### 14. Domain verification before callback or webhook: PARTLY (general rule VERIFIED; callback and webhook inferred)

https://stc-developers.zdn.vn/docs/v2/official-account/phu-luc/huong-dan-xac-thuc-domain

- > "Những domain và URL nằm trong danh sách xác thực mới có thể sử dụng cho các dịch vụ của Zalo Platform." (Only domains and URLs on the verified list can be used for Zalo Platform services.) The page does not name callback or webhook specifically.
- The webhook overview adds: "Webhook Url không nên dùng host:port, thay vào đó hãy dùng domain và phải được cấu hình https" (do not use host:port; use a domain, and it must be HTTPS). https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tong-quan
- Methods: a DNS TXT record (on the domain or on `zalo_verifier.<domain>`), an HTML file, or a meta tag. Prefix-URL verification is also possible. The limit is 20 domains and 20 URLs per app.
- **Dev exemption:** > "Zalo Platform không kiểm tra xác thực domain với các dịch vụ localtunnel.me, ngrok.io, localhost.run, serveo.net." (Zalo does not check domain verification for these tunnelling services.)

### 15. Webhook signature: PARTLY

https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tin-nhan/su-kien-nguoi-dung-gui-tin-nhan

> "X-ZEvent-Signature:mac = sha256(appId + data + timeStamp + OAsecretKey), với data là chuỗi json trả về dưới đây."
> (The signature is sha256 over appId + data + timeStamp + OAsecretKey, where data is the JSON body.)

- The formula and its order are verified. The docs leave three points unclear:
  - whether the header value literally starts with `mac=`;
  - whether `timeStamp` is the body's `timestamp` field or a header;
  - which key "OAsecretKey" means. That term appears only on this page, and no page defines it. It may be the App Secret Key, or a separate OA secret shown in the app's webhook settings.
- Confirm all three against one real captured event before relying on the check. Webhook rules (from https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tong-quan): reply 200 within **2 seconds**; retries come after 30s, 5m, 15m, 30m and 1h with a `num_retry` header; after that the webhook is disabled.

### 16. WhatsApp test number: PARTLY

- https://developers.facebook.com/docs/whatsapp/cloud-api/overview (Test resources):
  > "When you get started with Cloud API, a test WhatsApp account, test Messaging account, and test business phone number are automatically created for you. Test accounts and test phone numbers are useful for testing purposes, as they have relaxed messaging limits and don't require a payment method on file in order to send template messages."
- https://developers.facebook.com/docs/whatsapp/cloud-api/get-started (updated Jun 16, 2026): the steps need only a Facebook account, developer registration and a Meta app, with no business verification. "Add a **To** phone number that will receive the test message."
- **Not found:** the "5 recipient numbers" cap is not on the pages checked on 2026-10-12: cloud-api/get-started, cloud-api/overview, cloud-api/phone-numbers and messaging-limits, plus the new-tree pages `developers.facebook.com/documentation/business-messaging/whatsapp/get-started` and `.../business-phone-numbers/phone-numbers` (read with Jina Reader). The cap may still hold in the dashboard.
- Also relevant: going live on a real number without business verification is possible. https://developers.facebook.com/docs/whatsapp/messaging-limits says "Newly created business portfolios have a messaging limit of 250", and that limit counts only _outside_ the 24h customer-service window. Replies to inbound guests are not capped by it. Verification raises the limit to 2,000.

## Missing from the list

1. **The plan line-up changed on 01/06/2026.** Nâng cao, Premium and the old trial (Dùng thử) are discontinued. Any older blog or price quoting "Nâng cao" or "Premium" is stale.
2. **Tiêu chuẩn costs 1.000.000đ/year**, but it has no Open API, so it is not a path to API access. **Open question for oa@zalo.me, not a finding:** Tiêu chuẩn includes "Cài đặt tiện ích" (third-party Extensions), and Extensions can "lắng nghe webhook events … gọi Open API … gửi tin nhắn" (https://stc-developers.zdn.vn/docs/v2/official-account/extension/gioi-thieu). Building Nhịp as an OA Extension, listed on the Extension Hub, _might_ run on a Tiêu chuẩn OA. Whether an Extension's Open API calls work below Tăng trưởng is **not documented**; ask oa@zalo.me before relying on it.
3. **The pricing table shows 1 authorised app on Cơ bản and Tiêu chuẩn**, which conflicts with the FAQ (see #4). Ask Zalo.
4. **Tunnels are exempt from domain verification** (ngrok and others), which helps local webhook development.
5. **The legal rep has 48h to confirm**, or the dossier is rejected. **A rejected OA has 14 days to resubmit** or it is permanently locked.
6. **Real-estate OA naming** needs the "Dự án" prefix for project-specific names, which is directly relevant to property agencies.
7. **Old access tokens die immediately on refresh**, and refresh tokens are single-use, so one refresh in flight per OA is required.
8. **Consultation messages must not go to users who blocked the OA.** The free in-window count also changed from 8 to unlimited on 1/1/2026.
9. **The API Explorer** can mint an OA token by hand for an OA or app admin. It speeds up first tests but is not a sandbox.
10. **Chain stores and many OAs:** Zalo offers help for creating and verifying OAs for chains (guide `ho-tro-tao-xac-thuc-cai-dat-oa-cho-chuoi-cua-hang_7533181939656049281`) and asks large operators to email oa@zalo.me.
