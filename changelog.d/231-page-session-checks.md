## 2026-10-07 (every signed-in page checks the session itself)

### Security

- **A signed-in page checks the session itself, not only through its layout** (#231). The
  signed-in layout's check doesn't run again when you move between its pages, and a crafted
  RSC request (an `RSC: 1` header and a router state that says the layout is already on
  screen) renders a page without it. Every page under `(authenticated)` that reads data on the
  server now calls `requireSession()` first. It sends a visitor with no session to login in
  their language, as the layout does. The audit in the PR lists each page. No data was exposed
  before: where a page read data, the read itself already needed the session. But Home's frame
  rendered for a signed-out RSC request, and now it doesn't.
- **A request for a signed-in page with no session cookie goes straight to login** (#231).
  `proxy.ts` checks only that the cookie is there (Better Auth's `getSessionCookie`) and never
  reads the database. It is a quick pre-filter, not the gate, so a stale or made-up cookie
  still reaches the page's own check. It only redirects a locale's page requests (`GET`/`HEAD`
  under `/en/…`, `/vi/…`). It never redirects the sign-in pages (login, sign-up, forgot and
  reset password, verify), the invitation page, `/api`, `/webhooks`, `/dev` or files,
  whatever the matcher lets in.
