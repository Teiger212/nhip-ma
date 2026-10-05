"use client";

import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState } from "react";

import { yourTurnCount } from "./queue";
import { summarize } from "./summary";
import type { Conversation, ConversationSummary, Pipe } from "./types";

/**
 * Server data for the inbox lives in TanStack Query; nothing else caches it. Everything
 * about threads sits under this key, so invalidating it refreshes the list, the nav count
 * and the open thread together.
 */
export const conversationsQueryKey = ["inbox", "conversations"] as const;
const listQueryKey = [...conversationsQueryKey, "list"] as const;
const detailQueryKey = (id: string) => [...conversationsQueryKey, "detail", id] as const;

/**
 * The queue changes without the operator doing anything: guests write back, translations
 * and model drafts land in the background (ADR 0007). A short poll is how those arrive.
 */
const POLL_INTERVAL_MS = 10_000;

export class InboxApiError extends Error {
	code: string | null;
	constructor(message: string, code: string | null) {
		super(message);
		this.code = code;
	}
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
	if (!res.ok) {
		throw new InboxApiError(data.message || data.error || res.statusText, data.error ?? null);
	}
	return data;
}

/**
 * The thread list, as summaries (no messages). One definition for every reader (the inbox,
 * Home's Waiting now, the nav count), so they share one cache entry and one poll.
 */
const conversationListQuery = queryOptions({
	queryKey: listQueryKey,
	queryFn: () => api<ConversationSummary[]>("/api/conversations"),
	refetchInterval: POLL_INTERVAL_MS,
});

export function useConversations() {
	return useQuery(conversationListQuery);
}

/**
 * The open thread, whole: messages, translations, the one-shot and the Answers. Polled like
 * the list while it is open. Opening it is also what asks the server for any translation
 * into the operator's language that is still missing (ADR 0007). Each fetch also refreshes
 * the thread's row, so the row and the open thread never tell two stories.
 */
export function useConversation(id: string | null) {
	const locale = useLocale();
	const queryClient = useQueryClient();
	return useQuery({
		queryKey: detailQueryKey(id ?? ""),
		queryFn: async () => {
			const conversation = await api<Conversation>(
				`/api/conversations/${encodeURIComponent(id ?? "")}?locale=${encodeURIComponent(locale)}`,
			);
			putSummary(queryClient, conversation);
			return conversation;
		},
		enabled: id !== null,
		refetchInterval: POLL_INTERVAL_MS,
		// A thread this operator can no longer open stays gone; asking again will not help.
		retry: (failures, error) =>
			!(error instanceof InboxApiError && error.code === "not_found") && failures < 3,
	});
}

/**
 * A thread the server just returned after an action: the open thread shows it and its row
 * moves at once; the refetch that follows confirms both.
 */
function putConversation(queryClient: QueryClient, conversation: Conversation): void {
	queryClient.setQueryData(detailQueryKey(conversation.id), conversation);
	putSummary(queryClient, conversation);
}

/** Replace the thread's row with what the whole thread says, if the list holds it. */
function putSummary(queryClient: QueryClient, conversation: Conversation): void {
	queryClient.setQueryData<ConversationSummary[]>(listQueryKey, (list) =>
		list?.map((item) => (item.id === conversation.id ? summarize(conversation) : item)),
	);
}

/**
 * How many threads are Your turn for this operator, for the nav on every page. Where the
 * page already polls the conversation list (Inbox, Home), the count is read off it, so the
 * database is asked once; elsewhere only the number comes over the wire. The last value is
 * held while one source hands over to the other, so the number never blinks.
 */
export function useYourTurnCount({
	enabled,
	listMounted,
}: {
	enabled: boolean;
	listMounted: boolean;
}): number | null {
	const list = useQuery({ ...conversationListQuery, enabled: enabled && listMounted });
	const count = useQuery({
		queryKey: [...conversationsQueryKey, "yourTurnCount"],
		queryFn: () => api<{ count: number }>("/api/conversations/your-turn"),
		refetchInterval: POLL_INTERVAL_MS,
		enabled: enabled && !listMounted,
		// An operator without an office is refused (403); asking again will not change that.
		retry: false,
	});
	const listCount = list.data ? yourTurnCount(list.data) : null;
	const value = listMounted ? listCount : (count.data?.count ?? null);
	const [held, setHeld] = useState<number | null>(null);
	if (value !== null && value !== held) setHeld(value);
	return enabled ? (value ?? held) : null;
}

