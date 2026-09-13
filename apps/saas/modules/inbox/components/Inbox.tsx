"use client";

import { Badge, Button, cn, Input, Skeleton, Textarea, toast } from "@repo/ui";
import { ChevronLeftIcon, SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { formatConversationCrib } from "../lib/crib";
import { arrangeExtractRows, type ExtractRow } from "../lib/extract-rows";
import { guestInitials } from "../lib/guest-initials";
import { useApproveAndSend, useConversations } from "../lib/inbox-queries";
import { buildQueueView, INBOX_VIEWS, nextSelection } from "../lib/queue";
import { lastInboundText } from "../lib/search";
import { formatInboxTimestamp } from "../lib/time";
import type { Conversation, Message } from "../lib/types";

/** Desktop thread-list column. Same used width, min, and max so detail content cannot flex it. */
const INBOX_LIST_WIDTH = "22rem";

function displayName(conversation: Conversation): string {
	return conversation.guestName || conversation.guestId;
}

function GuestMark({ name }: { name: string }) {
	return (
		<span
			aria-hidden="true"
			className="size-8 font-semibold tracking-tight swiss:rounded-none swiss:border swiss:border-touch/40 swiss:bg-transparent flat:rounded-full flat:bg-primary flat:text-primary-foreground flex shrink-0 items-center justify-center rounded-md bg-touch/12 text-[0.7rem] text-touch"
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
				"h-5 px-1.5 font-medium swiss:rounded-none swiss:text-[10px] swiss:uppercase swiss:tracking-[0.06em] flat:rounded-full flat:px-2 inline-flex items-center rounded-md text-[11px] leading-none",
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
	return (
		<>
			<CompactFlag tone="neutral">{t(`pipes.${conversation.pipe}`)}</CompactFlag>
			<CompactFlag tone={conversation.sentAt ? "success" : "warning"}>
				{conversation.sentAt ? t("sent") : t("needsApprove")}
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
		<section className="gap-2 p-3 swiss:rounded-none swiss:border-y swiss:bg-transparent swiss:px-0 flat:rounded-lg flat:bg-muted flex flex-col rounded-md bg-muted/50">
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
	const locale = useLocale();
	const inbound = message.direction === "in";
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
				"gap-2.5 px-3 py-2.5 font-normal min-w-0 swiss:border-b swiss:border-b-border swiss:py-3 flat:my-0.5 flat:mx-1.5 flat:w-[calc(100%-0.75rem)] flat:rounded-lg flat:border-l-0 h-auto w-full items-start justify-start overflow-hidden rounded-none border-l-2 border-l-transparent text-left active:scale-100",
				active
					? "flat:bg-primary/8 flat:hover:bg-primary/12 border-l-touch bg-sidebar-accent/80 hover:bg-sidebar-accent"
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
 * The reply box shows the operator's edit for the selected thread, falling back to the
 * server draft. Edits are keyed by thread id and dropped when that thread is sent, so a
 * background refetch never overwrites what the operator typed.
 */
function useReplyDraft(selected: Conversation | null) {
	const [edits, setEdits] = useState<Record<string, string>>({});
	const reply = selected ? (edits[selected.id] ?? selected.oneShot?.draft?.reply ?? "") : "";
	const setReply = (value: string) => {
		if (!selected) return;
		setEdits((current) => ({ ...current, [selected.id]: value }));
	};
	const dropEdit = (id: string) =>
		setEdits((current) => {
			if (!(id in current)) return current;
			const next = { ...current };
			delete next[id];
			return next;
		});
	return { reply, setReply, dropEdit };
}

const viewParser = parseAsStringLiteral(INBOX_VIEWS).withDefault("needsReply");

export function Inbox() {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const conversationsQuery = useConversations();
	const approve = useApproveAndSend();
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

	// Selection follows the visible queue: stays put while visible, otherwise advances
	// (this is what moves to the next waiting guest after a send).
	useEffect(() => {
		const next = nextSelection(queue.visible, selectedId);
		if (next !== selectedId) setSelectedId(next);
	}, [queue.visible, selectedId]);

	const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
	const { reply, setReply, dropEdit } = useReplyDraft(selected);
	const cribNotes = selected
		? formatConversationCrib(selected, (key, values) => t(key, values))
		: null;

	async function onApprove() {
		if (!selected || selected.sentAt || approve.isPending) return;
		setSendError(null);
		try {
			const result = await approve.mutateAsync({ id: selected.id, reply });
			dropEdit(selected.id);
			toast.add({
				title: t("sentTo", { name: displayName(result.conversation) }),
				type: "success",
			});
			if (view !== "needsReply") setSelectedId(result.conversation.id);
		} catch (error) {
			setSendError(error instanceof Error ? error.message : t("sendFailed"));
		}
	}

	function openThread(id: string) {
		setSelectedId(id);
		setDetailOpen(true);
	}

	const sendStatus = approve.isPending
		? { text: t("sending"), kind: "" as const, quiet: false }
		: sendError
			? { text: sendError, kind: "warn" as const, quiet: false }
			: selected?.sentAt
				? {
						text: t("alreadySent", { at: formatInboxTimestamp(selected.sentAt, locale) }),
						kind: "ok" as const,
						quiet: false,
					}
				: { text: t("notSent"), kind: "" as const, quiet: true };

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
		if (queue.visible.length === 0) {
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
		return queue.visible.map((conversation) => (
			<ThreadRow
				key={conversation.id}
				conversation={conversation}
				active={conversation.id === selectedId}
				onOpen={() => openThread(conversation.id)}
			/>
		));
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
						className="h-12 min-h-12 px-4 py-3 pl-12 text-base swiss:rounded-none flat:rounded-full flat:border-transparent flat:bg-muted rounded-md shadow-none"
					/>
				</div>
			</div>
			<div
				className={cn(
					"px-3 py-2 gap-2 flex shrink-0 flex-wrap items-center justify-between border-b",
					detailOpen && "md:flex hidden",
				)}
			>
				<div className="gap-0 p-0.5 swiss:rounded-none inline-flex rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)]">
					{INBOX_VIEWS.map((option) => {
						const active = option === view;
						return (
							<button
								key={option}
								type="button"
								aria-pressed={active}
								onClick={() => void setView(option)}
								className={cn(
									"h-8 px-3 text-xs font-semibold gap-1.5 swiss:rounded-none inline-flex cursor-pointer items-center rounded-full transition-colors",
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
					{t("queueCount", { count: queue.counts.needsReply })}
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
							<header className="gap-2 px-3 py-2 swiss:bg-transparent flat:bg-muted/60 flex shrink-0 flex-wrap items-center border-b bg-card/40">
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
										<section className="gap-1.5 p-3 swiss:rounded-none swiss:border-l-2 swiss:border-l-primary swiss:bg-primary/5 flat:rounded-lg flat:border-l-2 flat:border-l-primary flat:bg-primary/6 flex flex-col rounded-md bg-touch/8">
											<h2 className="font-semibold tracking-tight text-sm">{t("forYou")}</h2>
											<p className="text-xs text-muted-foreground">{t("forYouHint")}</p>
											<p className="leading-relaxed whitespace-pre-wrap">{cribNotes}</p>
										</section>
									) : null}
									<section className="gap-1.5 flex flex-col">
										<label
											htmlFor="inbox-reply"
											className="font-semibold tracking-tight text-sm font-heading"
										>
											{t("reply")}
										</label>
										<Textarea
											id="inbox-reply"
											value={reply}
											onChange={(event) => setReply(event.target.value)}
											className="min-h-28 text-sm swiss:rounded-none flat:rounded-lg rounded-md shadow-none"
											aria-label={t("reply")}
										/>
									</section>
								</div>
							</div>
							<div className="px-3 py-2 gap-3 swiss:bg-background flat:bg-muted/40 flex shrink-0 items-center justify-between border-t bg-card">
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
									disabled={Boolean(selected.sentAt) || approve.isPending}
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
