"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout, never merged to main).
 * Question: what should the open thread look like? Three structurally different layouts of the
 * open thread, switchable on the existing /inbox route via `?variant=` (0 = today's
 * ThreadDetail, untouched). Only the open-thread subtree swaps; Inbox keeps all data fetching.
 */
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

import { ThreadDetail } from "../ThreadDetail";
import { ThreadLayoutA } from "./ThreadLayoutA.prototype";
import { ThreadLayoutB } from "./ThreadLayoutB.prototype";
import { ThreadLayoutC } from "./ThreadLayoutC.prototype";

export const THREAD_VARIANTS = [
	{ key: "0", name: "Today" },
	{ key: "A", name: "Workbench" },
	{ key: "B", name: "Chat + summary strip" },
	{ key: "C", name: "Parallel text" },
] as const;

export function useThreadVariant(): string {
	const params = useSearchParams();
	if (process.env.NODE_ENV === "production") return "0";
	const value = params.get("variant")?.toUpperCase() ?? "0";
	return THREAD_VARIANTS.some((v) => v.key === value) ? value : "0";
}

export function ThreadVariant(props: ComponentProps<typeof ThreadDetail>) {
	const variant = useThreadVariant();
	if (variant === "A") return <ThreadLayoutA {...props} />;
	if (variant === "B") return <ThreadLayoutB {...props} />;
	if (variant === "C") return <ThreadLayoutC {...props} />;
	return <ThreadDetail {...props} />;
}
