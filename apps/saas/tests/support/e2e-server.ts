/**
 * The E2E server for `E2E_REUSE=1` (#205): build once per worktree, run many spec files
 * against it. Run through scripts/e2e-server.sh.
 *
 *   start    stop any server it started, then run playwright.config.ts's own webServer
 *            commands, with its env, in the background; wait for them; write the state file
 *   status   ports, whether it answers, whether the app source still matches the build
 *   stop     stop it and remove the state file (and with it the VAPID private key)
 *
 * The chain and its env come from importing playwright.config.ts in its default mode, so
 * they can never drift from what a fresh run does.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import {
	answers,
	appFingerprint,
	currentBuildId,
	envFingerprint,
	healthUrls,
	readServerState,
	RERUN,
	saasDir,
	stateDir,
	statePath,
	writeServerState,
	type E2eServerState,
} from "./e2e-reuse";

interface WebServer {
	command: string;
	url: string;
	env?: Record<string, string>;
	timeout?: number;
}

type Group = E2eServerState["groups"][number];

const say = (line: string) => process.stdout.write(`${line}\n`);

function groupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(-pgid, signal);
	} catch {
		// Already gone.
	}
}

/** The process's start time (ps lstart; an exec keeps it), or undefined once it is gone. */
function startTime(pid: number): string | undefined {
	const ps = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
	return ps.status === 0 ? ps.stdout.trim() || undefined : undefined;
}

/**
 * Whether a recorded group is still ours (a stale state file can outlive a reboot): it exists,
 * and its leader is the process we started, or gone (a pgid is never reused while its group
 * lives).
 */
function ours(group: Group): boolean {
	if (!groupAlive(group.pgid)) {
		return false;
	}
	const started = startTime(group.pgid);
	return started === undefined || started === group.started;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stops each process group still ours: SIGTERM, then SIGKILL after 10 s. */
async function stopGroups(groups: Group[]): Promise<void> {
	const pgids = groups.filter(ours).map((group) => group.pgid);
	for (const pgid of pgids) {
		signalGroup(pgid, "SIGTERM");
	}
	for (let waited = 0; waited < 10_000 && pgids.some(groupAlive); waited += 250) {
		await sleep(250);
	}
	for (const pgid of pgids.filter(groupAlive)) {
		signalGroup(pgid, "SIGKILL");
	}
	for (let waited = 0; waited < 5_000 && pgids.some(groupAlive); waited += 250) {
		await sleep(250);
	}
}

function portFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.once("error", () => resolve(false));
		probe.listen(port, () => probe.close(() => resolve(true)));
	});
}

async function stop(): Promise<void> {
	const state = readServerState();
	if (!state) {
		say("No E2E server to stop.");
		return;
	}
	await stopGroups(state.groups);
	const alive = state.groups.filter(ours).map((group) => group.pgid);
	const taken = [];
	for (const port of [state.port, state.httpsPort]) {
		if (!(await portFree(port))) {
			taken.push(port);
		}
	}
	if (alive.length > 0 || taken.length > 0) {
		// The state file stays, so --stop can try again.
		throw new Error(
			`Could not stop the E2E server: process groups ${alive.join(", ") || "none"} remain and ports ${taken.join(", ") || "none"} are still taken`,
		);
	}
	fs.rmSync(statePath, { force: true });
	say(`Stopped the E2E server on :${state.port} and :${state.httpsPort}.`);
}

function logTail(file: string): string {
	return fs.readFileSync(file, "utf8").split("\n").slice(-30).join("\n");
}

/** Waits for the URL to answer, as Playwright's webServer does; fails if the command exits. */
async function waitFor(server: WebServer, exited: () => number | null, log: string) {
	const deadline = Date.now() + (server.timeout ?? 60_000);
	while (Date.now() < deadline) {
		if (answers(server.url)) {
			return;
		}
		const code = exited();
		if (code !== null) {
			throw new Error(
				`\`${server.command}\` exited (${code}). Last lines of ${log}:\n${logTail(log)}`,
			);
		}
		await sleep(1_000);
	}
	throw new Error(`${server.url} did not answer in time. Last lines of ${log}:\n${logTail(log)}`);
}

/**
 * Imports playwright.config.ts in its default mode (never reuse, never a dev server), which
 * sets up its env in process.env, and returns its webServer commands.
 */
async function loadDefaultConfig(): Promise<WebServer[]> {
	delete process.env.E2E_REUSE;
	delete process.env.E2E_BASE_URL;
	const imported = (await import("../../playwright.config")) as {
		default: { default?: { webServer?: unknown }; webServer?: unknown };
	};
	const config = imported.default.default ?? imported.default;
	return config.webServer as WebServer[];
}

