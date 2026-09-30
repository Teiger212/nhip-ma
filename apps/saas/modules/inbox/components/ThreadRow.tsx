"use client";

import { cn } from "@repo/ui";
import { useLocale } from "next-intl";

import { displayName } from "../lib/display-name";
import { lastInboundText } from "../lib/search";
import { formatInboxTimestamp } from "../lib/time";
import type { Conversation } from "../lib/types";
import { GuestMark, ThreadFlags } from "./ThreadParts";

/** One thread in the list: guest, when they last wrote, a preview, the pipe and the turn. */
export function ThreadRow({
	conversation,
	active,
	onOpen,
}: {
	conversation: Conversation;
	active: boolean;
	onOpen: () => void;
}) {
	const locale = useLocale();
	const preview = lastInboundText(conversation);
	const name = displayName(conversation);
	const when = conversation.lastGuestInboundAt;
	return (
		<button
			type="button"
			aria-current={active ? "true" : undefined}
			className={cn(
				"gap-2.5 px-3 py-2.5 text-sm min-w-0 my-0.5 mx-1.5 w-row-inset ease-out flex cursor-pointer items-start overflow-hidden border-l-2 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden motion-reduce:transition-none",
				active
					? "border-l-touch bg-sidebar-accent/80 hover:bg-sidebar-accent"
					: "border-l-transparent hover:bg-muted/70",
			)}
			onClick={onOpen}
		>
			<GuestMark name={name} />
			<span className="min-w-0 flex-1">
				<span className="gap-2 flex w-full items-baseline justify-between">
					<span className="font-semibold tracking-tight font-heading truncate">{name}</span>
					{when ? (
						<time
							className="font-mono text-micro shrink-0 text-muted-foreground tabular-nums"
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
				<span className="mt-1.5 gap-1 flex flex-wrap items-center">
					<ThreadFlags conversation={conversation} />
				</span>
			</span>
		</button>
	);
}
