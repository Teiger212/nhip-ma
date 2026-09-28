/**
 * Creates the E2E database if it is missing, on the server DATABASE_URL points at. Run by
 * the Playwright web server before the schema push and seed (playwright.config.ts).
 */
import { ensureTestDatabase } from "@repo/database/inbox/testing";

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("E2E needs DATABASE_URL (derived from .env.local or set by CI)");
	}
	await ensureTestDatabase(url);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
