"use client";

import { Badge, Button, cn, Input, Skeleton, Textarea, toast } from "@repo/ui";
import { ChevronLeftIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { formatConversationCrib } from "../lib/crib";
import { arrangeExtractRows, type ExtractRow } from "../lib/extract-rows";
import { guestInitials } from "../lib/guest-initials";
import { useApproveAndSend, useConversations, useRegenerateDraft } from "../lib/inbox-queries";
import { buildQueueView, INBOX_VIEWS, nextSelection, yourTurn } from "../lib/queue";
import { lastInboundText } from "../lib/search";
import { formatInboxTimestamp } from "../lib/time";
import type { Conversation, Message, OperatorLanguage } from "../lib/types";

/** Desktop thread-list column. Same used width, min, and max so detail content cannot flex it. */
const INBOX_LIST_WIDTH = "22rem";

function displayName(conversation: Conversation): string {
	return conversation.guestName || conversation.guestId;
}

/** SaaS routing only serves the operator locales (`modules/i18n/routing.ts`). */
function useOperatorLanguage(): OperatorLanguage {
	return useLocale() as OperatorLanguage;
}

function GuestMark({ name }: { name: string }) {
	return (
		<span
			aria-hidden="true"
			className="size-8 font-semibold tracking-tight flex shrink-0 items-center justify-center rounded-full rounded-md bg-primary bg-touch/12 text-[0.7rem] text-primary-foreground text-touch"
		>
			{guestInitials(name)}
		</span>
	);
}

function CompactFlag({
	children,
	tone,
}: {
	children: ReactNode;
	tone: "neutral" | "warning" | "success";
}) {
	return (
		<span
			className={cn(
				"h-5 px-1.5 font-medium px-2 inline-flex items-center rounded-full rounded-md text-[11px] leading-none",
				tone === "neutral" && "bg-muted text-muted-foreground",
				tone === "warning" && "bg-warning/12 text-warning",
				tone === "success" && "bg-success/12 text-success",
			)}
		>
			{children}
		</span>
	);
}

function ThreadFlags({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const turn = yourTurn(conversation);
	return (
		<>
			<CompactFlag tone="neutral">{t(`pipes.${conversation.pipe}`)}</CompactFlag>
			<CompactFlag tone={turn ? "warning" : "success"}>
				{turn ? t("yourTurn") : t("sent")}
			</CompactFlag>
		</>
	);
}

/** Translate one extract row for display. Presence was decided upstream from the value. */
function useExtractRowText() {
	const t = useTranslations("inbox");
	return (row: ExtractRow): { label: string; value: string } => {
		const label = t(`fields.${row.id}`);
		if (!row.present) {
			return { label, value: row.id === "paperwork" ? t("fields.noneMentioned") : t("missing") };
		}
		switch (row.id) {
			case "language":
				return { label, value: t(`guestLanguage.${String(row.value)}`) };
			case "rentOrBuy":
				return { label, value: t(`intent.${String(row.value)}`) };
			case "inVietnamNow":
				return { label, value: row.value ? t("yes") : t("no") };
			case "paperwork":
				return { label, value: t("paperworkFlag") };
			default:
				return { label, value: String(row.value) };
		}
	};
}

function ExtractRowList({ rows }: { rows: ExtractRow[] }) {
	const text = useExtractRowText();
	return (
		<dl className="gap-x-3 gap-y-1.5 text-sm min-w-0 grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]">
			{rows.map((row) => {
				const { label, value } = text(row);
				return (
					<div key={row.id} className="contents">
						<dt className="font-medium text-muted-foreground">{label}</dt>
						<dd className={row.present ? "font-medium text-foreground" : "text-muted-foreground"}>
							{value}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

function ExtractFields({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const arranged = useMemo(() => arrangeExtractRows(conversation.oneShot), [conversation.oneShot]);
	return (
		<section className="gap-2 p-3 flex flex-col rounded-lg rounded-md bg-muted bg-muted/50">
			<ExtractRowList rows={arranged.visible} />
			{arranged.collapsed.length > 0 ? (
				<details>
					<summary className="text-sm min-h-11 flex cursor-pointer items-center text-muted-foreground">
						{t("missingFields", { count: arranged.collapsed.length })}
					</summary>
					<div className="mt-2">
						<ExtractRowList rows={arranged.collapsed} />
					</div>
				</details>
			) : null}
		</section>
	);
}

function ThreadMessage({ message }: { message: Message }) {
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

function ThreadListSkeleton() {
	return (
		<div className="divide-y" aria-hidden="true">
			{Array.from({ length: 4 }, (_, index) => (
				<div key={index} className="gap-2.5 px-3 py-2.5 flex items-start">
					<Skeleton className="size-8 rounded-md" />
					<div className="min-w-0 flex-1">
						<Skeleton className="mb-1.5 h-3.5 w-28" />
						<Skeleton className="mb-1 h-3 w-full" />
						<Skeleton className="h-3 w-2/3" />
					</div>
				</div>
			))}
		</div>
	);
}

function ThreadListState({ title, action }: { title: string; action?: ReactNode }) {
	return (
		<div className="px-4 py-10 flex flex-col items-center justify-center text-center">
			<p className="text-sm max-w-[22ch] text-pretty text-muted-foreground">{title}</p>
			{action}
		</div>
	);
}

function ThreadRow({
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

/**
 * The reply box shows the operator's edit for the guest message being answered, falling
 * back to the server's suggested reply. Edits are keyed by that message (ADR 0011), so a
 * guest who writes again gets a fresh box instead of a reply meant for their last
 * message, and they are dropped when the reply is sent or a new suggestion is asked for.
 */
function replyKey(conversation: Conversation): string {
	return conversation.unansweredInboundId ?? conversation.id;
}

function useReplyDraft(selected: Conversation | null) {
	const [edits, setEdits] = useState<Record<string, string>>({});
	const key = selected ? replyKey(selected) : null;
	const edited = Boolean(key && key in edits);
	const reply = key ? (edits[key] ?? selected?.oneShot?.draft?.reply ?? "") : "";
	const setReply = (value: string) => {
		if (!key) return;
		setEdits((current) => ({ ...current, [key]: value }));
	};
	const dropEdit = (id: string) =>
		setEdits((current) => {
			if (!(id in current)) return current;
			const next = { ...current };
			delete next[id];
			return next;
		});
	return { reply, edited, setReply, dropEdit };
}

const viewParser = parseAsStringLiteral(INBOX_VIEWS).withDefault("yourTurn");

export function Inbox() {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const conversationsQuery = useConversations();
	const approve = useApproveAndSend();
	const regenerate = useRegenerateDraft();
	const [view, setView] = useQueryState("view", viewParser);
	const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);

	const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
	const queue = useMemo(
		() => buildQueueView(conversations, view, query),
		[conversations, view, query],
	);
	const ordered = useMemo(() => [...queue.visible, ...queue.quiet], [queue.visible, queue.quiet]);

	// Selection follows the list: stays put while the thread is there, otherwise advances
	// (this is what moves to the next waiting guest after a send).
	useEffect(() => {
		const next = nextSelection(ordered, selectedId);
		if (next !== selectedId) setSelectedId(next);
	}, [ordered, selectedId]);

	const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
	const { reply, edited, setReply, dropEdit } = useReplyDraft(selected);
	const cribNotes = selected
		? formatConversationCrib(selected, (key, values) => t(key, values))
		: null;
	const canApprove = Boolean(selected?.unansweredInboundId) && reply.trim().length > 0;

	async function onApprove() {
		if (!selected || !selected.unansweredInboundId || !reply.trim() || approve.isPending) return;
		setSendError(null);
		const inboundId = selected.unansweredInboundId;
		try {
			const result = await approve.mutateAsync({ id: selected.id, inboundId, reply });
			dropEdit(inboundId);
			toast.add({
				title: t("sentTo", { name: displayName(result.conversation) }),
				type: "success",
			});
			if (view !== "yourTurn") setSelectedId(result.conversation.id);
		} catch (error) {
			setSendError(error instanceof Error ? error.message : t("sendFailed"));
		}
	}

	async function onRegenerate() {
		if (!selected || !selected.unansweredInboundId || regenerate.isPending) return;
		try {
			await regenerate.mutateAsync({ id: selected.id });
			dropEdit(replyKey(selected));
		} catch (error) {
			toast.add({
				title: error instanceof Error ? error.message : t("regenerateFailed"),
				type: "error",
			});
		}
	}

	function openThread(id: string) {
		setSelectedId(id);
		setDetailOpen(true);
	}

	const lastAnswer = selected?.lastAnswer ?? null;
	const sendStatus = approve.isPending
		? { text: t("sending"), kind: "" as const, quiet: false }
		: sendError
			? { text: sendError, kind: "warn" as const, quiet: false }
			: lastAnswer?.status === "unknown"
				? { text: t("deliveryUnknown"), kind: "warn" as const, quiet: false }
				: selected && !selected.unansweredInboundId && selected.sentAt
					? {
							text: t("alreadySent", { at: formatInboxTimestamp(selected.sentAt, locale) }),
							kind: "ok" as const,
							quiet: false,
						}
					: { text: t("notSent"), kind: "" as const, quiet: true };

	const draftSource = selected?.oneShot?.draft?.source ?? "template";

	function rows(list: Conversation[]) {
		return list.map((conversation) => (
			<ThreadRow
				key={conversation.id}
				conversation={conversation}
				active={conversation.id === selectedId}
				onOpen={() => openThread(conversation.id)}
			/>
		));
	}

	function listBody() {
		if (conversationsQuery.isPending) return <ThreadListSkeleton />;
		if (conversationsQuery.isError) {
			return (
				<ThreadListState
					title={t("loadError")}
					action={
						<Button
							type="button"
							variant="outline"
							className="mt-3 min-h-11"
							onClick={() => void conversationsQuery.refetch()}
						>
							{t("retry")}
						</Button>
					}
				/>
			);
		}
		if (queue.visible.length === 0 && queue.quiet.length === 0) {
			const title =
				conversations.length === 0
					? t("empty")
					: queue.caughtUp
						? t("allCaughtUp")
						: t("noMatches");
			return (
				<ThreadListState
					title={title}
					action={
						queue.caughtUp && queue.counts.sent > 0 ? (
							<Button
								type="button"
								variant="outline"
								className="mt-3 min-h-11"
								onClick={() => void setView("sent")}
							>
								{t("viewSent")}
							</Button>
						) : null
					}
				/>
			);
		}
		return (
			<>
				{queue.visible.length === 0 ? (
					<ThreadListState title={t("onlyQuiet")} />
				) : (
					rows(queue.visible)
				)}
				{queue.quiet.length > 0 ? (
					<details className="border-t">
						<summary className="min-h-11 px-3 text-xs font-medium gap-2 flex cursor-pointer items-center text-muted-foreground">
							{t("quiet", { count: queue.quiet.length })}
						</summary>
						<p className="px-3 pb-2 text-xs text-pretty text-muted-foreground">{t("quietHint")}</p>
						{rows(queue.quiet)}
					</details>
				) : null}
			</>
		);
	}

	return (
		<div className="min-h-0 text-sm flex h-full flex-col bg-background text-foreground">
			<div
				className={cn(
					"px-3 py-3 flex shrink-0 items-center border-b",
					detailOpen && "md:flex hidden",
				)}
			>
				<div className="relative w-full">
					<SearchIcon
						aria-hidden="true"
						className="left-4 size-4 pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id="inbox-search"
						value={query}
						onChange={(event) => void setQuery(event.target.value || null)}
						placeholder={t("searchPlaceholder")}
						aria-label={t("searchAria")}
						className="h-12 min-h-12 px-4 py-3 pl-12 text-base rounded-full rounded-md border-transparent bg-muted shadow-none"
					/>
				</div>
			</div>
			<div
				className={cn(
					"px-3 py-2 gap-2 flex shrink-0 flex-wrap items-center justify-between border-b",
					detailOpen && "md:flex hidden",
				)}
			>
				<div className="gap-0 p-0.5 inline-flex rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)]">
					{INBOX_VIEWS.map((option) => {
						const active = option === view;
						return (
							<button
								key={option}
								type="button"
								aria-pressed={active}
								onClick={() => void setView(option)}
								className={cn(
									"h-8 px-3 text-xs font-semibold gap-1.5 inline-flex cursor-pointer items-center rounded-full transition-colors",
									"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
									active
										? "shadow-xs border border-border bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t(`views.${option}`)}
								<span className="font-mono text-[10px] tabular-nums opacity-70">
									{queue.counts[option]}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-xs text-muted-foreground" aria-live="polite">
					{t("queueCount", { count: queue.counts.yourTurn })}
				</p>
			</div>
			<div className="min-h-0 min-w-0 flex flex-1 overflow-hidden">
				<aside
					style={{ "--inbox-list-width": INBOX_LIST_WIDTH } as CSSProperties}
					className={cn(
						"min-h-0 min-w-0 flex-col overflow-hidden bg-card/40",
						"md:w-[var(--inbox-list-width)] md:min-w-[var(--inbox-list-width)] md:max-w-[var(--inbox-list-width)] w-full",
						"md:flex md:flex-none md:shrink-0 md:grow-0 md:basis-[var(--inbox-list-width)] md:border-r",
						detailOpen ? "md:flex hidden" : "md:flex-none flex flex-1",
					)}
				>
					<div
						className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
						aria-busy={conversationsQuery.isFetching}
					>
						{listBody()}
					</div>
				</aside>
				<article
					className={cn(
						"min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
						detailOpen ? "flex" : "md:flex hidden",
					)}
				>
					{!selected ? (
						<ThreadListState title={t("noneSelected")} />
					) : (
						<>
							<header className="gap-2 px-3 py-2 flex shrink-0 flex-wrap items-center border-b bg-card/40 bg-muted/60">
								<Button
									type="button"
									variant="ghost"
									className="md:hidden min-h-11 min-w-11 gap-1 px-2"
									onClick={() => setDetailOpen(false)}
									aria-label={t("backAria")}
								>
									<ChevronLeftIcon className="size-4" />
									{t("back")}
								</Button>
								<GuestMark name={displayName(selected)} />
								<p className="font-semibold tracking-tight font-heading">{displayName(selected)}</p>
								<ThreadFlags conversation={selected} />
							</header>
							<div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
								<div className="max-w-3xl gap-3 p-3 min-w-0 mx-auto flex flex-col">
									{selected.messages.map((message) => (
										<ThreadMessage key={message.id} message={message} />
									))}
									<div className="border-t" />
									<ExtractFields conversation={selected} />
									{cribNotes ? (
										<section className="gap-1.5 p-3 flex flex-col rounded-lg rounded-md border-l-2 border-l-primary bg-primary/6 bg-touch/8">
											<h2 className="font-semibold tracking-tight text-sm">{t("forYou")}</h2>
											<p className="text-xs text-muted-foreground">{t("forYouHint")}</p>
											<p className="leading-relaxed whitespace-pre-wrap">{cribNotes}</p>
										</section>
									) : null}
									<section className="gap-1.5 flex flex-col">
										<div className="gap-2 flex flex-wrap items-center justify-between">
											<label
												htmlFor="inbox-reply"
												className="font-semibold tracking-tight text-sm font-heading"
											>
												{t("reply")}
											</label>
											{canApprove ? (
												<div className="gap-2 flex items-center">
													{!edited ? (
														<span className="text-xs text-muted-foreground">
															{draftSource === "model"
																? t("suggested.model")
																: t("suggested.template")}
														</span>
													) : null}
													<Button
														type="button"
														variant="ghost"
														className="h-8 min-h-8 gap-1.5 px-2 text-xs"
														disabled={regenerate.isPending}
														onClick={() => void onRegenerate()}
													>
														<RefreshCwIcon
															aria-hidden="true"
															className={cn("size-3.5", regenerate.isPending && "animate-spin")}
														/>
														{regenerate.isPending ? t("regenerating") : t("regenerate")}
													</Button>
												</div>
											) : null}
										</div>
										<Textarea
											id="inbox-reply"
											value={reply}
											onChange={(event) => setReply(event.target.value)}
											className="min-h-28 text-sm rounded-lg rounded-md shadow-none"
											aria-label={t("reply")}
										/>
									</section>
								</div>
							</div>
							<div className="px-3 py-2 gap-3 flex shrink-0 items-center justify-between border-t bg-card bg-muted/40">
								<output
									aria-live="polite"
									aria-atomic="true"
									className={cn(
										"text-xs",
										sendStatus.quiet
											? "sr-only"
											: cn(
													"font-medium min-w-0 flex-1 truncate",
													sendStatus.kind === "warn" ? "text-destructive" : "text-muted-foreground",
												),
									)}
								>
									{sendStatus.text}
								</output>
								<Button
									type="button"
									variant="primary"
									className="min-h-11 ml-auto shrink-0"
									disabled={!canApprove || approve.isPending}
									onClick={() => void onApprove()}
								>
									{t("approveAndSend")}
								</Button>
							</div>
						</>
					)}
				</article>
			</div>
			<footer
				className={cn(
					"px-3 py-2 text-xs md:hidden shrink-0 border-t text-pretty text-muted-foreground",
					detailOpen && "hidden",
				)}
			>
				{t("footer")}
			</footer>
		</div>
	);
}
