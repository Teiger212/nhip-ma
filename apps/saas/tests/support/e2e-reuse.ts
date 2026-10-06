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
const buildIdPath = path.join(saasDir, ".next", "BUILD_ID");

export const RERUN = "rerun scripts/e2e-server.sh";

export interface E2eServerState {
	port: number;
	httpsPort: number;
	/**
	 * One process group per webServer command (the build chain, then the HTTPS proxy), with
	 * its leader's start time, so a pid the system has since reused is never signalled.
	 */
	groups: { pgid: number; started: string }[];
	/** Shared by the server and the runner, as #135 requires. */
	vapid: { publicKey: string; privateKey: string };
	/** appFingerprint() when the build started. */
	fingerprint: string;
	/** envFingerprint() of the env the server was started with. */
	envHash: string;
	/** The build's .next/BUILD_ID: another build in this worktree replaces it under the server. */
	buildId: string;
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

function sha256(text: string | Buffer): string {
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
		const source = git(["rev-parse", "--path-format=absolute", "--git-path", "index"]).trim();
		const index = path.join(tmp, "index");
		fs.copyFileSync(source, index);
		// Keep the index's mtime: git rechecks "racily clean" entries (edited in the second the
		// index was written) against it, and a newer copy would take them as unchanged.
		const { atime, mtime } = fs.statSync(source);
		fs.utimesSync(index, atime, mtime);
		const env = { GIT_INDEX_FILE: index };
		git(["add", "--all", "--", ...APP_PATHS], env);
		const tree = git(["write-tree"], env).trim();
		const entries = git(["ls-tree", "-r", "-z", tree, "--", ...APP_PATHS])
			.split("\0")
			.filter((entry) => {
				const file = entry.slice(entry.indexOf("\t") + 1);
				return entry && (!file.startsWith(TESTS_DIR) || SERVER_CHAIN_TESTS.has(file));
			});
		return sha256(entries.join("\n"));
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

/**
 * A hash of the env the runner and the server must agree on, read from process.env once
 * playwright.config.ts has set it up: every .env.e2e key (a shell value overrides the file),
 * the E2E database and the app URL; and the git-ignored env files Next loads besides
 * (the root .env, apps/saas/.env*). The VAPID pair comes from the state file instead.
 */
export function envFingerprint(): string {
	const keys = Object.keys(dotenv.parse(fs.readFileSync(path.join(repoDir, ".env.e2e"))));
	const names = [...new Set([...keys, "DATABASE_URL", "NEXT_PUBLIC_SAAS_URL"])]
		.filter((name) => !name.startsWith("VAPID_"))
		.sort();
	const files = [
		path.join(repoDir, ".env"),
		...fs
			.readdirSync(saasDir)
			.filter((name) => name.startsWith(".env"))
			.sort()
			.map((name) => path.join(saasDir, name)),
	]
		.filter((file) => fs.existsSync(file))
		.map((file) => [file, sha256(fs.readFileSync(file))]);
	return sha256(JSON.stringify([names.map((name) => [name, process.env[name] ?? null]), files]));
}

/** The current build's id, or undefined before any build. */
export function currentBuildId(): string | undefined {
	return fs.existsSync(buildIdPath) ? fs.readFileSync(buildIdPath, "utf8").trim() : undefined;
}

export function readServerState(): E2eServerState | undefined {
	if (!fs.existsSync(statePath)) {
		return undefined;
	}
	try {
		return JSON.parse(fs.readFileSync(statePath, "utf8")) as E2eServerState;
	} catch {
		// Never rethrow the parser's message: it quotes the file, private key included.
		throw new Error(`The E2E server's state file is unreadable: ${RERUN}`);
	}
}

/** Written whole (a temp file renamed over it), mode 0600 from the start. */
export function writeServerState(state: E2eServerState): void {
	fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
	fs.chmodSync(stateDir, 0o700);
	const tmp = `${statePath}.${process.pid}.tmp`;
	fs.rmSync(tmp, { force: true });
	fs.writeFileSync(tmp, `${JSON.stringify(state, null, "\t")}\n`, { mode: 0o600, flag: "wx" });
	fs.renameSync(tmp, statePath);
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
 * E2E_REUSE's guard, run by the runner on every config load (its workers skip it): the
 * server is up, and was built from the app source and env there are now. Throws otherwise,
 * rather than test stale code.
 */
export function assertReusable(state: E2eServerState): void {
	if (process.env.TEST_WORKER_INDEX !== undefined) {
		return;
	}
	for (const [name, port] of [
		["E2E_PORT", state.port],
		["E2E_HTTPS_PORT", state.httpsPort],
	] as const) {
		const set = process.env[name];
		if (set && Number(set) !== port) {
			throw new Error(`E2E_REUSE: ${name} is ${set}, but the E2E server is on :${port}`);
		}
	}
	const down = healthUrls(state).filter((url) => !answers(url));
	if (down.length > 0) {
		throw new Error(`E2E_REUSE: the E2E server is not running (${down.join(", ")}): ${RERUN}`);
	}
	if (appFingerprint() !== state.fingerprint) {
		throw new Error(`E2E_REUSE: app code changed since the build: ${RERUN}`);
	}
	if (currentBuildId() !== state.buildId) {
		throw new Error(
			`E2E_REUSE: apps/saas/.next was rebuilt under the E2E server (another build in this worktree): ${RERUN}`,
		);
	}
	if (envFingerprint() !== state.envHash) {
		throw new Error(
			`E2E_REUSE: the E2E env (.env.local's E2E database, an env file or a shell value) changed since the build: ${RERUN}`,
		);
	}
}
