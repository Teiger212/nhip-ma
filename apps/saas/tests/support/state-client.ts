/**
 * The Playwright side of the state process (state-process.ts, #203): this worker's one long-lived
 * tsx process, through which the support helpers set up and read the database. One process per
 * worker, not a `pnpm exec tsx` spawn per call: each spawn boots tsx and Prisma, about 2 s on CI.
 *
 * Every call is its own request and its own query; nothing is cached here or there, so a read
 * sees the database as it is when the test asks.
 *
 * A dying process never hangs a test: every waiting call fails with the reason (its exit, a
 * spawn or pipe error), a process that does not start fails the call after BOOT_TIMEOUT_MS, and
 * an unanswered call fails after ANSWER_TIMEOUT_MS. Either way the process is ended, and the
 * next call starts a new one.
 */
import type { ChildProcessByStdio } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import type { Readable, Writable } from "node:stream";

/** Marks the process's own lines on stdout; anything else there is passed through. */
const ANSWER = "@@state ";

/** How long the process may take to load tsx, Prisma and Better Auth. */
const BOOT_TIMEOUT_MS = 20_000;

/**
 * How long one answer may take: a query takes milliseconds. Below Playwright's 30 s test
 * timeout, so a stuck call fails naming itself, not as a bare test timeout.
 */
const ANSWER_TIMEOUT_MS = 10_000;

type Answer = { id: number; result?: unknown; error?: string };

type StateProcess = {
	child: ChildProcessByStdio<Writable, Readable, null>;
	waiting: Map<number, (answer: Answer) => void>;
	next: number;
	/** Settles once the process has loaded, or has died. */
	ready: Promise<void>;
	/** Why it can no longer answer, once it can't. */
	dead?: string;
};

/** This worker's state process, started on first use, and again if it died. */
let current: StateProcess | undefined;

function stateProcess(): StateProcess {
	if (current && !current.dead) return current;
	const saas = path.resolve(__dirname, "../..");
	const child = spawn(
		path.join(saas, "node_modules/.bin/tsx"),
		["--tsconfig", "tsconfig.json", "tests/support/state-process.ts"],
		{ cwd: saas, stdio: ["pipe", "pipe", "inherit"] },
	);
	let loaded = () => {};
	const proc: StateProcess = {
		child,
		waiting: new Map(),
		next: 1,
		ready: new Promise<void>((resolve) => {
			loaded = resolve;
		}),
	};
	// Every waiter fails with the reason, rather than the test timing out with nothing to go on.
	const die = (reason: string) => {
		proc.dead ??= reason;
		for (const [id, settle] of proc.waiting) {
			settle({ id, error: `the state process ${proc.dead}` });
		}
		proc.waiting.clear();
		loaded();
	};
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		if (!line.startsWith(ANSWER)) {
			process.stdout.write(`${line}\n`);
			return;
		}
		let answer: Answer & { ready?: true };
		try {
			answer = JSON.parse(line.slice(ANSWER.length)) as Answer & { ready?: true };
		} catch {
			die(`answered something unreadable: ${line.slice(0, 200)}`);
			child.kill();
			return;
		}
		if (answer.ready) {
			loaded();
			return;
		}
		proc.waiting.get(answer.id)?.(answer);
		proc.waiting.delete(answer.id);
	});
	child.on("exit", (code, signal) => die(`exited (${signal ?? code})`));
	child.on("error", (error) => die(`could not run: ${error.message}`));
	child.stdin.on("error", (error) => die(`stopped reading: ${error.message}`));
	// Nothing here keeps the worker alive or outlives it: Playwright ends the worker with
	// process.exit, which closes the child's stdin, and state-process.ts exits when stdin closes.
	child.unref();
	current = proc;
	return proc;
}

/** Waits for `promise`, or rejects with `message` after `ms`. */
async function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Runs `command` (state-process.ts's COMMANDS) with `args` in this worker's state process and
 * answers its result, as JSON carries it (a date is an ISO string). Throws with the process's
 * own error, naming the call, if it fails or no answer comes.
 */
export async function askState<T = void>(command: string, ...args: string[]): Promise<T> {
	const call = [command, ...args].join(" ");
	const proc = stateProcess();
	try {
		await within(
			proc.ready,
			BOOT_TIMEOUT_MS,
			`the state process did not start in ${BOOT_TIMEOUT_MS / 1000} s`,
		);
	} catch (error) {
		// A process that never loads is ended, so the next call starts a new one.
		proc.dead ??= `did not start in ${BOOT_TIMEOUT_MS / 1000} s`;
		proc.child.kill();
		throw new Error(`${call}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (proc.dead) throw new Error(`${call}: the state process ${proc.dead}`);
	const id = proc.next++;
	const answer = await new Promise<Answer>((resolve) => {
		const timer = setTimeout(() => {
			proc.waiting.delete(id);
			// A process that stops answering is ended, so the next call starts a new one.
			proc.dead ??= `stopped answering (${call})`;
			proc.child.kill();
			resolve({ id, error: `the state process did not answer in ${ANSWER_TIMEOUT_MS / 1000} s` });
		}, ANSWER_TIMEOUT_MS);
		proc.waiting.set(id, (settled) => {
			clearTimeout(timer);
			resolve(settled);
		});
		proc.child.stdin.write(`${JSON.stringify({ id, command, args })}\n`);
	});
	if (answer.error !== undefined) throw new Error(`${call}: ${answer.error}`);
	return answer.result as T;
}
