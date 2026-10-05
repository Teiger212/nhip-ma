"use client";

import { cn, Input } from "@repo/ui";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { InboxView, QueueCounts } from "../lib/queue";

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
}: {
	query: string;
	onQueryChange: (query: string) => void;
	/** The operator's views, in order (a manager's start with Unassigned, ADR 0022). */
	views: readonly InboxView[];
	view: InboxView;
	onViewChange: (view: InboxView) => void;
	counts: QueueCounts;
}) {
	const t = useTranslations("inbox");
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
				<div className="gap-0 p-0.5 shadow-hairline inline-flex rounded-full bg-muted">
					{views.map((option) => {
						const active = option === view;
						return (
							<button
								key={option}
								type="button"
								aria-pressed={active}
								onClick={() => onViewChange(option)}
								className={cn(
									"h-11 md:h-8 px-3 text-xs font-semibold gap-1.5 inline-flex cursor-pointer items-center rounded-full transition-colors",
									"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
									active
										? "shadow-hairline bg-card text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t(`views.${option}`)}
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
