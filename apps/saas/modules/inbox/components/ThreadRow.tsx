"use client";

import { cn } from "@repo/ui";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

import { displayName } from "../lib/display-name";
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
}: {
	conversation: ConversationSummary;
	active: boolean;
	onOpen: () => void;
	action?: ReactNode;
}) {
	const locale = useLocale();
	const preview = conversation.lastInboundText;
	const name = displayName(conversation);
	const when = conversation.lastGuestInboundAt;
	return (
		// The row stays lit while the pointer is on its action, which sits over it.
		<li className="group relative">
			<button
				type="button"
				aria-current={active ? "true" : undefined}
				className={cn(
					"gap-2.5 px-3 py-2.5 text-sm min-w-0 my-0.5 mx-1.5 w-row-inset ease-out flex cursor-pointer items-start overflow-hidden rounded-xl text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden motion-reduce:transition-none",
					active ? "bg-accent" : "group-hover:bg-muted/70",
				)}
				onClick={onOpen}
			>
				<GuestMark name={name} selected={active} />
				<span className="min-w-0 flex-1">
					<span
						className={cn("gap-2 flex w-full items-baseline justify-between", action && "md:pr-24")}
					>
						<span className="font-semibold tracking-tight font-heading truncate">{name}</span>
						{when ? (
							<time
								className="text-micro shrink-0 text-muted-foreground tabular-nums"
								dateTime={when}
							>
								{formatInboxTimestamp(when, locale)}
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
						<ThreadFlags conversation={conversation} />
					</span>
				</span>
			</button>
			{/* A phone: its 44px target centred on the badges' last line. From `md`: the 24px pill
			    on the name's line, so the badges keep the row's whole width. */}
			{action ? (
				<div className="right-1.5 bottom-0 md:top-2.5 md:bottom-auto absolute">{action}</div>
			) : null}
		</li>
	);
}
