"use client";

import { cn } from "@repo/ui";
import { useHydrated } from "@shared/hooks/use-hydrated";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

import { guestLabel } from "../lib/display-name";
import { formatInboxTimestamp } from "../lib/time";
import type { ConversationSummary } from "../lib/types";
import {
	FactTags,
	LanguageMark,
	OwnerFlag,
	PipeLabel,
	TurnPlate,
	useTurnChip,
} from "./ThreadParts";

/**
 * One thread in the list (#314): the guest's language mark; their name, pipe and turn plate;
 * a preview of what they last wrote; then the fact tags, a manager's owner flag and when they
 * wrote. An `action` (a manager's "Assign to…" on Unassigned rows, ADR 0022) sits at the row's
 * end, beside the row's button rather than in it: a click on it never opens the thread.
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
	const chip = useTurnChip(conversation);
	const preview = conversation.lastInboundText;
	const name = guestLabel(conversation).text;
	const when = conversation.lastGuestInboundAt;
	// From `md` an action shows only on the row's hover, on focus within it, on the selected row
	// and while its menu is open; it sits at the end of the name's line, so that line makes room
	// for it and the plate moves left, never under the pill (#208). Where nothing hovers (below
	// `md`, or a touch screen) it is always there, over the tags' line.
	const shown = !action
		? null
		: active
			? { line: "md:pr-24", action: "" }
			: {
					line: "md:group-hover/row:pr-24 md:group-focus-within/row:pr-24 md:group-has-data-popup-open/row:pr-24 md:pointer-coarse:pr-24",
					action:
						"md:invisible md:group-hover/row:visible md:group-focus-within/row:visible md:has-data-popup-open:visible md:pointer-coarse:visible",
				};
	return (
		// The row stays lit while the pointer is on its action, which sits over it. A hairline
		// parts it from the row above, except where the selected row's own edge does.
		<li
			data-active={active || undefined}
			className="group/row px-1.5 before:inset-x-4 before:top-0 relative before:absolute before:h-px before:bg-border first:before:hidden data-active:before:hidden"
		>
			<button
				type="button"
				aria-current={active ? "true" : undefined}
				className={cn(
					"gap-2.5 px-2.5 py-2 min-w-0 ease-out flex w-full cursor-pointer items-start overflow-hidden rounded-xl border text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden motion-reduce:transition-none",
					active ? "border-primary bg-card" : "border-transparent group-hover/row:bg-card/70",
				)}
				onClick={onOpen}
			>
				<LanguageMark code={conversation.guestLanguage} chip={chip} />
				<span className="min-w-0 flex-1">
					<span className={cn("h-5.5 gap-2 min-w-0 flex w-full items-center", shown?.line)}>
						<span className="text-sm font-bold min-w-0 truncate">{name}</span>
						<PipeLabel pipe={conversation.pipe} />
						<span className="ml-auto flex shrink-0">
							<TurnPlate conversation={conversation} />
						</span>
					</span>
					{preview ? (
						<span
							className={cn(
								"mt-0.5 text-note line-clamp-2 w-full",
								active ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{preview}
						</span>
					) : null}
					<span
						className={cn(
							"mt-1.5 gap-1 min-h-4.5 flex w-full items-center",
							action && "pr-20 md:pr-0",
						)}
					>
						{/* Tags that don't fit wrap onto a hidden second line: a tag shows whole, or not at all. */}
						<span className="gap-1 h-4.5 min-w-0 flex flex-1 flex-wrap items-center overflow-hidden">
							<FactTags conversation={conversation} />
						</span>
						<span className="gap-1.5 pl-1.5 ml-auto flex shrink-0 items-center">
							{ownerBadge ? <OwnerFlag conversation={conversation} /> : null}
							{when ? (
								<time
									className="text-micro font-medium text-muted-foreground tabular-nums"
									dateTime={when}
								>
									{hydrated ? formatInboxTimestamp(when, locale) : null}
								</time>
							) : null}
						</span>
					</span>
				</span>
			</button>
			{/* A phone: its 44px target centred on the tags' line. From `md`: the 24px pill on the
			    name's line, so the tags keep the row's whole width. */}
			{action ? (
				<div
					className={cn(
						"right-3 bottom-0 md:top-2 md:bottom-auto absolute whitespace-nowrap",
						shown?.action,
					)}
				>
					{action}
				</div>
			) : null}
		</li>
	);
}
