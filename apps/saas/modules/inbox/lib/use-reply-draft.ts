"use client";

import { useState } from "react";

import type { Conversation } from "./types";

/**
 * The reply box shows the operator's edit for the guest message being answered, falling
 * back to the server's suggested reply. Edits are keyed by that message (ADR 0011), so a
 * guest who writes again gets a fresh box instead of a reply meant for their last
 * message, and they are dropped when the reply is sent or a new suggestion is asked for.
 */
export function replyKey(conversation: Conversation): string {
	return conversation.unansweredInboundId ?? conversation.id;
}

export function useReplyDraft(selected: Conversation | null) {
	const [edits, setEdits] = useState<Record<string, string>>({});
	const key = selected ? replyKey(selected) : null;
	const edited = Boolean(key && key in edits);
	const reply = key ? (edits[key] ?? selected?.oneShot?.draft?.reply ?? "") : "";
	const setReply = (value: string) => {
		if (!key) return;
		setEdits((current) => ({ ...current, [key]: value }));
	};
	const dropEdit = (id: string) =>
		setEdits((current) => {
			if (!(id in current)) return current;
			const next = { ...current };
			delete next[id];
			return next;
		});
	return { reply, edited, setReply, dropEdit };
}
