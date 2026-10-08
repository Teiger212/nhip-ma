"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout): the floating variant switcher. ← / →
 * (buttons or keys) cycle `?variant=` with router.replace, keeping every other search param.
 * Never rendered in a production build. Parked bottom-left on the sidebar, above its footer and
 * the Next dev badge, so it never covers the open thread being judged (bottom-centre sat on
 * B's composer).
 */
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { THREAD_VARIANTS, useThreadVariant } from "./ThreadVariant.prototype";

export function PrototypeSwitcher() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const current = useThreadVariant();
	const index = Math.max(
		0,
		THREAD_VARIANTS.findIndex((v) => v.key === current),
	);

	const go = useCallback(
		(step: number) => {
			const next = THREAD_VARIANTS[(index + step + THREAD_VARIANTS.length) % THREAD_VARIANTS.length];
			const search = new URLSearchParams(params.toString());
			if (next.key === "0") search.delete("variant");
			else search.set("variant", next.key);
			const query = search.toString();
			router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
		},
		[index, params, pathname, router],
	);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") ||
					target.isContentEditable)
			) {
				return;
			}
			event.preventDefault();
			go(event.key === "ArrowLeft" ? -1 : 1);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [go]);

	if (process.env.NODE_ENV === "production") return null;
	const variant = THREAD_VARIANTS[index];
	return (
		<div className="bottom-16 left-3 gap-1 p-1 text-xs fixed z-50 flex items-center rounded-full bg-foreground text-background shadow-lg">
			<button
				type="button"
				aria-label="Previous variant"
				className="size-8 flex cursor-pointer items-center justify-center rounded-full hover:bg-background/15"
				onClick={() => go(-1)}
			>
				<ChevronLeftIcon className="size-4" />
			</button>
			<span className="px-1.5 font-medium min-w-36 text-center whitespace-nowrap">
				<span className="font-mono">{variant.key}</span> · {variant.name}
			</span>
			<button
				type="button"
				aria-label="Next variant"
				className="size-8 flex cursor-pointer items-center justify-center rounded-full hover:bg-background/15"
				onClick={() => go(1)}
			>
				<ChevronRightIcon className="size-4" />
			</button>
		</div>
	);
}
