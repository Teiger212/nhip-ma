import { expect, test } from "vitest";

import { bellLines } from "./bell-rows";

const row = (id: string, type: string, read = false) => ({ id, type, read });

// rule: #94 "Bell rows": repeats are grouped ("5 threads were assigned to you").
test("back-to-back assignments fold into one line, unread while any of them is", () => {
	const lines = bellLines([
		row("a", "THREAD_ASSIGNED", true),
		row("b", "THREAD_ASSIGNED"),
		row("c", "THREAD_ASSIGNED", true),
	]);
	expect(lines).toHaveLength(1);
	expect(lines[0]).toMatchObject({ kind: "assigned", read: false });
	expect(lines[0].kind === "assigned" && lines[0].rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
});

test("a lone assignment stays its own row, and another kind of row keeps two runs apart", () => {
	const lines = bellLines([
		row("a", "THREAD_ASSIGNED"),
		row("m", "THREAD_MOVED"),
		row("b", "THREAD_ASSIGNED", true),
		row("c", "THREAD_ASSIGNED", true),
	]);
	expect(lines.map((line) => line.kind)).toEqual(["one", "one", "assigned"]);
	expect(lines[2]).toMatchObject({ read: true });
});
