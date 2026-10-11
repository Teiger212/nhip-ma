"use client";

import { LocaleLink } from "@i18n/routing";
import { FactTag, LanguageMark, PipeLabel, ThreadListState } from "@inbox/components/ThreadParts";
import { guestLabel } from "@inbox/lib/display-name";
import { languageTone } from "@inbox/lib/fact-tags";
import { useConversations, useOfficeRole } from "@inbox/lib/inbox-queries";
import { languageName } from "@inbox/lib/language-name";
import { quietIds, waitingNow } from "@inbox/lib/queue";
import { Badge, Button, Card, Skeleton } from "@repo/ui";
import { useHydrated } from "@shared/hooks/use-hydrated";
import { ArrowRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment } from "react";

import { durationParts, formatDuration } from "../lib/duration";
import { PanelTitle } from "./HomeParts";

/** As many as fit beside the chart; the rest are one tap away in the inbox. */
const SHOWN = 5;

/**
 * Waiting now (#314): the guests whose turn it is, in the inbox's own order (fresh first, quiet
 * threads last), read from the inbox's query so the two never disagree; a manager's lists the
 * Unassigned leads first (ADR 0022). Where the quiet guests start, a small divider says so, by
 * the inbox's own split (`quietIds`). Each row opens its thread: the guest's language mark, their
 * name, the pipe and their language as its tag, and how long they have waited. It is Home's one
 * raised sheet.
 */
export function WaitingNow() {
	const t = useTranslations("home");
	const tInbox = useTranslations("inbox");
	const locale = useLocale();
	const query = useConversations();
	const { role, pending: rolePending } = useOfficeRole();
	const conversations = query.data ?? [];
	// The clock is read once hydrated: the server's "now" is not the browser's (`useHydrated`).
	const hydrated = useHydrated();
	const now = Date.now();
	const waiting = waitingNow(conversations, { manager: role === "manager" }, now);
	const quiet = quietIds(conversations, now);
	const shown = waiting.slice(0, SHOWN);
	const more = waiting.length - shown.length;
	const units = { day: t("units.day"), hour: t("units.hour"), minute: t("units.minute") };

	return (
		<div className="min-w-0 grid rounded-3xl shadow-raised">
			<Card className="min-w-0 flex flex-col" aria-labelledby="home-waiting-now">
				<PanelTitle
					id="home-waiting-now"
					meta={
						waiting.length > 0 ? (
							<Badge status="ink" data-test="waiting-now-count">
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
								<Skeleton className="size-7 rounded-lg" />
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
					<ul data-test="waiting-now" className="px-2 pt-2 flex flex-col">
						{shown.map((conversation, index) => {
							const name = guestLabel(conversation).text;
							const language = conversation.guestLanguage;
							const since = conversation.lastGuestInboundAt;
							const waitedMs = since && hydrated ? now - new Date(since).getTime() : null;
							// The quiet guests start here: a fresh one (or none) before, a quiet one now.
							const quietStarts =
								quiet.has(conversation.id) && (index === 0 || !quiet.has(shown[index - 1].id));
							return (
								<Fragment key={conversation.id}>
									{quietStarts ? (
										<li
											data-test="waiting-now-quiet"
											className="gap-2 px-2.5 pt-2.5 pb-1 text-micro font-bold flex items-center whitespace-nowrap text-muted-foreground after:h-px after:flex-1 after:bg-border"
										>
											{t("quietDivider")}
										</li>
									) : null}
									<li className="before:inset-x-2.5 before:top-0 relative before:absolute before:h-px before:bg-border first:before:hidden">
										<LocaleLink
											href={`/inbox?thread=${encodeURIComponent(conversation.id)}`}
											className="gap-3 px-2.5 py-2 min-h-13 ease-out flex items-center rounded-xl transition-colors duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden motion-reduce:transition-none"
										>
											<LanguageMark code={language} chip="yourTurn" />
											<span className="min-w-0 flex-1">
												<span className="text-sm font-bold block truncate">{name}</span>
												<span className="mt-0.5 gap-1.5 h-4.5 flex items-center overflow-hidden">
													<PipeLabel pipe={conversation.pipe} />
													{language ? (
														// The guest language, named whatever it is (#245).
														<FactTag tone={languageTone(language)}>
															{languageName(language, locale, (supported) =>
																tInbox(`guestLanguage.${supported}`),
															)}
														</FactTag>
													) : null}
												</span>
											</span>
											{waitedMs !== null ? (
												<span
													className="text-note font-extrabold shrink-0 tabular-nums"
													title={t("waitedFor", { duration: formatDuration(waitedMs, units) })}
												>
													{durationParts(waitedMs, units).map((part, at) =>
														part.number ? (
															<span key={at}>{part.value}</span>
														) : (
															<span
																key={at}
																className="font-semibold whitespace-pre text-muted-foreground"
															>
																{part.value}
															</span>
														),
													)}
												</span>
											) : null}
										</LocaleLink>
									</li>
								</Fragment>
							);
						})}
					</ul>
				)}
				<div className="px-4 pt-3 pb-4 mt-auto">
					<Button
						variant="outline"
						className="min-h-11 md:min-h-10 w-full"
						render={(props) => (
							<LocaleLink {...props} href="/inbox">
								{more > 0 ? t("openInboxMore", { count: more }) : t("openInbox")}
								<span aria-hidden="true" className="ml-2 flex">
									<ArrowRightIcon className="size-4" />
								</span>
							</LocaleLink>
						)}
					/>
				</div>
			</Card>
		</div>
	);
}
