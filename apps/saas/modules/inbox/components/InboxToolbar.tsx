"use client";

import { cn, Input } from "@repo/ui";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { InboxView, QueueCounts } from "../lib/queue";

type InboxT = ReturnType<typeof useTranslations<"inbox">>;

/**
 * A manager's count line: the view's own count, then how many guests wait in the office, or on
 * the operator the owner filter shows ("4 unassigned · 6 waiting in the office"). Your turn
 * names only the waiting count, which is that view's own.
 */
function managerCountLine(
	t: InboxT,
	view: InboxView | null,
	counts: QueueCounts,
	ownerName: string | null,
): string {
	const waiting = ownerName
		? t("managerCount.waitingOn", { count: counts.yourTurn, name: ownerName })
		: t("managerCount.waitingOffice", { count: counts.yourTurn });
	if (view === "unassigned" || view === "sent" || view === "all") {
		return t("managerCount.line", {
			view: t(`managerCount.${view}`, { count: counts[view] }),
			waiting,
		});
	}
	return waiting;
}

/**
 * The two rows at the top of the thread list: search, then the view tabs with their counts
 * and the count line. They live inside the list, so they hide with it.
 */
export function InboxToolbar({
	query,
	onQueryChange,
	views,
	view,
	onViewChange,
	counts,
	manager,
	ownerName,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	/** The operator's views, in order (a manager's start with Unassigned, ADR 0022). */
	views: readonly InboxView[];
	/** The view shown; none while the Inbox doesn't yet know which one it opens on. */
	view: InboxView | null;
	onViewChange: (view: InboxView) => void;
	counts: QueueCounts;
	/** A manager's line names the view's count, then who is waiting in the office (#208). */
	manager: boolean;
	/** The operator the owner filter shows, whose threads the counts then are. */
	ownerName: string | null;
}) {
	const t = useTranslations("inbox");
	const countLine = manager
		? managerCountLine(t, view, counts, ownerName)
		: t("queueCount", { count: counts.yourTurn });
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
					{countLine}
				</p>
			</div>
		</>
	);
}
