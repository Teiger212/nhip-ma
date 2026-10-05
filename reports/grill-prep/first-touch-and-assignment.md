# Grill: the automatic first greeting, and managers assign leads (2026-10-05)

Raised by Eyal while exploring #134. It reverses parts of PRODUCT.md, CONTEXT.md, ADR 0006 and ADR 0015, and the alert rules merged in #132.

## Facts (checked 2026-10-05)

- **Today's first reply** is a fixed template (`apps/saas/modules/inbox/lib/draft.ts`, `draftReply`), keyed on language and the extracted facts, in EN, VI, JA, KO and RU. It's an agent-approved suggestion: "Thanks for writing — we received your note about … A colleague will reply here on this same chat."
- **Extraction is local regex, with no model** (`extract.ts`, `extractFromInbound`). It covers area, nationality, rent or buy, budget, timeframe and household.
- **The model adapter** (OpenRouter, `DRAFT_*`) drafts translations and follow-ups (ADR 0005).
- **ADR 0015 considered "strict assignment on arrival"** and rejected it because "a new guest can wait on one agent's availability". An instant automatic greeting removes that wait.
- **Language detection:** French and Spanish text with accents reads as VI (`language.ts`). That matters once a reply is sent automatically.

## Round 1, decided (Eyal)

- **The greeting, option (b)** (Eyal settled on b, briefly said c, then returned to b): the **model writes** the first reply, and it's **sent automatically**, within the configuration below. Every later message stays agent-approved, as today.
- **G1:** only the guest's **first** message gets the automatic reply: a greeting plus up to 2–3 questions for missing qualifiers. Then humans take over.
- **G2:** the greeting thanks the guest, acknowledge what they gave, and ask for what's missing. They never mention prices, availability, listings, legal matters, promises or times. They're signed as the office, never a fake human name.
- **G3:** if the model fails or is slow (over about 10 s), the fixed template in the guest's language goes out automatically.
- **G4:** the existing drafting adapter (OpenRouter), on the **cheapest model that passes** a small test set of first messages in EN, VI, JA, KO and RU. Alternatives such as opencode only if OpenRouter falls short.
- **G5:** the automatic greeting **doesn't count as an answer**. The thread stays in Your turn, and the funnel's response time measures the first **human** reply.
- **G6:** on by default, and the **manager** can turn it off for the office.
- **M1:** **the manager assigns.** New leads land in "Unassigned", visible to managers only. Agents see only threads assigned to them. Managers reassign at any time.
- **M2:** a new unassigned lead alerts **managers only**. Assignment alerts the chosen agent (#133), and later guest messages alert the owner. This replaces #132's pool rule.
- **M3:** any manager can assign or reassign, and the last assignment wins.

## Round 2, decided (Eyal, 2026-10-05, as recommended; R7 open)

- **R2, guardrails checked after the model writes, before sending.** The reply must be in the guest's detected language, ≤ ~400 characters, with at most 2 questions. It must contain **no digits, currency, prices, URLs, phone numbers or emails**, and no listing, availability, legal or promise words (a small list per language). The office name is the signature. Any failure sends the fixed template instead. The model is given the qualifiers already extracted.
- **R3:** at most 2 missing qualifiers, in priority order: rent or buy → area → budget → timeframe → household. If none is missing, it greets and acknowledges only.
- **R4:** tighten the VI detection to letters only Vietnamese uses (ă, â, đ, ơ, ư plus the tone marks), and greet in **English** when unsure.
- **R5, the screens:**
  - Managers get an "Unassigned" Inbox view first, oldest first, with "Assign to…" on each row and in the thread header's owner menu.
  - Home's "Waiting now" lists unassigned leads first.
  - Agents see only their own threads; the empty state reads "Nothing assigned to you yet."
- **R6:** a lead that isn't assigned for a long time is #131's escalation discussion. Until then it waits, with the greeting sent and the managers alerted.
- **R8:** a per-office monthly cap of about 2,000 model greetings; beyond it, the template.
- **R9, fallback templates:**
  - per language (EN, VI, JA, KO, RU): a greeting, an acknowledgement of what was extracted, and up to 2 template questions in R3's order, signed as the office;
  - built from local regex only, so they need no model;
  - used when the model is unavailable or slow (over about 10 s), a reply fails R2, the cap is hit, or a language can't be greeted;
  - the text is reviewed by Eyal plus a native read (#78), and contains no figures.
- **R7, disclosure:** an **explicit, warm label**, always on and not removable by an agency, for example "Auto-reply from Saigon Prime: a colleague will continue with you right here." Use "AI-assisted auto-reply" if the lawyer prefers.
  - **Basis** (one research agent, primary sources; not legal advice; on the lawyer's list): Vietnam's AI Law 134/2025 Art 11(1), in force 1 Mar 2026, says a system interacting with people must be recognisable as one. Nhịp is likely the provider. Undisclosed, it could be medium-risk (a dossier and a notice to the Ministry of Science and Technology).
  - **WhatsApp** has no disclosure rule but needs a clear path to a human. **Zalo** has only a general ban on misleading messages.
- **Two follow-ups:**
  - a privacy notice covering automated processing and the opt-out (Decree 356 Art 10(3)), linked from the agency's OA or WhatsApp profile, on the lawyer and A05 list;
  - the model provider must be no-training or zero-retention (WhatsApp Business Solution Terms 4.7), part of choosing G4's model.

## Round 3, decided (Eyal, 2026-10-05, as recommended)

- **R10, the funnel:** the automatic greeting doesn't count. Engaged means a **human** reply was sent. In conversation means the guest wrote again after the first **human** reply.
- **R11:** the greeting shows in the thread as the office's message, with a small neutral "Auto-reply" badge (squared, per DESIGN.md) and "Model" or "Template" in its detail. The reply box holds the suggested answer to the guest's next message.

**The grill is done:** every branch has been visited.

## Round 4, from the drafts (Eyal, 2026-10-05)

- **P1:** a manager who replies to an Unassigned lead becomes its owner, as the code does today. They can reassign at any time.
- **P2:** after the greeting, the reply box holds the model's follow-up draft, written knowing the greeting was sent, so it never greets twice. With no model, it holds the follow-up template.
- **P3:** zero-retention, no-training routing on **every** model call (greeting, translation, follow-up). It's one adapter setting.
- **P4:** the agent who loses a thread gets a bell row **naming the guest** ("Minji Kim was moved to another agent"), with no push. The row's `data` carries the thread's opaque id `{ threadId }`, and guest deletion (#138) deletes such rows. Naming who it moved to comes **after the MVP**.
- **S1 (Eyal, 2026-10-05):** only a new thread's first message is ever greeted. Turning the switch on later doesn't greet existing threads.
- **S2 (Eyal, 2026-10-05):** a lead returned to Unassigned alerts managers only, following from "recipients equal visibility".
