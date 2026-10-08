/**
 * The state process (#203): one long-lived tsx process per Playwright worker, started by
 * `state-client.ts`, through which the support helpers set up and read the database. It runs
 * through tsx because the Prisma client is ESM, which Playwright's own loader cannot import, and
 * lives as long as the worker, so tsx and Prisma boot once per worker rather than once per call.
 *
 * Reads one JSON request per line on stdin, `{ id, command, args }` (args are strings), and
 * answers each on stdout with a line `@@state {"id", "result"}` or `@@state {"id", "error"}`;
 * `@@state {"ready": true}` says it has loaded. Anything else on stdout (a library's notice) is
 * not an answer. Requests run as they come, each its own query: nothing is cached. Exits when
 * stdin closes.
 */
import readline from "node:readline";

import { signedUp } from "./accounts";
import { officeAlerts, operatorDevices } from "./alert-state";
import {
	connectOfficeToMockCrm,
	markMockCrmLead,
	mockCrmLeadsOf,
	passCrmRetryWait,
	setMockCrmDown,
	setMockCrmLeadZaloId,
} from "./crm-state";
import { deletionRecords, holdReply, releaseReply } from "./deletion-state";
import { writeZaloGuests } from "./guest-state";
import { connectWhatsApp, connectZalo, releaseZalo } from "./pipe-state";
import { setTranslateCalls } from "./translation-state";

const ANSWER = "@@state ";

/** What a test may ask, by the name `askState` sends. */
const COMMANDS: Record<string, (...args: string[]) => Promise<unknown>> = {
	account: signedUp,
	"alerts.alerts": officeAlerts,
	"alerts.devices": operatorDevices,
	"crm.availability": setMockCrmDown,
	"crm.connect": connectOfficeToMockCrm,
	"crm.lead-zalo-id": setMockCrmLeadZaloId,
	"crm.leads": mockCrmLeadsOf,
	"crm.outcome": markMockCrmLead,
	"crm.retry-wait-passes": passCrmRetryWait,
	"deletion.hold": holdReply,
	"deletion.records": deletionRecords,
	"deletion.release": releaseReply,
	"guests.seed": writeZaloGuests,
	"pipes.connect": connectZalo,
	"pipes.connect-whatsapp": connectWhatsApp,
	"pipes.release": releaseZalo,
	"translations.today": setTranslateCalls,
};

type Request = { id: number; command: string; args: string[] };

/** Writes one answer; a result JSON cannot carry becomes the call's error, not a crash. */
function answer(body: { id?: number; result?: unknown; error?: string; ready?: true }) {
	let line: string;
	try {
		line = JSON.stringify(body);
	} catch (error) {
		line = JSON.stringify({
			id: body.id,
			error: `its result is not JSON: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
	process.stdout.write(`${ANSWER}${line}\n`);
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
	if (!line.trim()) return;
	let request: Partial<Request>;
	try {
		request = JSON.parse(line) as Partial<Request>;
	} catch {
		// No id to answer: the caller's own timeout names the call.
		console.error(`state-process: not JSON: ${line.slice(0, 200)}`);
		return;
	}
	const { id, command, args } = request;
	if (typeof id !== "number") {
		console.error(`state-process: a request with no id: ${line.slice(0, 200)}`);
		return;
	}
	if (
		typeof command !== "string" ||
		!Array.isArray(args) ||
		!args.every((arg) => typeof arg === "string")
	) {
		answer({ id, error: `not a request (its arguments must be strings): ${line.slice(0, 200)}` });
		return;
	}
	const run = COMMANDS[command];
	if (!run) {
		answer({ id, error: `unknown command ${command}` });
		return;
	}
	Promise.resolve()
		.then(() => run(...args))
		.then(
			(result) => answer({ id, result }),
			(error: unknown) => {
				console.error(`state-process: ${command} failed`, error);
				answer({ id, error: error instanceof Error ? error.message : String(error) });
			},
		);
});
lines.on("close", () => process.exit(0));
answer({ ready: true });
