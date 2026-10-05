"use client";

import { useSyncExternalStore } from "react";

/**
 * Two facts the shell and the Inbox share on the client (#136), with no URL between them:
 * which thread a guest toast's tap asked the Inbox to open (a thread's id carries a WhatsApp
 * phone, so it never goes in a URL: ADR 0019), and whether the Inbox list is on screen, where
 * guest toasts stay away (spec #84).
 */
function signal<T>(initial: T) {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (next: T) => {
			if (Object.is(next, value)) return;
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

const handedOff = signal<string | null>(null);

/** How long an operator's own action on a thread is remembered, against the poll that shows it. */
const OWN_ACTION_MS = 60_000;
const ownActions = new Map<string, { ownerId: string | null; at: number }>();

/**
 * The server just returned a thread after this operator acted on it (gave it to themselves, a
 * reply that claimed it): the owner it shows is their own doing, which raises no toast.
 */
export function noteOwnAction(threadId: string, ownerId: string | null): void {
	ownActions.set(threadId, { ownerId, at: Date.now() });
}

/** Whether the thread became this owner's by their own action; forgets it either way. */
export function takeOwnAction(threadId: string, ownerId: string): boolean {
	const action = ownActions.get(threadId);
	ownActions.delete(threadId);
	return action?.ownerId === ownerId && Date.now() - action.at <= OWN_ACTION_MS;
}
const listShown = signal(false);

/** A guest toast was tapped: the Inbox opens this thread once it has its list. */
export function handOffThread(id: string): void {
	handedOff.set(id);
}

/** The Inbox took the handed-off thread. */
export function clearHandedOffThread(): void {
	handedOff.set(null);
}

export function useHandedOffThread(): string | null {
	return useSyncExternalStore(handedOff.subscribe, handedOff.get, () => null);
}

/** The Inbox says whether its list is on screen (always beside a thread from `md` up). */
export function setInboxListShown(shown: boolean): void {
	listShown.set(shown);
}

export function useInboxListShown(): boolean {
	return useSyncExternalStore(listShown.subscribe, listShown.get, () => false);
}

const WIDE_QUERY = "(min-width: 768px)";

function subscribeWide(listener: () => void) {
	const query = window.matchMedia(WIDE_QUERY);
	query.addEventListener("change", listener);
	return () => query.removeEventListener("change", listener);
}

/** From Tailwind's `md` up the Inbox shows its list beside the open thread; below, one or the other. */
export function useInboxSideBySide(): boolean {
	return useSyncExternalStore(
		subscribeWide,
		() => window.matchMedia(WIDE_QUERY).matches,
		() => true,
	);
}
