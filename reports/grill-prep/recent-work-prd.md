# Grill pack: PRODUCT.md and CONTEXT.md after 2026-10-04

Line numbers are from `origin/main` (bf0767d). (inf.) means inferred.

## 1. What exists

- **ADR 0003, 2026-10-04 amendment** (PR #127, OPEN, `docs/attio-adr`): "Nhịp never sets up a third-party CRM … an office with no CRM has no connection, writes nothing, and shows no won or lost until #126" (l.110–114). On phones: "A WhatsApp `wa_id` is always read as `+` … full international input is #125, after the first client" (l.182–186).
- **Code:**
  - `CrmKind` is `mock | hubspot` (schema.prisma:531).
  - `toE164` tries VN first (`crm/phone.ts:13`). Only CRM code calls it (`sync.ts:221`, `hubspot.ts:336`), so a no-CRM or Zalo office never parses a phone.
  - Home always hatches Closings and Lost with "Connect your CRM" (`Home.tsx:91–99`), even when a CRM is connected. #68 changes that.
- **Issues:**
  - #126's title still says "forked"; its comment says "the fork is out".
  - The Twenty research (PR #127 only): 9–13 days self-hosted, no SSO below Enterprise.
  - #125, #128 and PR #129 are OPEN. #64, #67, #68 and #77 are on First client.
- **HubSpot for a client (inf.):** ADR 0003 l.94 says "the production app is a separate OAuth app". #99's "the adapter exists" understates this.

### Stale lines, with proposed wording

| Where                                  | Says                                                     | Proposed                                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRODUCT 23–28                          | no Guest in Who                                          | "**Guest**: often an expat on a foreign number; every international number works (#125)."                                                                                           |
| PRODUCT 97–98                          | "Closings and lost come from the office's CRM."          | add "With no CRM, Home says so."                                                                                                                                                    |
| PRODUCT 105–107                        | "Attio for the first client (#101 … free workspace…)"    | "The agency's own CRM, or Nhịp's built-in CRM (#126); Attio only if already on it (#101); never a third-party CRM set up by Nhịp; the first client's CRM comes from intake (#128)." |
| PRODUCT 109, 229; CONTEXT 143, 160–161 | "does not become the CRM" / "Not a CRM"                  | Q1                                                                                                                                                                                  |
| PRODUCT 121                            | "prod ships by GitHub Release…"                          | add "…each approved by Eyal (PR #129)."                                                                                                                                             |
| PRODUCT 187–193                        | milestone 2 open list                                    | add "intake checklist (#128)"                                                                                                                                                       |
| PRODUCT 150–156                        | the Later lists and the coming-soon exception            | built-in CRM, per Q3                                                                                                                                                                |
| PRODUCT 202–204, 207–208               | "Attio for the first client"; "the client's CRM (Attio)" | "Attio only if the client already uses it"; "the client's CRM, if any"                                                                                                              |
| CONTEXT 21–22                          | Guest                                                    | add "Often an expat; their number is matched exactly, never read as Vietnamese."                                                                                                    |
| CONTEXT 37                             | "Owns its pipes, CRM connection"                         | "…its CRM connection, if any"                                                                                                                                                       |
| CONTEXT 144–145                        | "Attio, the first client's CRM"                          | "Attio, for an agency already on it; later the **built-in CRM** (#126)"                                                                                                             |
| CONTEXT, new terms                     | —                                                        | **Intake**, **Built-in CRM**                                                                                                                                                        |
| ADR 0009 23–24, 41–42                  | "Attio adapter and mock CRM"; "connect your CRM"         | a status line: "superseded by PRODUCT.md and ADR 0003 (2026-10-04)"                                                                                                                 |
| ADR 0002 33–34, DESIGN 482             | the "connect your CRM" chip                              | per Q4                                                                                                                                                                              |
| e2e 52–53 (CRM 6)                      | no no-CRM case                                           | add "An office with no CRM: Closings and Lost say it has none."                                                                                                                     |
| e2e, new                               | —                                                        | "Coming-soon CRMs can't be chosen; Mock isn't offered in production (#123)."                                                                                                        |
| HANDOFF 90                             | "Attio workspace + API key"                              | "The agency's own CRM key, if any (intake)"                                                                                                                                         |

## 2. What's undecided

- **The "Not a CRM" principle vs #126.** This is the root decision.
- **The built-in CRM's name, and whether it shows before it exists.** Depends on the principle.
- **Home for a no-CRM office.** Depends on the name.
- **The client's CRM** (intake). It decides #101, the HubSpot OAuth app, #64, #67 and the `wa_id` fix before go-live.
- **The guest's language beyond the five first-class ones.** Independent.

## 3. UI/UX shape

**Who sees what**

- **Platform admin:** the CRM selector.
- **Manager and agent:** Home's Closings and Lost; the thread header's CRM badge.
- **Guest:** only the agency's messages, in their own language. Nothing from Nhịp.

**States:** no CRM; connected, never checked; "as of" a time; CRM failing (cached numbers, stale "as of"); owner missing (Attio).

**The rules that apply**

- DESIGN "Do hatch a number Nhịp does not have yet and say why in a neutral chip" (l.500).
- **The One Blue Rule:** no blue on a chip the manager can't act on.
- **The Red Means Broken Rule:** no CRM is an absence ("an absence is not a failure", l.419).
- **The Pill Acts Rule:** a squared badge, never a pill.
- Copy: sentence case, plain, no dates.

**Home, an office with no CRM**

```
| 4 Closings            | 5 Lost                |
| [////// No CRM //////]| [////// No CRM //////]|
| Closings and lost come from your CRM.         |
| Nhịp connects the one your office uses.       |
```

**Connections, the CRM card (platform admin)**

```
CRM  [ None                 v]
       HubSpot
       Attio            (once #101 ships)
       Built-in CRM     coming soon (disabled)
       Bitrix24 / Getfly CRM / Zoho CRM   coming soon (disabled)
       Mock CRM         (dev and staging only)
```

**Thread header for an expat guest**

```
Minji Park  [WhatsApp] [Yours] [Your turn] [In CRM: Minji Park]
+82 10-1234-5678
```

## 4. Round 1: the PRODUCT.md amendments

1. **"Not a CRM", now that #126 exists.**
   - (a) Reword: "Nhịp's inbox never becomes the record of deals; deals live in a CRM, the office's own or the one Nhịp hosts beside it."
   - (b) Drop it.
   - **Rec: (a).** The built-in CRM stays one more adapter, not inbox tables.
2. **The glossary name.**
   - (a) "Built-in CRM".
   - (b) "Nhịp CRM".
   - (c) Name Twenty.
   - **Rec: (a) in the docs, and the UI name in #126's spec.** Without SSO it's a second login, so "built-in" may oversell.
3. **Shown before it exists?**
   - (a) Later, not shown.
   - (b) A disabled entry in the admin's selector (#123's exception).
   - (c) Also on Home.
   - **Rec: (b).** Admin-only. The coming-soon rule bars a Home promise for an unspecced epic.
4. **Home's chip with no CRM.**
   - (a) Keep "Connect your CRM".
   - (b) "No CRM", plus the hint above.
   - (c) Hide the cells.
   - **Rec: (b).** Managers can't connect a CRM, and hiding the cells breaks the funnel's shape.
5. **Phones at go-live.**
   - (a) Only the `wa_id` "+" fix, with any real CRM; #125 after.
   - (b) All of #125 now.
   - **Rec: (a).** Only CRM code parses phones, and WhatsApp waits on #87.
6. **Intake.**
   - (a) A glossary term, plus #128 in milestone 2, with the answer recorded on #99.
   - (b) An issue only.
   - **Rec: (a).** It picks the CRM path.
7. **HubSpot as the client's CRM.**
   - (a) PRODUCT says the OAuth app is needed (1–2 days, inf.).
   - (b) Treat it as "exists".
   - **Rec: (a), once verified.** Otherwise #99 underestimates.
8. **The guest's language.**
   - (a) The five first-class languages; any other gets English.
   - (b) Any language detected.
   - **Rec: (a) at go-live.** The first reply is a fixed template (inf.: check the fallback).

## 5. Later rounds

- **#126's spec:**
  - the UI name;
  - the second login, or the SSO cost;
  - one instance per office within the 5-workspace cap;
  - moving data to and from Attio or HubSpot;
  - what agents see where.
- **A no-CRM office's queue:** nothing ever resolves, so dead threads rely on Quiet. Is a manual outcome wanted? That conflicts with ADR 0003.
- **If intake says Attio:** #101's tickets, and the "owner missing" copy.
- **#125:** the default country from market config (Peru), and the display format per locale.
- **Home's copy** for "as of" and for the CRM failing (#68).

## 6. Go-live cut (2026-10-18)

| Must ship                                     | Size          |
| --------------------------------------------- | ------------- |
| Merge PR #127                                 | 0             |
| The doc sweep above                           | 0.5 d         |
| #128 intake doc, plus the client's answer     | 0.25 d + Eyal |
| PR #129, plus Eyal's setup                    | Eyal, 0.5 h   |
| The no-CRM state of Home (#68 part, #77 spec) | 0.5 d         |
| Mock hidden in production (#123 part)         | 0.25 d        |

**Conditional on intake:**

- **Attio:** #101, 3–4 d, plus #64 and #67, about 1.5 d (inf.).
- **HubSpot:** the OAuth app, 1–2 d (inf.), plus #64 and #67.
- **Any real CRM:** the `wa_id` fix, 0.25 d.

**After:**

- #126, 9–13 d, plus ops;
- #125, about 1 d;
- #123's coming-soon entries;
- #116 and #70.
