import { execFileSync } from "node:child_process";
import path from "node:path";

/** A lead in the mock CRM, as a manager would see it in the CRM itself. */
export type MockCrmLead = {
	id: string;
	name: string;
	/** E.164, or null. */
	phone: string | null;
	zaloUserId: string | null;
	pipe: "zalo" | "whatsapp";
	language: string | null;
	fields: Record<string, unknown> | null;
	threadUrl: string;
};

/** Setup only (see crm-state.ts): the office's CRM is the mock CRM. */
export function connectMockCrm(officeId: string): void {
	run(["connect", officeId], "inherit");
}

/** Every lead the office has in the mock CRM, oldest first. */
export function mockCrmLeads(officeId: string): MockCrmLead[] {
	return JSON.parse(run(["leads", officeId], "pipe")) as MockCrmLead[];
}

function run(args: string[], stdout: "inherit" | "pipe"): string {
	const out = execFileSync(
		"pnpm",
		["exec", "tsx", "--tsconfig", "tsconfig.json", "tests/support/crm-state.ts", ...args],
		{
			cwd: path.resolve(__dirname, "../.."),
			stdio: ["ignore", stdout, "inherit"],
			encoding: "utf8",
		},
	);
	return out ?? "";
}
