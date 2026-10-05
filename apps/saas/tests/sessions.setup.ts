import { execFileSync } from "node:child_process";
import path from "node:path";

import { test as setup } from "@playwright/test";

// Mints a session per seeded login before the specs run (tests/support/test-auth.ts).
setup("mint sessions for the seeded logins", () => {
	execFileSync(
		"pnpm",
		["exec", "tsx", "--tsconfig", "tsconfig.json", "tests/support/test-auth.ts"],
		{
			cwd: path.resolve(__dirname, ".."),
			stdio: "inherit",
		},
	);
});