async function start(): Promise<void> {
	if (readServerState()) {
		await stop();
	}
	const fingerprint = appFingerprint();
	const servers = await loadDefaultConfig();
	const port = Number(servers[0].env?.PORT);
	const httpsPort = Number(new URL(servers[1].url).port);
	for (const taken of [port, httpsPort]) {
		if (!(await portFree(taken))) {
			throw new Error(`Port ${taken} is taken: set E2E_PORT to move the E2E server`);
		}
	}
	const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
	const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
	if (!vapidPublicKey || !vapidPrivateKey) {
		throw new Error("playwright.config.ts set no VAPID pair");
	}
	const state: E2eServerState = {
		port,
		httpsPort,
		groups: [],
		vapid: { publicKey: vapidPublicKey, privateKey: vapidPrivateKey },
		fingerprint,
		envHash: envFingerprint(),
		buildId: "",
		startedAt: new Date().toISOString(),
	};
	fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
	// Ctrl-C mid-build: the chain runs in its own process groups, so stop them too.
	const interrupted = () => {
		void stopGroups(state.groups).then(() => {
			fs.rmSync(statePath, { force: true });
			process.exit(130);
		});
	};
	process.once("SIGINT", interrupted);
	process.once("SIGTERM", interrupted);
	try {
		for (const [i, server] of servers.entries()) {
			const log = path.join(stateDir, `server-${i}.log`);
			const out = fs.openSync(log, "w");
			const child = spawn(server.command, {
				shell: true,
				cwd: saasDir,
				env: { ...process.env, ...server.env },
				detached: true,
				stdio: ["ignore", out, out],
			});
			fs.closeSync(out);
			if (child.pid === undefined) {
				throw new Error(`Could not start \`${server.command}\``);
			}
			child.unref();
			state.groups.push({ pgid: child.pid, started: startTime(child.pid) ?? "" });
			// Written before the wait, so --stop finds a chain that failed half way.
			writeServerState(state);
			say(`Starting \`${server.command}\` (log: ${path.relative(process.cwd(), log)})`);
			await waitFor(server, () => child.exitCode ?? (child.signalCode ? 1 : null), log);
		}
		if (appFingerprint() !== fingerprint) {
			throw new Error(`The app source changed during the build: ${RERUN}`);
		}
		const buildId = currentBuildId();
		if (!buildId) {
			throw new Error("The build left no apps/saas/.next/BUILD_ID");
		}
		state.buildId = buildId;
		writeServerState(state);
	} catch (error) {
		await stopGroups(state.groups);
		fs.rmSync(statePath, { force: true });
		throw error;
	}
	say(`E2E server up: https://localhost:${httpsPort} (build on :${port}).`);
	say("Run spec files against it from apps/saas: E2E_REUSE=1 pnpm exec playwright test <file>");
}

async function status(): Promise<boolean> {
	const state = readServerState();
	if (!state) {
		say("No E2E server (scripts/e2e-server.sh starts one).");
		return false;
	}
	// The env a run against it would have: the default mode's, on its ports.
	process.env.E2E_PORT = String(state.port);
	process.env.E2E_HTTPS_PORT = String(state.httpsPort);
	await loadDefaultConfig();
	const up = healthUrls(state).every(answers);
	const fresh = appFingerprint() === state.fingerprint;
	const sameEnv = envFingerprint() === state.envHash;
	const sameBuild = currentBuildId() === state.buildId;
	say(`E2E server: https://localhost:${state.httpsPort} -> :${state.port}`);
	say(`  started:        ${state.startedAt}`);
	say(
		`  process groups: ${state.groups.map((g) => `${g.pgid}${ours(g) ? "" : " (gone)"}`).join(", ")}`,
	);
	say(`  answering:      ${up ? "yes" : "no"}`);
	say(`  app source:     ${fresh ? "matches the build" : `changed since the build: ${RERUN}`}`);
	say(`  env:            ${sameEnv ? "matches the build" : `changed since the build: ${RERUN}`}`);
	say(
		`  .next:          ${sameBuild ? "the server's build" : `rebuilt under the server: ${RERUN}`}`,
	);
	say(`  VAPID public:   ${state.vapid.publicKey}`);
	return up && fresh && sameEnv && sameBuild;
}

async function main(): Promise<void> {
	const command = process.argv[2] ?? "start";
	if (command === "start") {
		await start();
	} else if (command === "stop") {
		await stop();
	} else if (command === "status") {
		process.exitCode = (await status()) ? 0 : 1;
	} else {
		throw new Error(`Unknown command ${command}: start, status or stop`);
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
