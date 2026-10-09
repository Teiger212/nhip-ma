# 0007. Every guest message is translated into the operator's language

Date: 2026-09-17. Status: accepted.

**Amended by ADR 0025 (2026-10-08).** A guest message is translated once, into the office
language the manager sets, not into each operator's language.

**Amended by #242 (decided by Eyal, 2026-10-08).** Outgoing text gets an operator line: "office
messages are not translated back" no longer holds, because an agent who reads only English or
Vietnamese was approving Korean, Russian or Vietnamese replies blind.

- The auto-reply, the suggested reply and a reply sent as suggested show what they say in the
  office language, muted inside the office's bubble and under the reply box.
- **Templates first.** A template's line is the same template rendered in the office language,
  with no model call, stored with the suggestion and, once sent, with the sent message. It is
  labelled with that language ("In English", "Bằng tiếng Việt"), not "Translation": it is the
  parallel template, not a translation.
- A model draft carries its office-language text from when it was written (#251); sent as it
  was, the sent message keeps it, labelled "Translation".
- No line when the reply is already in the office language. A reply the agent edited or typed
  gets none for now: its model translation is a later ticket.

## Context

The operator note is written in the operator's language, but it carries only what the
regex extractor recognised (nationality, area, rent or buy, budget, dates, paperwork
flag). The guest's actual sentence is shown untranslated. For a Korean, Japanese, or
Russian guest the agent cannot read what was said; "the last agent promised a discount
if I sign this week" becomes "nationality Korean". The language bridge was one-way.

## Decision

- Every **guest** message is translated into the operator's language (EN or VI, from the
  operator's locale setting) and shown directly under the original, visually secondary.
- Office messages are not translated back; the agent wrote or approved them.
- Translation runs once per inbound at ingest, through the **draft adapter** (ADR 0005),
  and is stored on the message so it is not recomputed per view or per operator locale
  change; a locale the office has not used yet is translated on first request.
- The **operator note** stays as it is: facts and flags, not a translation. Its job is
  "what do I need to know"; the translation's job is "what did they say".
- The AI suggested reply (ADR 0005) reads the originals; the translation is for the
  human.
- Guest languages remain EN, VI, JA, KO, RU. Anything else is detected as best effort
  and translated the same way; the first-reply template falls back to English.

## Consequences

- `Message` gains a `translations` map keyed by operator locale. Store, DDL, zod row,
  and the list API change; existing files migrate on open with empty maps.
- Ingest becomes async where it was synchronous: a message may exist before its
  translation does. The UI shows the original immediately and the translation when it
  lands; translation never blocks a send.
- Translation is untrusted-input-in, text-out: guest text is framed as data in the
  prompt, and the translation is rendered as text, never as markup.
- Cost: one model call per inbound message, on the cheapest model that translates VI, JA,
  KO, RU reliably. Same adapter, same fallback (no translation) when unavailable.
