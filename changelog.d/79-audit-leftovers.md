## 2026-10-09 (design audit leftovers)

### Changed

- **The Inbox opens with its thread list and your role already loaded** (#79). The server prefetches both, for the same viewer the API uses, so the list is there at first paint; polling is unchanged.
- **Every main page has an `h1`, and the sidebar menu sits in a `nav`** (#79). The inbox has a visually hidden title; no visual change.

### Fixed

- **The kit's unused AI chat route is no longer served** (#79). The `ai` oRPC router is unmounted; the hidden `/chatbot` page answers 404. The inbox's own model layer is untouched.
- **The CRM spec reads a select's whole text** (#80). The "▼" glyph was already gone; the workaround comment goes.
