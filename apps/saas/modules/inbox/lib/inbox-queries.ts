"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Conversation } from "./types";

/** Server data for the inbox lives in TanStack Query; nothing else caches it. */
export const conversationsQueryKey = ["inbox", "conversations"] as const;

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
	return useQuery({
		queryKey: conversationsQueryKey,
		queryFn: () => api<Conversation[]>("/api/conversations"),
	});
}

export function useApproveAndSend() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reply }: { id: string; reply: string }) =>
			api<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reply }),
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
		},
	});
}
