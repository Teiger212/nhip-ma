import { after } from "next/server";

/**
 * Work that follows an inbound but must not block it (ADR 0007): translation and the
 * model draft. A route handler starts it and returns; the UI picks the result up on its
 * next fetch. Inside a request the job is handed to `after()`, so a serverless platform
 * keeps the function alive until it finishes (ADR 0016). Every job is also tracked so
 * tests and scripts can wait for the queue to drain, and a failed job is logged rather
 * than surfaced, because the fallback (no translation, the template draft) is already in
 * place before the job starts.
 */
const pending = new Set<Promise<void>>();

export function runInBackground(label: string, work: () => Promise<void>): Promise<void> {
	const job: Promise<void> = work()
		.catch((error: unknown) => {
			console.warn(`inbox background job failed: ${label}`, {
				reason: error instanceof Error ? error.message : String(error),
			});
		})
		.finally(() => {
			pending.delete(job);
		});
	pending.add(job);
	try {
		after(() => job);
	} catch {
		// Outside a request (scripts, tests) there is nothing to extend; `pending` tracks it.
	}
	return job;
}

/** Waits until no background job is running, including jobs started by other jobs. */
export async function settleBackgroundWork(): Promise<void> {
	while (pending.size > 0) {
		await Promise.allSettled([...pending]);
	}
}
