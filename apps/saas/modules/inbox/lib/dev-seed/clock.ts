/**
 * The seed's clock (#69). A guest's story is played step by step through the app's own calls,
 * and several of them stamp the time themselves (an approval, a send, the one-shot, the
 * greeting's claim, a CRM link, a bell row). Each step runs with the process clock set to when
 * it happened, so those rows carry the story's times: Home's response time and leads by day get
 * their shape, and a reply lands after the message it answers. Nothing else changes: every row
 * is still written by the store's own functions under its own rules.
 *
 * Only `new Date()` and `Date.now()` move; a date built from a value is that value. One step at a
 * time: nothing may run concurrently under a moved clock, and the real one is always put back.
 */
const RealDate = Date;

let offsetMs = 0;
let moved = false;

class StoryDate extends RealDate {
	constructor(...args: unknown[]) {
		if (args.length === 0) {
			super(RealDate.now() + offsetMs);
		} else {
			// Every other form (a value, or year, month, ...) is the real Date's.
			super(...(args as [string | number | Date]));
		}
	}

	static now(): number {
		return RealDate.now() + offsetMs;
	}
}

/** Runs `step` as if it were `at` (epoch ms); the clock runs on from there while it does. */
export async function atTime<T>(at: number, step: () => Promise<T>): Promise<T> {
	if (moved) throw new Error("dev seed: one story step at a time");
	moved = true;
	offsetMs = at - RealDate.now();
	globalThis.Date = StoryDate as DateConstructor;
	try {
		return await step();
	} finally {
		globalThis.Date = RealDate;
		offsetMs = 0;
		moved = false;
	}
}
