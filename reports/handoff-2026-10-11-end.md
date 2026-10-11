# Handoff, 2026-10-11 (end of day)

Start here in a fresh session. This replaces the 2026-10-04 handoff. Its lasting content lives in the docs, the issues and the board.

## The goal

**The demo is on 2026-10-18** (milestone `Demo-ready · 2026-10-18`). The go-live tracker is **#99**. The board is GitHub project **Nhịp** (https://github.com/users/Teiger212/projects/4); its rules are in docs/agents/issue-tracker.md.

## Open PRs (Eyal merges)

- **#332** (closes #330): motion and delight.
  - **Motion:**
    - The send handoff, done as FLIP with transform and opacity only, because a `grid-template-rows` fold stuttered.
    - The count ticks down.
    - The phone list↔thread push uses View Transitions.
    - Sheets take 300/200 ms with no backdrop blur.
    - Send states, and kit timing.
    - A global reduced-motion floor; Playwright runs with `reducedMotion: 'reduce'`.
  - **Delight:**
    - "All caught up", which fixes the phone dead end after the last send with a "View sent" button.
    - "Next: {name}, waiting {time}" in the sent toast.
    - "Send failed. Your reply is still here."
  - CI is green.
- **#331** (closes #306): EN and VI guests only until after the demo.
  - `SUPPORTED_GUEST_LANGUAGES` defaults to `en,vi`.
  - JA, KO and RU guests are answered in English, with the line "We reply in English. If you can write to us in English, we'll help you faster." once, and are still translated for the agent.
  - River AI fixtures were regenerated in English.
  - **CI:** one red test, Pipes 3, "socket hang up" on its first Zalo webhook through the E2E HTTPS proxy. It passes 5/5 locally on the branch. Recorded as flake **#333**; not re-run (one-green-run rule).

**After both merge, on Eyal's 3010:**

1. `git pull --ff-only`.
2. `pnpm --filter @repo/database generate`.
3. `pnpm seed -- --reset` (Minji and the other JA/KO/RU guests switch to English replies).
4. Restart 3010.

The river office's HubSpot connection was set by hand on the main dev database and survives a reseed.

## Merged today

| PR   | What                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- |
| #310 | Translation uses Gemini 3.1 Flash-Lite (#254 eval)                                                        |
| #313 | Text boxes keep a fixed height with no drag handle; the reply box is 80px (#312)                          |
| #316 | Seed: the walk office answers fast, median 6 min, 9 in 10 within 17 min (#315)                            |
| #318 | Optional `stayLength` on the qualification, regex-extracted (#317)                                        |
| #319 | **Navy on Marble**, Nhịp's own look (#314): theme, Manrope, inbox, Home, rewritten DESIGN.md              |
| #325 | CRM status in the thread header; a clear X in search; no count line under the tabs; STAY in the stay card |
| #324 | Tracker doc: the milestone is `Demo-ready · 2026-10-18`                                                   |
| #326 | DESIGN.md in the spec's format, plus a fresh `.impeccable/design.json`                                    |
| #329 | Critique fixes (#327): the plate rule, the phone details sheet and paperwork chip, 11px field keys        |

## Decisions by Eyal today

These are recorded on their issues. Pending items are marked as pending.

- **Visual world: Navy on Marble+** (#314), from the Calendly reference in `reports/design/DESIGN.md`. Metaphor or "costume" directions are rejected. Eyal decides from detailed HTML mockups.
- **Areas** get their own earth palette, outlined with a pin, never a language's colour.
- **The CRM status** goes in the thread header, as in the mockup. Owner placement was not decided and stays in the rail.
- **"Not in CRM yet"** stays as is (no "Add to CRM" button for now).
- **The reply's translation line** uses the 文A glyph, the same as the thread. The #242 label moved into the glyph's accessible name.
- **The count line under the view tabs** is removed; the tabs carry the counts.
- **The Plate Says Something Rule** (#327): a row's plate shows only when it differs from the tab.
- **Home:** p90 reads "9 in 10 answered within {value}", and Waiting now has a "Quiet · over 48 h" divider.
- **Guest names stay in alerts** (ADR 0019 unchanged).
- **Gated languages** keep the wording "Korean · not supported, replies in English".
- **#311** (jump to the next thread after assigning) is closed as obsolete; the motion pass covers moving on.
- **Fact extraction:** leaning to regex + classifier + LLM, decided by an eval (#320 spec; #322 ADR, #323 eval, #321 build after the demo). On-demand "Translate my edit" is approved for after the demo (#328).
- **One dev server:** only 3010, on the main checkout. No branch preview servers, and never point a worktree at the main database.

## Pending Eyal

- **#78:** a native read of the new VI strings. Lists are posted there from #330, and #306's VI "We reply in English" line also needs one.
- **#317 follow-up:** should a missing stay length be one of the Missing asks? Default: no.
- **#329's three calls, listed on the PR:**
  - the paperwork chip opens the same sheet;
  - the sheet is a centred column on a narrow desk pane;
  - the facts row stays on the phone strip.
- **#329's recorded edge cases:**
  - the chip overlaps a manager's owner select by a few px on a phone;
  - the paperwork text falls below the fold on a 667px phone.
- **#191:** the demo-script grill. Its comment still points at a removed "Suggested reply · AI" label.
- **#128** intake, and **#99** go-live items: Zalo OA, production env, `DRAFT_API_KEY` on staging and production, the river office's HubSpot on staging.

## Next for agents

1. Once #331 and #332 merge, re-run `/impeccable critique` on the inbox. The baseline is 26/40: `.impeccable/critique/2026-10-11T11-32-26Z__apps-saas-modules-inbox-components.md` (untracked).
2. **#323**, the extraction eval: build the fixture and script; Eyal runs the paid part. **#322** is the ADR.
3. After the demo:
   - **#328**, draft safety: translation after an edit, and Regenerate safety;
   - **#321**, the extraction build;
   - #330's after-demo list: row arrival, the tab fill slide, search X and Quiet motion, the kit sidebar's width animation, "guest wrote back", "nothing assigned yet";
   - **#333**, the flake.
4. **Cleanup owed.** Remove merged worktrees under `.claude/worktrees/`, plus their `nhip_dev_*`, `nhip_test_*` and `nhip_e2e_*` databases:
   - admin-295, admin-followups, audit-79, conv-297, fix-288, polish-2, polish-94, river-ai-seed;
   - translate-gemini, textareas-312, fast-seed-315, stay-length-317, navy-marble-314, design-doc, critique-327, milestone-doc;
   - en-vi-306 and motion-330 once merged.

   Check each PR's state first; never sweep a worktree an agent is still using.

## Local, untracked

- `reports/design/directions-2026-10-11/`: every direction mockup, including `navy-marble-plus.html` and `home-navy-marble-plus.html`.
- `reports/design/`:
  - `DESIGN.md`, the Calendly reference;
  - `turn-plates-327.png`;
  - `delight-2026-10-11.html`;
  - `motion-2026-10-11.html`, the interactive demo with a reduced-motion toggle.
