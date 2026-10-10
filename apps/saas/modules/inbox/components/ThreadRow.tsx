"use client";

import { cn } from "@repo/ui";
import { useHydrated } from "@shared/hooks/use-hydrated";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

import { guestLabel } from "../lib/display-name";
import { formatInboxTimestamp } from "../lib/time";
import type { ConversationSummary } from "../lib/types";
import { GuestMark, ThreadFlags } from "./ThreadParts";

/**
 * One thread in the list: guest, when they last wrote, a preview, the pipe and the turn. An
 * `action` (a manager's "Assign to…" on Unassigned rows, ADR 0022) sits at the row's end, beside
 * the row's button rather than in it: a click on it never opens the thread.
 */
export function ThreadRow({
	conversation,
	active,
	onOpen,
	action,
	ownerBadge = true,
}: {
	conversation: ConversationSummary;
	active: boolean;
	onOpen: () => void;
	action?: ReactNode;
	/** False where the view already says who holds every row (a manager's Unassigned, #303). */
	ownerBadge?: boolean;
}) {
	const locale = useLocale();
	const hydrated = useHydrated();
	const preview = conversation.lastInboundText;
	const label = guestLabel(conversation);
	const name = label.text;
	const when = conversation.lastGuestInboundAt;
	// From `md` an action shows only on the row's hover, on focus within it, on the selected row
	// and while its menu is open; it then takes the time's place, and the name ends before it so
	// it is never under the pill (#208). Where nothing hovers (below `md`, or a touch screen) it
	// is always there.
	const shown = !action
		? null
		: active
			? { line: "md:pr-24", time: "md:hidden", action: "" }
			: {
					line: "md:group-hover/row:pr-24 md:group-focus-within/row:pr-24 md:group-has-data-popup-open/row:pr-24 md:pointer-coarse:pr-24",
					time: "md:group-hover/row:hidden md:group-focus-within/row:hidden md:group-has-data-popup-open/row:hidden md:pointer-coarse:hidden",
					action:
						"md:invisible md:group-hover/row:visible md:group-focus-within/row:visible md:has-data-popup-open:visible md:pointer-coarse:visible",
				};
	return (
		// The row stays lit while the pointer is on its action, which sits over it.
		<li className="group/row relative">
			<button
				type="button"
				aria-current={active ? "true" : undefined}
				className={cn(
					"gap-2.5 px-3 py-2.5 text-sm min-w-0 my-0.5 mx-1.5 w-row-inset ease-out flex cursor-pointer items-start overflow-hidden rounded-xl text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden motion-reduce:transition-none",
					active ? "bg-accent" : "group-hover/row:bg-muted/70",
				)}
				onClick={onOpen}
			>
				<GuestMark name={name} phone={label.phone} selected={active} />
				<span className="min-w-0 flex-1">
					<span className={cn("gap-2 flex w-full items-baseline justify-between", shown?.line)}>
						<span className="font-semibold tracking-tight font-heading truncate">{name}</span>
						{when ? (
							<time
								className={cn(
									"text-micro shrink-0 text-muted-foreground tabular-nums",
									shown?.time,
								)}
								dateTime={when}
							>
								{hydrated ? formatInboxTimestamp(when, locale) : null}
							</time>
						) : null}
					</span>
					{preview ? (
						<span className="text-xs mt-0.5 leading-snug line-clamp-2 w-full text-muted-foreground">
							{preview}
						</span>
					) : null}
					<span
						className={cn("mt-1.5 gap-1 flex flex-wrap items-center", action && "pr-20 md:pr-0")}
					>
						<ThreadFlags conversation={conversation} owner={ownerBadge} />
					</span>
				</span>
			</button>
			{/* A phone: its 44px target centred on the badges' last line. From `md`: the 24px pill
			    on the name's line, so the badges keep the row's whole width. */}
			{action ? (
				<div
					className={cn(
						"right-1.5 bottom-0 md:top-2.5 md:bottom-auto absolute whitespace-nowrap",
						shown?.action,
					)}
				>
					{action}
				</div>
			) : null}
		</li>
	);
}
