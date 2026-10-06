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
import { connectOfficeToMockCrm, markMockCrmLead, mockCrmLeadsOf } from "./crm-state";
import { deletionRecords, holdReply, releaseReply } from "./deletion-state";
import { connectWhatsApp, connectZalo, releaseZalo } from "./pipe-state";

const ANSWER = "@@state ";

/** What a test may ask, by the name `askState` sends. */
const COMMANDS: Record<string, (...args: string[]) => Promise<unknown>> = {
	account: signedUp,
	"alerts.alerts": officeAlerts,
	"alerts.devices": operatorDevices,
	"crm.connect": connectOfficeToMockCrm,
	"crm.leads": mockCrmLeadsOf,
	"crm.outcome": markMockCrmLead,
	"deletion.hold": holdReply,
	"deletion.records": deletionRecords,
	"deletion.release": releaseReply,
	"pipes.connect": connectZalo,
	"pipes.connect-whatsapp": connectWhatsApp,
	"pipes.release": releaseZalo,
};

type Request = { id: number; command: string; args: string[] };

function answer(body: Record<string, unknown>) {
	process.stdout.write(`${ANSWER}${JSON.stringify(body)}\n`);
}

function parse(line: string): Request {
	const request = JSON.parse(line) as Partial<Request>;
	if (
		typeof request.id !== "number" ||
		typeof request.command !== "string" ||
		!Array.isArray(request.args) ||
		!request.args.every((arg) => typeof arg === "string")
	) {
		throw new Error(`not a request: ${line.slice(0, 200)}`);
	}
	return request as Request;
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
	if (!line.trim()) return;
	let request: Request;
	try {
		request = parse(line);
	} catch (error) {
		// No id to answer: the caller's own timeout names the call.
		console.error("state-process:", error instanceof Error ? error.message : error);
		return;
	}
	const { id, command, args } = request;
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
