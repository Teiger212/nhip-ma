"use client";

import {
	addTransitionType,
	startTransition,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { usePrefetchConversation } from "./inbox-queries";
import { HANDOFF_BEAT_MS } from "./motion";
import { type HeldRow, nextSelection, type QueueView } from "./queue";
import type { ConversationSummary } from "./types";

/**
 * The handoff after a send in Your turn or Unassigned (#330, #337; DESIGN.md "Motion"). The
 * answered thread holds its place in the list through the send (the data drops it before the
 * send's promise resolves), then says ✓ Sent for a beat; then one React transition, typed
 * `handoff`, takes it away while the rows below close up (ThreadList's View Transitions) and
 * the selection moves to the thread that was below it. The next thread is fetched during the
 * beat, so the card shows it whole at once.
 *
 * `latestList` is the list as the selection last saw it and `selection` the thread open now,
 * both read when needed; `onMoveOn` gets the thread to open, or null when none waits, inside the
 * transition. The selection moves on only if it is still on the answered thread: whatever the
 * operator opened meanwhile (a row, a toast, a link) stays open.
 */
export function useHandoff({
	latestList,
	selection,
	onMoveOn,
}: {
	latestList: () => ConversationSummary[];
	selection: () => string | null;
	onMoveOn: (next: string | null) => void;
}) {
	const [held, setHeld] = useState<HeldRow | null>(null);
	const prefetch = usePrefetchConversation();
	// Each send, and each release, bumps the run: a beat that ends under a newer run still takes
	// its row away, but no longer moves the selection.
	const run = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	// The caller's latest callbacks, for a beat that ends after later renders.
	const callbacks = useRef({ latestList, selection, onMoveOn });
	useLayoutEffect(() => {
		callbacks.current = { latestList, selection, onMoveOn };
	});
	useEffect(() => () => clearTimeout(timer.current), []);

	/** The send is on its way: keep the row where it stands in the queue. Returns the run. */
	const hold = useCallback((row: ConversationSummary, queue: QueueView) => {
		const section = queue.visible.some((c) => c.id === row.id) ? "visible" : "quiet";
		const rows = queue[section];
		const above = rows.slice(
			0,
			Math.max(
				rows.findIndex((c) => c.id === row.id),
				0,
			),
		);
		setHeld({ conversation: row, section, above: above.map((c) => c.id), sent: false });
		return ++run.current;
	}, []);

	/** The server confirmed the send: ✓ Sent for the beat, then the row goes and the list moves on. */
	const sent = useCallback(
		(id: string, sentRun: number) => {
			setHeld((current) =>
				current?.conversation.id === id ? { ...current, sent: true } : current,
			);
			const before = callbacks.current.latestList();
			const upcoming = nextSelection(
				before.filter((c) => c.id !== id),
				id,
				null,
				before,
			);
			if (upcoming) prefetch(upcoming);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				startTransition(() => {
					addTransitionType("handoff");
					setHeld((current) => (current?.conversation.id === id ? null : current));
					if (sentRun !== run.current || callbacks.current.selection() !== id) return;
					const list = callbacks.current.latestList();
					callbacks.current.onMoveOn(
						nextSelection(
							list.filter((c) => c.id !== id),
							id,
							null,
							list,
						),
					);
				});
			}, HANDOFF_BEAT_MS);
		},
		[prefetch],
	);

	/** The send failed, or the list changed (a view, a search, a filter): the row goes at once. */
	const release = useCallback(() => {
		run.current++;
		clearTimeout(timer.current);
		setHeld(null);
	}, []);

	return { held, hold, sent, release };
}
