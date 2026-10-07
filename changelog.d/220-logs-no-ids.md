## 2026-10-07 (server logs carry no thread or guest ids)

### Security

- **A failed background job logs its kind, never an id or guest data** (#220, PDPL). Vercel's
  logs are telemetry. A job's label is now the job's kind only ("translate", "translations",
  "follow-up draft", "crm account"), never a thread's or message's id. Thread ids are opaque since
  #141, but a few older ones on staging keep the `office:pipe:guest` form, which holds the
  guest's Zalo or WhatsApp id. The failure line
  names the error's class and code, for example `TypeError ECONNREFUSED`, never its message,
  which can quote what the guest wrote. A lint rule, `nhip/background-label-is-literal`, refuses
  any label that isn't a plain string literal.
- **The rest of the server's logging keeps no guest data either** (#220). A failed approve logs
  the office and the vendor's error codes, without the thread id or the vendor's message. A failed draft or
  translation request logs the error's kind, not the parser's message, which quotes the model's
  answer. Failures of the webhook log, the Zalo connect and token refresh, the disconnect alert,
  error reporting and the CRM account lookup log the error's kind instead of the whole error.
  The office's own ids stay: its Zalo OA or WhatsApp number id, and its office id. They are the
  office's, not a guest's, and they say which connection to fix.
