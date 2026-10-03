/**
 * The mock CRM as a test sees it (run through tsx by `crm.ts`, like `pipe-state.ts`). The mock
 * CRM is the office's CRM for E2E: connecting an office to it is setup, and reading its leads is
 * looking at the CRM, as a manager would in HubSpot. Neither touches Nhịp's own link to a lead.
 *
 *   tsx tests/support/crm-state.ts connect <officeId>
 *   tsx tests/support/crm-state.ts leads <officeId>      prints the office's mock leads as JSON
 */
import { db } from "@repo/database";
import { createInboxStore } from "@repo/database/inbox";

async function main(): Promise<void> {
	const [command, officeId] = process.argv.slice(2);
	if (!officeId) throw new Error(`${command ?? "<command>"} <officeId>`);
	const store = createInboxStore(db);
	if (command === "connect") {
		await store.setCrmConnection(officeId, "mock");
	} else if (command === "leads") {
		process.stdout.write(JSON.stringify(await store.findMockCrmLeads(officeId)));
	} else {
		throw new Error(`unknown command ${command}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
