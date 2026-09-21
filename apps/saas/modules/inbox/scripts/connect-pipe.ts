import { Pipe } from "@repo/database/inbox";

import { getRuntime } from "../lib/runtime";

/**
 * Tell the inbox which office owns a pipe endpoint (ADR 0008), so webhooks from it are
 * filed under that office. Until a pipe is connected, its inbounds are dropped.
 *
 *   pnpm --filter saas pipe:connect -- --pipe whatsapp --external-id <phone_number_id> --office <organization id>
 *   pnpm --filter saas pipe:connect -- --pipe zalo --external-id <oa id> --office <organization id>
 */
function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
	const pipe = Pipe.safeParse(arg("pipe"));
	const externalId = arg("external-id");
	const officeId = arg("office");
	if (!pipe.success || !externalId || !officeId) {
		console.error(
			`usage: --pipe (${Pipe.options.join("|")}) --external-id <vendor id of the office's number or OA> --office <organization id>`,
		);
		process.exit(2);
	}
	const { store } = getRuntime();
	await store.connectPipe({ pipe: pipe.data, externalId, officeId });
	console.info("Pipe connections:");
	for (const connection of await store.listPipeConnections()) {
		console.info(`  ${connection.pipe}  ${connection.externalId}  ->  ${connection.officeId}`);
	}
	await store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
