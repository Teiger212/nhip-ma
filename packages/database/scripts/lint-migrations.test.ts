import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// #98, "Lint new migrations in CI": every migration must work with the code before it
// (AGENTS.md, "Schema changes are expand/contract"). Squawk names the rule each one breaks.
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function lint(...args: string[]) {
	const result = spawnSync("./scripts/lint-migrations.sh", args, {
		cwd: packageDir,
		encoding: "utf8",
	});
	return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("migration lint (#98)", () => {
	it("fails a required column added without a default (adding-required-field)", () => {
		const { code, output } = lint("scripts/fixtures/lint/required-column-without-default.sql");
		expect(output).toContain("adding-required-field");
		expect(code).not.toBe(0);
	});

	it("would have failed #97's migration (#95), which set columns NOT NULL in one deploy (adding-not-nullable-field)", () => {
		const { code, output } = lint(
			"prisma/migrations/20261004074733_office_on_every_row/migration.sql",
		);
		expect(output).toContain("adding-not-nullable-field");
		expect(code).not.toBe(0);
	});

	it("fails a foreign key on existing rows added without NOT VALID", () => {
		const { code, output } = lint("scripts/fixtures/lint/foreign-key-on-existing-rows.sql");
		expect(output).toContain("constraint-missing-not-valid");
		expect(code).not.toBe(0);
	});

	it("passes every one-deploy change written the way the expand/contract table says", () => {
		const { code, output } = lint("scripts/fixtures/lint/expand-contract-safe.sql");
		expect(output).not.toMatch(/warning|error/);
		expect(code).toBe(0);
	});

	it("never re-lints applied migrations: with nothing added since the base, it lints nothing", () => {
		const { code, output } = lint("--since", "HEAD");
		expect(output).toContain("No new migrations");
		expect(code).toBe(0);
	});

	it("fails when it cannot tell what was added, rather than linting nothing", () => {
		const { code, output } = lint("--since", "no-such-ref");
		expect(output).not.toContain("No new migrations");
		expect(code).not.toBe(0);
	});
});
