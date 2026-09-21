"use client";

import { Button, cn } from "@repo/ui";
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
		<Button
			type="button"
			variant="ghost"
			aria-current={active ? "true" : undefined}
			className={cn(
				"gap-2.5 px-3 py-2.5 font-normal min-w-0 my-0.5 mx-1.5 h-auto w-[calc(100%-0.75rem)] w-full items-start justify-start overflow-hidden rounded-lg rounded-none border-l-0 border-l-2 border-l-transparent text-left active:scale-100",
				active
					? "border-l-touch bg-primary/8 bg-sidebar-accent/80 hover:bg-primary/12 hover:bg-sidebar-accent"
					: "hover:bg-muted/70",
			)}
			onClick={onOpen}
		>
			<GuestMark name={name} />
			<span className="min-w-0 flex-1">
				<span className="gap-2 flex w-full items-baseline justify-between">
					<span className="font-semibold tracking-tight font-heading truncate">{name}</span>
					{when ? (
						<time
							className="font-mono shrink-0 text-[11px] text-muted-foreground tabular-nums"
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
		</Button>
	);
}
