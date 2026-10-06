/**
 * Build once per worktree, run many spec files against it (#205; AGENTS.md, "How E2E runs").
 * `scripts/e2e-server.sh` starts the E2E server and leaves its state here; `E2E_REUSE=1` in
 * playwright.config.ts reads it, and refuses to run against a build of other app code.
 *
 * The state file holds the server's VAPID private key: it lives in a git-ignored folder, is
 * written mode 0600, and is never printed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import dotenv from "dotenv";

export const saasDir = path.resolve(__dirname, "../..");
const repoDir = path.resolve(saasDir, "../..");
/** Git-ignored (apps/saas/.gitignore): the state file and the server's logs. */
export const stateDir = path.join(saasDir, ".e2e-server");
export const statePath = path.join(stateDir, "state.json");

export const RERUN = "rerun scripts/e2e-server.sh";

export interface E2eServerState {
	port: number;
	httpsPort: number;
	/** One process group per webServer command (the build chain, then the HTTPS proxy). */
	pgids: number[];
	/** Shared by the server and the runner, as #135 requires. */
	vapid: { publicKey: string; privateKey: string };
	/** appFingerprint() when the build started. */
	fingerprint: string;
	/** envFingerprint() of the env the server was started with. */
	envHash: string;
	startedAt: string;
}

/**
 * What the server is built and run from: the app, the workspace packages and tooling it
 * builds with, its env file and dependencies. The app's tests are not, except the two files
 * the server chain itself runs: a spec change never needs a rebuild.
 */
const APP_PATHS = [
	"apps/saas",
	"packages",
	"tooling",
	".env.e2e",
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
];
const TESTS_DIR = "apps/saas/tests/";
const SERVER_CHAIN_TESTS = new Set([
	"apps/saas/tests/support/ensure-e2e-db.ts",
	"apps/saas/tests/support/https-proxy.mjs",
]);

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/**
 * A hash of the app source as it is on disk: committed, staged, unstaged and untracked files
 * alike (git-ignored ones aren't source), by content, so undoing an edit matches again. Git
 * stages APP_PATHS into a throwaway copy of the worktree's index, so only changed files are
 * read, and the real index is never touched.
 */
export function appFingerprint(): string {
	const git = (args: string[], env: Record<string, string> = {}) =>
		execFileSync("git", args, {
			cwd: repoDir,
			env: { ...process.env, ...env },
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-e2e-fp-"));
	try {
		const index = path.join(tmp, "index");
		fs.copyFileSync(
			git(["rev-parse", "--path-format=absolute", "--git-path", "index"]).trim(),
			index,
		);
		const env = { GIT_INDEX_FILE: index };
		git(["add", "--all", "--", ...APP_PATHS], env);
		const tree = git(["write-tree"], env).trim();
		const entries = git(["ls-tree", "-r", tree, "--", ...APP_PATHS])
			.split("\n")
			.filter((line) => {
				const file = line.split("\t")[1];
				return file && (!file.startsWith(TESTS_DIR) || SERVER_CHAIN_TESTS.has(file));
			});
		return sha256(entries.join("\n"));
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

/**
 * A hash of the env the runner and the server must agree on, read from process.env once
 * playwright.config.ts has set it up: every .env.e2e key (a shell value overrides the file),
 * the E2E database and the app URL. The VAPID pair comes from the state file instead.
 */
export function envFingerprint(): string {
	const keys = Object.keys(dotenv.parse(fs.readFileSync(path.join(repoDir, ".env.e2e"))));
	const names = [...new Set([...keys, "DATABASE_URL", "NEXT_PUBLIC_SAAS_URL"])]
		.filter((name) => !name.startsWith("VAPID_"))
		.sort();
	return sha256(JSON.stringify(names.map((name) => [name, process.env[name] ?? null])));
}

export function readServerState(): E2eServerState | undefined {
	if (!fs.existsSync(statePath)) {
		return undefined;
	}
	return JSON.parse(fs.readFileSync(statePath, "utf8")) as E2eServerState;
}

export function writeServerState(state: E2eServerState): void {
	fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(statePath, `${JSON.stringify(state, null, "\t")}\n`, { mode: 0o600 });
	fs.chmodSync(statePath, 0o600);
}

export function healthUrls(state: Pick<E2eServerState, "port" | "httpsPort">): string[] {
	return [
		`http://localhost:${state.port}/api/auth/ok`,
		`https://localhost:${state.httpsPort}/api/auth/ok`,
	];
}

/** Whether the URL answers 2xx, as Playwright's webServer check does (self-signed TLS is fine). */
export function answers(url: string): boolean {
	return spawnSync("curl", ["-sfk", "-o", "/dev/null", "--max-time", "3", url]).status === 0;
}

/**
 * E2E_REUSE's guard, run once per `playwright test` (its workers inherit the result): the
 * server is up, and was built from the app source and env there are now. Throws otherwise,
 * rather than test stale code.
 */
export function assertReusable(state: E2eServerState): void {
	if (process.env.E2E_REUSE_CHECKED === state.startedAt) {
		return;
	}
	if (process.env.E2E_PORT && Number(process.env.E2E_PORT) !== state.port) {
		throw new Error(
			`E2E_REUSE: E2E_PORT is ${process.env.E2E_PORT}, but the E2E server is on :${state.port}`,
		);
	}
	const down = healthUrls(state).filter((url) => !answers(url));
	if (down.length > 0) {
		throw new Error(`E2E_REUSE: the E2E server is not running (${down.join(", ")}): ${RERUN}`);
	}
	if (appFingerprint() !== state.fingerprint) {
		throw new Error(`E2E_REUSE: app code changed since the build: ${RERUN}`);
	}
	if (envFingerprint() !== state.envHash) {
		throw new Error(
			`E2E_REUSE: the E2E env (.env.local's E2E database, .env.e2e or a shell value) changed since the build: ${RERUN}`,
		);
	}
	process.env.E2E_REUSE_CHECKED = state.startedAt;
}
