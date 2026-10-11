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
 * `latestList` is the list as the selection last saw it, read when it is needed; `onMoveOn`
 * gets the thread to open, or null when none waits, inside the transition.
 */
export function useHandoff({
	latestList,
	onMoveOn,
}: {
	latestList: () => ConversationSummary[];
	onMoveOn: (next: string | null) => void;
}) {
	const [held, setHeld] = useState<HeldRow | null>(null);
	const prefetch = usePrefetchConversation();
	// Each send, and each choice the operator makes meanwhile, bumps the run: a beat that ends
	// under a newer run still takes its row away, but no longer moves the selection.
	const run = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	// The caller's latest callbacks, for a beat that ends after later renders.
	const callbacks = useRef({ latestList, onMoveOn });
	useLayoutEffect(() => {
		callbacks.current = { latestList, onMoveOn };
	});
	useEffect(() => () => clearTimeout(timer.current), []);

	/** The send is on its way: keep the row where it stands in the queue. Returns the run. */
	const hold = useCallback((row: ConversationSummary, queue: QueueView) => {
		const section = queue.visible.some((c) => c.id === row.id) ? "visible" : "quiet";
		const index = queue[section].findIndex((c) => c.id === row.id);
		setHeld({ conversation: row, section, index: Math.max(index, 0), sent: false });
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
					if (sentRun !== run.current) return;
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

	/** The send failed, or the view changed: the row is let go at once, unplayed. */
	const release = useCallback(() => {
		run.current++;
		clearTimeout(timer.current);
		setHeld(null);
	}, []);

	/** The operator opened a thread during the beat: the row still leaves, the selection stays. */
	const keepSelection = useCallback(() => {
		run.current++;
	}, []);

	return { held, hold, sent, release, keepSelection };
}
