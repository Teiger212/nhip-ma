/**
 * The inbox's TanStack Query keys, in a file with no `"use client"` so the server can prefetch
 * under the very keys the client reads (`inbox-queries.ts`, `prefetch-inbox.ts`).
 */
export const conversationsQueryKey = ["inbox", "conversations"] as const;
export const conversationListQueryKey = [...conversationsQueryKey, "list"] as const;
export const officeQueryKey = ["inbox", "office"] as const;
