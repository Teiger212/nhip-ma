"use client";

import { Input, cn } from "@repo/ui";
import { TickingCount } from "@shared/components/TickingCount";
import { SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import type { InboxView, QueueCounts } from "../lib/queue";

/**
 * The top of the thread list (#314): search, then the view tabs as slots (a small label over
 * its full count; the view shown is filled Signal Blue). The tabs carry the counts, so no line
 * under them repeats them (Eyal, 2026-10-11). While the search holds text, an X at its end clears
 * it and leaves the cursor in the field (a 44px target on a phone, inside the field's own height).
 * The tabs share the row in equal columns and never scroll or wrap (#210); each holds its whole
 * label and count. They live inside the list, so they hide with it. A count ticks when it changes
 * (#330).
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
	const search = useRef<HTMLInputElement>(null);
	return (
		<div className="gap-2 px-4 pt-3 pb-2 flex shrink-0 flex-col">
			<div className="relative w-full">
				<SearchIcon
					aria-hidden="true"
					className="left-3 size-4 pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					ref={search}
					id="inbox-search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchAria")}
					variant="search"
					className={query ? "pr-11 md:pr-9" : undefined}
				/>
				{query ? (
					<button
						type="button"
						aria-label={t("searchClear")}
						title={t("searchClear")}
						// The field keeps focus under a pointer; a keyboard press hands it back below.
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => {
							onQueryChange("");
							search.current?.focus();
						}}
						className="right-0 size-11 md:size-9 absolute top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<XIcon aria-hidden="true" className="size-4" />
					</button>
				) : null}
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
							<TickingCount
								value={counts[option]}
								className="text-sm font-bold leading-tight tabular-nums"
							/>
						</button>
					);
				})}
			</div>
		</div>
	);
}
