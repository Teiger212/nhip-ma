import { getRuntime } from "../lib/runtime";
import { seedInbox } from "../lib/seed";

async function main(): Promise<void> {
	const conversations = await seedInbox();
	for (const conv of conversations) {
		const q = conv.oneShot?.qualification;
		const paper = conv.oneShot?.paperwork?.mentioned ? "paperwork flagged" : "no paperwork";
		console.info(
			`${conv.id}  ${conv.guestName}  ${q?.rentOrBuy ?? "—"}  ${q?.timeframe ?? "—"}  ${q?.areaOfInterest ?? "—"}  ${paper}`,
		);
	}
	console.info(`\n${conversations.length} demo threads in ${getRuntime().store.filePath}`);
	console.info("Open http://localhost:3010 — the inbox. Nothing here is a real guest.");
	await getRuntime().store.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
