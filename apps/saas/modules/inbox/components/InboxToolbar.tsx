"use client";

import { cn, Input } from "@repo/ui";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { INBOX_VIEWS, type InboxView, type QueueCounts } from "../lib/queue";

/**
 * The two rows above the columns: search, then the view tabs with their counts and the
 * "Your turn" sentence. Both are the list's controls, so on a phone they hide with it
 * while a thread is open.
 */
export function InboxToolbar({
	query,
	onQueryChange,
	view,
	onViewChange,
	counts,
	hiddenOnPhone,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	view: InboxView;
	onViewChange: (view: InboxView) => void;
	counts: QueueCounts;
	hiddenOnPhone: boolean;
}) {
	const t = useTranslations("inbox");
	return (
		<>
			<div
				className={cn(
					"px-3 py-3 flex shrink-0 items-center border-b",
					hiddenOnPhone && "md:flex hidden",
				)}
			>
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
						className="h-12 min-h-12 px-4 py-3 pl-12 text-base rounded-full rounded-md border-transparent bg-muted shadow-none"
					/>
				</div>
			</div>
			<div
				className={cn(
					"px-3 py-2 gap-2 flex shrink-0 flex-wrap items-center justify-between border-b",
					hiddenOnPhone && "md:flex hidden",
				)}
			>
				<div className="gap-0 p-0.5 inline-flex rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)]">
					{INBOX_VIEWS.map((option) => {
						const active = option === view;
						return (
							<button
								key={option}
								type="button"
								aria-pressed={active}
								onClick={() => onViewChange(option)}
								className={cn(
									"h-8 px-3 text-xs font-semibold gap-1.5 inline-flex cursor-pointer items-center rounded-full transition-colors",
									"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
									active
										? "shadow-xs border border-border bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t(`views.${option}`)}
								<span className="font-mono text-[10px] tabular-nums opacity-70">
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
