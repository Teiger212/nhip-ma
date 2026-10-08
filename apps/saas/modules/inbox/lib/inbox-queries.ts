"use client";

import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";

import { noteOwnAction } from "./inbox-presence";
import { yourTurnCount } from "./queue";
import { summarize } from "./summary";
import type {
	Conversation,
	ConversationSummary,
	GuestDeletionReason,
	OperatorLanguage,
	Pipe,
} from "./types";

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
 * and model drafts land in the background (ADR 0007). A short poll is how those arrive. It is
 * the one poll behind the list, the open thread, the nav count, the tab title and the guest
 * toasts. The E2E build (E2E=1, `next.config.ts`) polls every second, so specs wait on a change
 * for a second, not ten (#222); a production or staging deployment refuses E2E (`config.ts`).
 * Read literally: Next inlines only `process.env.NEXT_PUBLIC_…` written out in full.
 */
const POLL_INTERVAL_MS = process.env.NEXT_PUBLIC_E2E === "1" ? 1_000 : 10_000;

export class InboxApiError extends Error {
	code: string | null;
	constructor(message: string, code: string | null) {
		super(message);
		this.code = code;
	}
}

/** The 403s of an operator the inbox refuses (`requireInboxSession`). */
const OFFICE_DENIALS = new Set<string | null>(["no_office", "ambiguous_office", "platform_admin"]);

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
	// An operator without an office is refused (403); asking again will not change that.
	retry: (failures, error) =>
		!(error instanceof InboxApiError && OFFICE_DENIALS.has(error.code)) && failures < 3,
});

export function useConversations({ enabled = true }: { enabled?: boolean } = {}) {
	return useQuery({ ...conversationListQuery, enabled });
}

/**
 * The open thread, whole: messages, translations, the one-shot and the Answers. Polled like
 * the list while it is open. Opening it is also what has the server fill any translation into
 * the office language that is still missing (ADR 0007, ADR 0025); the server reads the office
 * language itself. Each fetch also refreshes the thread's row, so the row and the open thread
 * never tell two stories.
 */
export function useConversation(id: string | null) {
	const queryClient = useQueryClient();
	return useQuery({
		queryKey: detailQueryKey(id ?? ""),
		queryFn: async () => {
			const conversation = await api<Conversation>(
				`/api/conversations/${encodeURIComponent(id ?? "")}`,
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
	noteOwnAction(conversation.id, conversation.owner?.id ?? null);
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
 * How many threads are Your turn for this operator, for the nav and the tab title on every
 * page. It reads the list's poll, which every page of the app shell keeps, since the guest
 * toasts need the guests' names too (#136): the database is asked once per poll.
 */
export function useYourTurnCount({ enabled }: { enabled: boolean }): number | null {
	const list = useConversations({ enabled });
	return enabled && list.data ? yourTurnCount(list.data) : null;
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
 * agent until known (`pending` until `/api/office` answers). Off for the platform admin, whom
 * `/api/office` refuses.
 */
export function useOfficeRole({ enabled = true }: { enabled?: boolean } = {}): {
	userId: string | null;
	role: "agent" | "manager";
	officeSlug: string | null;
	pending: boolean;
} {
	const query = useQuery({
		queryKey: ["inbox", "office"],
		queryFn: () => api<OfficeViewer>("/api/office"),
		staleTime: 5 * 60_000,
		enabled,
		// A refusal (no office, two offices) won't change on asking again; the Inbox and Waiting
		// now wait for this answer, so don't hold them through retries.
		retry: (failures, error) =>
			!(error instanceof InboxApiError && error.code !== null) && failures < 3,
	});
	return {
		userId: query.data?.userId ?? null,
		role: query.data?.role ?? "agent",
		officeSlug: query.data?.officeSlug ?? null,
		pending: enabled && query.isPending,
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

const autoReplyQueryKey = ["inbox", "auto-reply"] as const;

/** The office's auto-reply switch (ADR 0021 G6, #167), as its managers see it. */
export function useOfficeAutoReply() {
	return useQuery({
		queryKey: autoReplyQueryKey,
		queryFn: () => api<{ on: boolean }>("/api/office/auto-reply"),
	});
}

/** A manager turns the office's auto-reply on or off; the switch then reads it back. */
export function useSetOfficeAutoReply() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (on: boolean) =>
			api<{ on: boolean }>("/api/office/auto-reply", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ on }),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: autoReplyQueryKey }),
	});
}

const officeLanguageQueryKey = ["inbox", "office-language"] as const;

/**
 * The office language (ADR 0025): what the open thread shows translations in, and the manager's
 * setting on the General tab. Every member of the office reads it.
 */
export function useOfficeLanguage() {
	return useQuery({
		queryKey: officeLanguageQueryKey,
		queryFn: async () =>
			(await api<{ language: OperatorLanguage }>("/api/office/language")).language,
		staleTime: 60_000,
	});
}

/** A manager sets the office language; the setting then reads it back. */
export function useSetOfficeLanguage() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (language: OperatorLanguage) =>
			api<{ language: OperatorLanguage }>("/api/office/language", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ language }),
			}),
		onSettled: () => queryClient.invalidateQueries({ queryKey: officeLanguageQueryKey }),
	});
}

/** A manager gives a thread to an operator, or back to Unassigned (null). */
export function useSetOwner() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ownerId }: { id: string; ownerId: string | null }) =>
			api<Conversation>(`/api/conversations/${encodeURIComponent(id)}/owner`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ownerId }),
			}),
		// Before a poll can show the new owner: giving a thread to yourself raises no toast.
		onMutate: ({ id, ownerId }) => noteOwnAction(id, ownerId),
		onSuccess: (conversation) => putConversation(queryClient, conversation),
		onSettled: () => queryClient.invalidateQueries({ queryKey: conversationsQueryKey }),
	});
}

/**
 * A manager deletes a guest's data (ADR 0020). The thread leaves the list and its open view at
 * once, so the Inbox selects the next thread; then the list, every thread and the nav's
 * Your-turn count refresh from the server.
 */
export function useDeleteGuest() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			...choice
		}: {
			id: string;
			deleteInCrm: boolean;
			reason: GuestDeletionReason;
			note: string | null;
		}) =>
			api<{ crm: "deleted" | "unlinked" | "failed" | null }>(
				`/api/conversations/${encodeURIComponent(id)}/deletion`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(choice),
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
