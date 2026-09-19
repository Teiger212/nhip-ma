"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import type { Conversation } from "./types";

/** Server data for the inbox lives in TanStack Query; nothing else caches it. */
export const conversationsQueryKey = ["inbox", "conversations"] as const;

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

export function useConversations() {
	const locale = useLocale();
	return useQuery({
		queryKey: [...conversationsQueryKey, locale],
		queryFn: () => api<Conversation[]>(`/api/conversations?locale=${encodeURIComponent(locale)}`),
		refetchInterval: POLL_INTERVAL_MS,
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
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
		},
	});
}

export function useApproveAndSend() {
	const mutation = useConversationMutation("approve");
	return {
		...mutation,
		mutateAsync: ({ id, reply }: { id: string; reply: string }) =>
			mutation.mutateAsync({ id, body: { reply } }),
	};
}

export function useRegenerateDraft() {
	const mutation = useConversationMutation("draft");
	return {
		...mutation,
		mutateAsync: ({ id }: { id: string }) => mutation.mutateAsync({ id }),
	};
}
