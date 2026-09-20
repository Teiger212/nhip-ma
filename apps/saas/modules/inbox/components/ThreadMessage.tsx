"use client";

import { Badge, cn } from "@repo/ui";
import { useTranslations } from "next-intl";

import { formatInboxTimestamp } from "../lib/time";
import type { Message } from "../lib/types";
import { useOperatorLanguage } from "./ThreadParts";

/** One message on the thread, with its translation under the original for a guest message. */
export function ThreadMessage({ message }: { message: Message }) {
	const t = useTranslations("inbox");
	const locale = useOperatorLanguage();
	const inbound = message.direction === "in";
	// Rendered as text, never as markup (ADR 0007): a React text node cannot carry HTML.
	const translation = inbound ? message.translations?.[locale] : undefined;
	return (
		<div
			className={cn(
				"px-3 py-2 text-sm rounded-md",
				inbound
					? "border-l-2 border-l-touch bg-card"
					: "ml-6 border-l-2 border-l-foreground/20 bg-muted/40",
			)}
		>
			<div className="mb-1 gap-x-2 text-xs flex flex-wrap items-baseline text-muted-foreground">
				<span className="font-medium text-foreground/80">{message.source}</span>
				<time className="font-mono tabular-nums" dateTime={message.at}>
					{formatInboxTimestamp(message.at, locale)}
				</time>
				{message.mock ? (
					<Badge status="info" className="h-4 px-1.5 font-medium text-[10px] normal-case">
						{t("mock")}
					</Badge>
				) : null}
			</div>
			<div className="leading-relaxed whitespace-pre-wrap">{message.text}</div>
			{translation ? (
				<div className="mt-1.5 pt-1.5 text-xs leading-relaxed border-t border-dashed whitespace-pre-wrap text-muted-foreground">
					<span className="mr-1.5 font-medium tracking-wide text-[10px] text-muted-foreground/80 uppercase">
						{t("translation")}
					</span>
					{translation}
				</div>
			) : null}
		</div>
	);
}
