import { execFileSync } from "node:child_process";
import path from "node:path";

/** Setup only (see pipe-state.ts): an office's Zalo OA, connected or already disconnected. */
export function connectZaloOa(officeId: string, oaId: string, state?: "disconnected") {
	run(["connect", officeId, oaId, ...(state ? [state] : [])]);
}

/** Setup/cleanup: the office no longer holds the OA. */
export function releaseZaloOa(oaId: string) {
	run(["release", oaId]);
}

function run(args: string[]) {
	execFileSync(
		"pnpm",
		["exec", "tsx", "--tsconfig", "tsconfig.json", "tests/support/pipe-state.ts", ...args],
		{ cwd: path.resolve(__dirname, "../.."), stdio: "inherit" },
	);
}
