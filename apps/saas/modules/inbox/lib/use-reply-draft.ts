"use client";

import { useState } from "react";

import type { Conversation } from "./types";

/** What the operator typed into a thread's reply box, and the guest message it was typed for. */
type Edit = { text: string; forInboundId: string | null };

/**
 * The reply box shows the operator's edit for the thread, falling back to the server's
 * suggested reply (ADR 0024, amending ADR 0011). Untouched, the box follows the server: when
 * the guest writes again, it holds the suggestion for their new message. Typed into, it keeps
 * the operator's text when the guest writes again, never overwritten by a new suggestion, and
 * says so (`guestWroteAgain`). Sending it names the message it was typed for, as an edit, and
 * the server records it as the answer to the latest one. An edit is dropped when the reply is
 * sent or a new suggestion is asked for. It lives in this browser only.
 */
export function useReplyDraft(selected: Conversation | null) {
	const [edits, setEdits] = useState<Record<string, Edit>>({});
	const edit = selected ? edits[selected.id] : undefined;
	const edited = edit !== undefined;
	const reply = selected ? (edit?.text ?? selected.oneShot?.draft?.reply ?? "") : "";
	const waiting = selected?.unansweredInboundId ?? null;
	const guestWroteAgain = Boolean(edit && waiting && edit.forInboundId !== waiting);
	const setReply = (value: string) => {
		if (!selected) return;
		const { id } = selected;
		setEdits((current) => ({
			...current,
			[id]: { text: value, forInboundId: id in current ? current[id].forInboundId : waiting },
		}));
	};
	/**
	 * The server refused the edit's message as out of date (it was answered since): the text
	 * stays, now for the message waiting, and the next send is the operator's informed choice.
	 */
	const retarget = (conversationId: string, inboundId: string | null) =>
		setEdits((current) => {
			const kept = current[conversationId];
			if (!kept) return current;
			return { ...current, [conversationId]: { ...kept, forInboundId: inboundId } };
		});
	const dropEdit = (conversationId: string) =>
		setEdits((current) => {
			if (!(conversationId in current)) return current;
			const next = { ...current };
			delete next[conversationId];
			return next;
		});
	/** The guest message an approval names: the one the edit was typed for, else the waiting one. */
	const target = edit?.forInboundId ?? waiting;
	return { reply, edited, guestWroteAgain, target, setReply, dropEdit, retarget };
}
