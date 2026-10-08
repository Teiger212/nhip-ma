"use client";

import { LocaleLink } from "@i18n/routing";
import { GuestMark, ThreadListState } from "@inbox/components/ThreadParts";
import { displayName } from "@inbox/lib/display-name";
import { useConversations, useOfficeRole } from "@inbox/lib/inbox-queries";
import { languageName } from "@inbox/lib/language-name";
import { waitingNow } from "@inbox/lib/queue";
import { Badge, Button, Card, Skeleton } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";

import { formatDuration } from "../lib/duration";
import { PanelTitle } from "./HomeParts";

/** As many as fit beside the chart; the rest are one tap away in the inbox. */
const SHOWN = 5;

/**
 * Waiting now: the guests whose turn it is, in the inbox's own order (oldest waiting
 * first, quiet threads last), read from the inbox's query so the two never disagree. Each
 * row opens its thread. Only threads this operator can open are listed, and a manager's lists
 * the Unassigned leads first (ADR 0022).
 */
export function WaitingNow() {
	const t = useTranslations("home");
	const tInbox = useTranslations("inbox");
	const locale = useLocale();
	const query = useConversations();
	const { role, pending: rolePending } = useOfficeRole();
	const waiting = waitingNow(query.data ?? [], { manager: role === "manager" });
	const shown = waiting.slice(0, SHOWN);
	const more = waiting.length - shown.length;
	const now = Date.now();

	return (
		<Card className="min-w-0 flex flex-col" aria-labelledby="home-waiting-now">
			<PanelTitle
				id="home-waiting-now"
				meta={
					waiting.length > 0 ? (
						<Badge status="warning" numeric data-test="waiting-now-count">
							{waiting.length}
						</Badge>
					) : null
				}
			>
				{t("waitingNow")}
			</PanelTitle>
			{query.isPending || rolePending ? (
				<ul aria-hidden="true" className="gap-1 px-2 pt-2 flex flex-col">
					{[0, 1, 2].map((row) => (
						<li key={row} className="gap-2.5 px-3 py-2.5 flex items-center">
							<Skeleton className="size-8 rounded-md" />
							<span className="gap-1.5 flex flex-1 flex-col">
								<Skeleton className="h-3.5 w-24" />
								<Skeleton className="h-3 w-32" />
							</span>
						</li>
					))}
				</ul>
			) : query.isError ? (
				<ThreadListState
					title={t("waitingFailed")}
					testId="waiting-now-failed"
					action={
						<Button
							variant="outline"
							className="mt-3 min-h-11"
							onClick={() => void query.refetch()}
						>
							{tInbox("retry")}
						</Button>
					}
				/>
			) : waiting.length === 0 ? (
				<ThreadListState title={t("waitingEmpty")} testId="waiting-now-empty" />
			) : (
				<ul data-test="waiting-now" className="gap-0.5 px-2 pt-2 flex flex-col">
					{shown.map((conversation) => {
						const name = displayName(conversation);
						const language = conversation.guestLanguage;
						const since = conversation.lastGuestInboundAt;
						const waited = since ? formatDuration(now - new Date(since).getTime(), locale) : null;
						return (
							<li key={conversation.id}>
								<LocaleLink
									href={`/inbox?thread=${encodeURIComponent(conversation.id)}`}
									className="gap-2.5 px-3 py-2.5 min-h-14 ease-out flex items-center rounded-xl transition-colors duration-200 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden motion-reduce:transition-none"
								>
									<GuestMark name={name} />
									<span className="min-w-0 flex-1">
										<span className="font-semibold text-sm tracking-tight font-heading block truncate">
											{name}
										</span>
										<span className="mt-0.5 gap-1.5 text-xs flex items-center text-muted-foreground">
											<Badge status="neutral">{tInbox(`pipes.${conversation.pipe}`)}</Badge>
											{language ? (
												<span className="truncate">
													{/* The guest language, named whatever it is (#245). */}
													{languageName(language, locale, (supported) =>
														tInbox(`guestLanguage.${supported}`),
													)}
												</span>
											) : null}
										</span>
									</span>
									{waited ? (
										<span
											className="text-xs font-medium shrink-0 text-warning tabular-nums"
											title={t("waitedFor", { duration: waited })}
										>
											{waited}
										</span>
									) : null}
								</LocaleLink>
							</li>
						);
					})}
				</ul>
			)}
			<div className="px-4 pt-2 pb-4 mt-auto">
				<Button
					variant="outline"
					className="min-h-11 w-full"
					render={(props) => (
						<LocaleLink {...props} href="/inbox">
							{more > 0 ? t("openInboxMore", { count: more }) : t("openInbox")}
						</LocaleLink>
					)}
				/>
			</div>
		</Card>
	);
}
