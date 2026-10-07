## 2026-10-07 (error reports drop the inbox's thread and message ids)

### Security

- **Server error reports drop every record id** (#220 follow-up). The PostHog scrubber removed only ids starting with "c", Prisma's cuid. The inbox's thread and message ids (cuid2, #141) start with any letter, so an error message that named one sent it to PostHog. They're removed now too.
