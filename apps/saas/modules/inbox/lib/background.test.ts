import { afterEach, expect, test, vi } from "vitest";

const after = vi.fn();
vi.mock("next/server", () => ({ after: (task: unknown) => after(task) }));

import { runInBackground, settleBackgroundWork } from "./background";

afterEach(() => {
	after.mockReset();
});

test("inside a request, the job is handed to after() so the platform keeps it alive", async () => {
	let done = false;
	const job = runInBackground("test", async () => {
		done = true;
	});
	expect(after).toHaveBeenCalledTimes(1);
	const handed = after.mock.calls[0][0] as () => Promise<void>;
	await handed();
	await job;
	expect(done).toBe(true);
});

test("outside a request (scripts, tests), after() throws and the job still runs and settles", async () => {
	after.mockImplementation(() => {
		throw new Error("`after` was called outside a request scope");
	});
	let done = false;
	void runInBackground("script", async () => {
		done = true;
	});
	await settleBackgroundWork();
	expect(done).toBe(true);
});
