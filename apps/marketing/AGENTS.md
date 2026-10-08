# apps/marketing

The kit's public site. Do not build or ship `apps/marketing`: product work is scoped to
`apps/saas` unless asked otherwise (root [AGENTS.md](../../AGENTS.md)).

## Path aliases

Only app-local aliases are configured in the app `tsconfig.json` files. `apps/marketing/tsconfig.json`:

| Alias                 | Target                             |
| --------------------- | ---------------------------------- |
| `@config`             | `./config`                         |
| `@analytics`          | `./modules/analytics`              |
| `@home/*`             | `./modules/home/*`                 |
| `@blog/*`             | `./modules/blog/*`                 |
| `@i18n/*`             | `./modules/i18n/*`                 |
| `@changelog/*`        | `./modules/changelog/*`            |
| `@legal/*`            | `./modules/legal/*`                |
| `@shared/*`           | `./modules/shared/*`               |
| `content-collections` | `./.content-collections/generated` |
