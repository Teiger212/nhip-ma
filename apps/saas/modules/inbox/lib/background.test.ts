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

test("a failed job logs its label and the error's kind, never the error's message (#220)", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	await runInBackground("translate", async () => {
		throw new TypeError("thread ywh8noalsll0rc8icao9zu1b, guest 3891748223501947521: thuê nhà");
	});
	expect(warn).toHaveBeenCalledExactlyOnceWith("inbox background job failed: translate", {
		kind: "TypeError",
	});
});
