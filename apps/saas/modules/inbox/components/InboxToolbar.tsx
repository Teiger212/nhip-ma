"use client";

import { Input, cn } from "@repo/ui";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";

import type { InboxView, QueueCounts } from "../lib/queue";

/**
 * A tab's side padding and the gap between its label and count, roomiest first: DESIGN.md's 12px
 * and 6px, then 8px, then 4px and 4px. The view tabs stay on one line and never scroll (#210), so
 * when the row runs short (a manager's four Vietnamese tabs with three-digit counts at the list's
 * 22rem) the padding and gap give way before a label wraps or is cut. Counts are always whole.
 */
const TAB_FITS = [
	{ className: "px-3 gap-1.5", pad: 12, gap: 6 },
	{ className: "px-2 gap-1.5", pad: 8, gap: 6 },
	{ className: "px-1 gap-1", pad: 4, gap: 4 },
] as const;

/** The spare pixel a fit keeps, so rounding never tips the last tab past the row's edge. */
const FIT_SLACK = 1;

/** An element's left and right padding, in px. */
function sidePadding(element: Element): number {
	const style = getComputedStyle(element);
	return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
}

/** The gap between an element's flex children, in px. */
function columnGap(element: Element): number {
	return Number.parseFloat(getComputedStyle(element).columnGap) || 0;
}

/**
 * The roomiest of `TAB_FITS` whose tabs fit the row, measured before paint and again whenever
 * the row or a tab changes size (a count, a label, a font loading, the window), and when the
 * tabs themselves change. The tabs' width without padding and gap doesn't depend on the fit, so
 * a measurement after a change of fit gives the same answer and settles. When even the tightest
 * doesn't fit (a four-digit count on every tab), the tightest stays and the row's end is cut.
 */
function useTabsFit(group: RefObject<HTMLDivElement | null>, views: readonly InboxView[]): number {
	const [fit, setFit] = useState(0);

	useLayoutEffect(() => {
		const tabs = group.current;
		const row = tabs?.parentElement;
		if (!tabs || !row || views.length === 0) return;
		const measure = () => {
			const buttons = [...tabs.children];
			const room = row.getBoundingClientRect().width - sidePadding(row);
			// The tabs' width without their side padding and inner gap, whichever fit they have now.
			const bare =
				sidePadding(tabs) +
				columnGap(tabs) * (buttons.length - 1) +
				buttons.reduce(
					(sum, button) =>
						sum + button.getBoundingClientRect().width - sidePadding(button) - columnGap(button),
					0,
				);
			const next = TAB_FITS.findIndex(
				({ pad, gap }) => bare + (2 * pad + gap) * buttons.length + FIT_SLACK <= room,
			);
			setFit(next === -1 ? TAB_FITS.length - 1 : next);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		for (const button of tabs.children) observer.observe(button);
		return () => observer.disconnect();
	}, [group, views]);

	return fit;
}

/**
 * The two rows at the top of the thread list: search, then the view tabs with their counts
 * and the "Your turn" sentence. They live inside the list, so they hide with it.
 */
export function InboxToolbar({
	query,
	onQueryChange,
	views,
	view,
	onViewChange,
	counts,
	manager,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	/** The operator's views, in order (a manager's start with Unassigned, ADR 0022). */
	views: readonly InboxView[];
	/** The view shown; none while the Inbox doesn't yet know which one it opens on. */
	view: InboxView | null;
	onViewChange: (view: InboxView) => void;
	counts: QueueCounts;
	/** A manager's Your turn view is named Waiting: it holds the whole office's (ADR 0022). */
	manager: boolean;
}) {
	const t = useTranslations("inbox");
	const tabs = useRef<HTMLDivElement>(null);
	const fit = useTabsFit(tabs, views);
	return (
		<>
			<div className="px-3 py-3 flex shrink-0 items-center border-b">
				<div className="relative w-full">
					<SearchIcon
						aria-hidden="true"
						className="left-4 size-4 pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id="inbox-search"
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder={t("searchPlaceholder")}
						aria-label={t("searchAria")}
						variant="search"
					/>
				</div>
			</div>
			<div className="px-3 py-2 gap-2 flex shrink-0 flex-wrap items-center justify-between border-b">
				{/* One line, never scrolled (#210): each tab is as wide as its label and full count. */}
				<div
					ref={tabs}
					className="gap-0 p-0.5 shadow-hairline inline-flex max-w-full rounded-full bg-muted"
				>
					{views.map((option) => {
						const active = option === view;
						return (
							<button
								key={option}
								type="button"
								aria-pressed={active}
								onClick={() => onViewChange(option)}
								className={cn(
									"h-11 md:h-8 text-xs font-semibold inline-flex cursor-pointer items-center rounded-full whitespace-nowrap transition-colors",
									TAB_FITS[fit].className,
									"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
									active
										? "shadow-hairline bg-card text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{manager && option === "yourTurn" ? t("views.waiting") : t(`views.${option}`)}
								<span className="font-mono text-2xs text-muted-foreground tabular-nums">
									{counts[option]}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-xs text-muted-foreground" aria-live="polite">
					{t("queueCount", { count: counts.yourTurn })}
				</p>
			</div>
		</>
	);
}
