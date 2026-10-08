/**
 * The office's translations for the day (ADR 0024's daily caps; run in the state process,
 * state-process.ts, for `translations.ts`). Spending them is setup: no person spends a thousand
 * translations in a test.
 */
import { db } from "@repo/database";

/** The office's calendar day, as the caps count it: midnight to midnight in Asia/Ho_Chi_Minh. */
function officeDay(): Date {
	const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
	return new Date(`${ymd}T00:00:00.000Z`);
}

/** The office has made `calls` translations today, whatever it had made before. */
export async function setTranslateCalls(officeId: string, calls: string): Promise<void> {
	const count = Number(calls);
	if (!Number.isInteger(count) || count < 0) throw new Error(`not a count of calls: ${calls}`);
	const day = officeDay();
	await db.modelUsage.upsert({
		where: { officeId_day_task: { officeId, day, task: "translate" } },
		create: { officeId, day, task: "translate", calls: count },
		update: { calls: count },
	});
}
