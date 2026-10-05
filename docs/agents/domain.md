# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. Nhịp is single-context: one glossary and one ADR folder at the repo root.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the glossary (this repo's name for `GLOSSARY.md`).
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. Decisions taken later are recorded as dated `## Amendment` sections inside the ADR they change; read those too.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-two-roles-two-screens.md
│   └── 0003-crm-adapter.md
├── apps/
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0003 (CRM adapter), but worth reopening because…_
