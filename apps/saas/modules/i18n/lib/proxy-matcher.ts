/**
 * Mirrors the `config.matcher` literal exported from `../../../proxy.ts`.
 *
 * Next.js statically parses `proxy.ts`'s exported `config.matcher` at build
 * time (`extractExportedConstValue` in
 * `next/dist/build/analysis/extract-const-value.js`). That extractor only
 * understands literal expressions written directly in the file being
 * parsed — an imported identifier resolves to "Unknown identifier" and the
 * whole matcher is silently ignored (proxy would then run on every route).
 * So this constant cannot be imported into `proxy.ts`; it exists purely so
 * the pattern can be unit tested here.
 *
 * keep in sync with apps/saas/proxy.ts
 */
export const PROXY_MATCHER_SOURCE =
	"/((?!api(?:/|$)|webhooks(?:/|$)|dev(?:/|$)|image-proxy(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|.*\\..*).*)";
