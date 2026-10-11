"use client";

import { Input, cn } from "@repo/ui";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { InboxView, QueueCounts } from "../lib/queue";

type InboxT = ReturnType<typeof useTranslations<"inbox">>;

/**
 * A manager's count line: the view's own count, then how many guests wait in the office, or on
 * the operator the owner filter shows ("4 unassigned · 6 waiting in the office"). Waiting (the
 * manager's Your turn) names only the waiting count, which is that view's own.
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
 * The top of the thread list (#314): search, then the view tabs as slots (a small label over
 * its full count; the view shown is filled Signal Blue), then the count line. The tabs share
 * the row in equal columns and never scroll or wrap (#210); each holds its whole label and count.
 * They live inside the list, so they hide with it.
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
	/**
	 * A manager's Your turn view is named Waiting: it holds the whole office's (ADR 0022). Their
	 * count line names the view's count, then who is waiting in the office (#208).
	 */
	manager: boolean;
	/** The operator the owner filter shows, whose threads the counts then are. */
	ownerName: string | null;
}) {
	const t = useTranslations("inbox");
	const countLine = manager
		? managerCountLine(t, view, counts, ownerName)
		: t("queueCount", { count: counts.yourTurn });
	return (
		<div className="gap-2 px-4 pt-3 pb-2 flex shrink-0 flex-col">
			<div className="relative w-full">
				<SearchIcon
					aria-hidden="true"
					className="left-3 size-4 pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground"
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
			<div className="gap-1.5 grid auto-cols-fr grid-flow-col">
				{views.map((option) => {
					const active = option === view;
					return (
						<button
							key={option}
							type="button"
							aria-pressed={active}
							onClick={() => onViewChange(option)}
							className={cn(
								"h-11 md:h-10 px-1 min-w-0 flex cursor-pointer flex-col items-center justify-center rounded-lg border transition-colors duration-150",
								"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
								active
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-card text-foreground hover:border-foreground",
							)}
						>
							<span
								className={cn(
									"text-micro font-semibold leading-tight whitespace-nowrap",
									active ? "text-primary-foreground" : "text-muted-foreground",
								)}
							>
								{manager && option === "yourTurn" ? t("views.waiting") : t(`views.${option}`)}
							</span>
							<span className="text-sm font-bold leading-tight tabular-nums">{counts[option]}</span>
						</button>
					);
				})}
			</div>
			<p className="text-xs text-muted-foreground" aria-live="polite">
				{countLine}
			</p>
		</div>
	);
}
