/** What the bell needs of a notification row to group it. */
type Groupable = { type: string; read: boolean };

/** One line of the bell: a notification, or a run of threads given to the reader. */
export type BellLine<T extends Groupable> =
	| { kind: "one"; row: T }
	| { kind: "assigned"; rows: T[]; read: boolean };

/**
 * The bell's lines, newest first as the rows come (#94). Back-to-back "A manager gave you a
 * thread" rows fold into one line ("5 conversations were assigned to you"), which is unread while any
 * of them is: seven identical titles say less than one count. A lone one stays its own row, with
 * its link to the thread; anything between two runs keeps them apart, so the order still reads
 * as what happened.
 */
export function bellLines<T extends Groupable>(rows: readonly T[]): BellLine<T>[] {
	const lines: BellLine<T>[] = [];
	let run: T[] = [];
	const close = () => {
		if (run.length === 1) lines.push({ kind: "one", row: run[0] });
		if (run.length > 1) {
			lines.push({ kind: "assigned", rows: run, read: run.every((row) => row.read) });
		}
		run = [];
	};
	for (const row of rows) {
		if (row.type === "THREAD_ASSIGNED") {
			run.push(row);
			continue;
		}
		close();
		lines.push({ kind: "one", row });
	}
	close();
	return lines;
}