export type DisconnectedEndpoint = { pipe: Pipe; externalId: string };

/**
 * The office's disconnected endpoints (ADR 0017): replies that would go out from one of them
 * cannot be sent until the platform admin reconnects it.
 */
export function useDisconnectedEndpoints(): DisconnectedEndpoint[] {
	const query = useQuery({
		queryKey: ["inbox", "pipes", "status"],
		queryFn: () => api<{ disconnected: DisconnectedEndpoint[] }>("/api/pipes/status"),
		refetchInterval: 60_000,
	});
	return query.data?.disconnected ?? [];
}

/** The endpoint a reply on this thread goes out from: the one the guest last wrote to. */
export function replyEndpoint(conversation: Conversation): string | null {
	for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
		const message = conversation.messages[i];
		if (message.direction === "in") return message.pipeExternalId;
	}
	return null;
}

type OfficeViewer = { userId: string; role: "agent" | "manager"; officeSlug: string | null };

/**
 * The signed-in operator, their role in the office (ADR 0015) and the office's slug. An
 * agent until known. Off for the platform admin, whom `/api/office` refuses.
 */
export function useOfficeRole({ enabled = true }: { enabled?: boolean } = {}): {
	userId: string | null;
	role: "agent" | "manager";
	officeSlug: string | null;
} {
	const query = useQuery({
		queryKey: ["inbox", "office"],
		queryFn: () => api<OfficeViewer>("/api/office"),
		staleTime: 5 * 60_000,
		enabled,
	});
	return {
		userId: query.data?.userId ?? null,
		role: query.data?.role ?? "agent",
		officeSlug: query.data?.officeSlug ?? null,
	};
}

export type OfficeAgent = { id: string; name: string; manager: boolean };

/** The office's operators a manager can give a thread to. */
export function useOfficeAgents(enabled: boolean) {
	return useQuery({
		queryKey: ["inbox", "office", "agents"],
		queryFn: () => api<OfficeAgent[]>("/api/office/agents"),
		enabled,
		staleTime: 60_000,
	});
}

/** A manager gives a thread to an agent, or back to the pool (null). */
export function useSetOwner() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ownerId }: { id: string; ownerId: string | null }) =>
			api<Conversation>(`/api/conversations/${encodeURIComponent(id)}/owner`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ownerId }),
			}),
		onSuccess: (conversation) => putConversation(queryClient, conversation),
		onSettled: () => queryClient.invalidateQueries({ queryKey: conversationsQueryKey }),
	});
}

/**
 * A manager deletes a guest's data (ADR 0020). The thread leaves the list and its open view at
 * once, so the Inbox selects the next thread; then the list, every thread and the your-turn
 * count (the nav) refresh from the server.
 */
export function useDeleteGuest() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, deleteInCrm }: { id: string; deleteInCrm: boolean }) =>
			api<{ crm: "deleted" | "unlinked" | "failed" | null }>(
				`/api/conversations/${encodeURIComponent(id)}/deletion`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ deleteInCrm }),
				},
			),
		onSettled: async (_result, error, { id }) => {
			// Gone either way: deleted now, or already (`not_found`).
			if (!error || (error instanceof InboxApiError && error.code === "not_found")) {
				queryClient.setQueryData<ConversationSummary[]>(listQueryKey, (list) =>
					list?.filter((item) => item.id !== id),
				);
				queryClient.removeQueries({ queryKey: detailQueryKey(id) });
			}
			await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
		},
	});
}

function useConversationMutation(path: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
			api<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}/${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body ?? {}),
			}),
		onSuccess: async ({ conversation }) => {
			putConversation(queryClient, conversation);
			await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
		},
	});
}

export function useApproveAndSend() {
	const mutation = useConversationMutation("approve");
	return {
		...mutation,
		mutateAsync: ({ id, inboundId, reply }: { id: string; inboundId: string; reply: string }) =>
			mutation.mutateAsync({ id, body: { inboundId, reply } }),
	};
}

export function useRegenerateDraft() {
	const mutation = useConversationMutation("draft");
	return {
		...mutation,
		mutateAsync: ({ id }: { id: string }) => mutation.mutateAsync({ id }),
	};
}
