"use client";

import { Badge, Button, cn, Input, Skeleton, Textarea, toast } from "@repo/ui";
import { ChevronLeftIcon, SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";

import { formatConversationCrib } from "../lib/crib";
import { arrangeExtractRows, isEmptyExtractValue } from "../lib/extract-rows";
import { guestInitials } from "../lib/guest-initials";
import { lastInboundText, matchesThreadSearch } from "../lib/search";
import { formatInboxTimestamp } from "../lib/time";
import type { Conversation, Message } from "../lib/types";

/** Desktop thread-list column. Same used width, min, and max so detail content cannot flex it. */
const INBOX_LIST_WIDTH = "22rem";

/** The inbox is a queue: the default view is what still needs a first reply. */
const INBOX_VIEWS = ["needsReply", "sent", "all"] as const;
type InboxView = (typeof INBOX_VIEWS)[number];

function inView(conversation: Conversation, view: InboxView): boolean {
	if (view === "all") return true;
	return view === "sent" ? Boolean(conversation.sentAt) : !conversation.sentAt;
}

/** Oldest waiting guest first for the queue; most recent activity first elsewhere. */
function sortForView(list: Conversation[], view: InboxView): Conversation[] {
	const time = (value: string | null) => (value ? new Date(value).getTime() : 0);
	return [...list].sort((a, b) =>
		view === "needsReply"
			? time(a.lastGuestInboundAt) - time(b.lastGuestInboundAt)
			: time(b.updatedAt) - time(a.updatedAt),
	);
}

function field(value: unknown, labels: { missing: string; yes: string; no: string }): string {
	if (value === null || value === undefined || value === "") {
		return labels.missing;
	}
	if (value === true) {
		return labels.yes;
	}
	if (value === false) {
		return labels.no;
	}
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}
	return labels.missing;
}

function displayName(conversation: Conversation): string {
	return conversation.guestName || conversation.guestId;
}

function pipeLabel(pipe: Conversation["pipe"], t: (key: string) => string): string {
	return t(`pipes.${pipe}`);
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
	const res = await fetch(url, opts);
	const data = (await res.json().catch(() => ({}))) as T & {
		error?: string;
		message?: string;
	};
	if (!res.ok) {
		throw Object.assign(new Error(data.message || data.error || res.statusText), {
			data,
			status: res.status,
		});
	}
	return data;
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

function ExtractRowList({ rows }: { rows: Array<{ id: string; label: string; value: string }> }) {
	const t = useTranslations("inbox");
	return (
		<dl className="gap-x-3 gap-y-1.5 text-sm min-w-0 grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]">
			{rows.map((row) => (
				<div key={row.id} className="contents">
					<dt className="font-medium text-muted-foreground">{row.label}</dt>
					<dd
						className={
							isEmptyExtractValue(row.value, [t("missing"), t("fields.noneMentioned")])
								? "text-muted-foreground"
								: "font-medium text-foreground"
						}
					>
						{row.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function ExtractFields({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const labels = {
		missing: t("missing"),
		yes: t("yes"),
		no: t("no"),
	};
	const q = conversation.oneShot?.qualification;
	const paper = conversation.oneShot?.paperwork;
	const language = conversation.oneShot?.language;
	const languageValue = language ? t(`guestLanguage.${language}`) : t("missing");
	const areaValue = field(q?.areaOfInterest, labels);
	const nationalityValue = field(q?.nationality, labels);
	const inVietnamValue = field(q?.inVietnamNow, labels);
	const rentOrBuyValue =
		q?.rentOrBuy === "rent" || q?.rentOrBuy === "buy"
			? t(`intent.${q.rentOrBuy}`)
			: field(q?.rentOrBuy, labels);
	const moveInValue = field(q?.timeframe, labels);
	const budgetValue = field(q?.budgetBand, labels);
	const bedsValue = field(q?.bedsOrHousehold, labels);
	const paperworkMentioned = Boolean(paper?.mentioned);
	const paperworkValue = paperworkMentioned ? t("paperworkFlag") : t("fields.noneMentioned");
	const emptyLabels = [t("missing"), t("fields.noneMentioned")];
	const arranged = arrangeExtractRows([
		{
			id: "language",
			label: t("fields.language"),
			value: languageValue,
			isEmpty: !language,
		},
		{
			id: "area",
			label: t("fields.area"),
			value: areaValue,
			isEmpty: isEmptyExtractValue(areaValue, emptyLabels),
		},
		{
			id: "nationality",
			label: t("fields.nationality"),
			value: nationalityValue,
			isEmpty: isEmptyExtractValue(nationalityValue, emptyLabels),
		},
		{
			id: "inVietnamNow",
			label: t("fields.inVietnamNow"),
			value: inVietnamValue,
			isEmpty: isEmptyExtractValue(inVietnamValue, emptyLabels),
		},
		{
			id: "rentOrBuy",
			label: t("fields.rentOrBuy"),
			value: rentOrBuyValue,
			isEmpty: isEmptyExtractValue(rentOrBuyValue, emptyLabels),
		},
		{
			id: "moveIn",
			label: t("fields.moveIn"),
			value: moveInValue,
			isEmpty: isEmptyExtractValue(moveInValue, emptyLabels),
		},
		{
			id: "budget",
			label: t("fields.budget"),
			value: budgetValue,
			isEmpty: isEmptyExtractValue(budgetValue, emptyLabels),
		},
		{
			id: "beds",
			label: t("fields.beds"),
			value: bedsValue,
			isEmpty: isEmptyExtractValue(bedsValue, emptyLabels),
		},
		{
			id: "paperwork",
			label: t("fields.paperwork"),
			value: paperworkValue,
			isEmpty: !paperworkMentioned,
			forceVisible: paperworkMentioned,
		},
	]);

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

function SendStatus({
	status,
	statusKind,
	visuallyQuiet,
}: {
	status: string;
	statusKind: "ok" | "warn" | "";
	visuallyQuiet: boolean;
}) {
	return (
		<output
			aria-live="polite"
			aria-atomic="true"
			className={cn(
				"text-xs",
				visuallyQuiet
					? "sr-only"
					: cn(
							"font-medium min-w-0 flex-1 truncate",
							statusKind === "warn" ? "text-destructive" : "text-muted-foreground",
						),
			)}
		>
			{status}
		</output>
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

export function Inbox() {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [view, setView] = useState<InboxView>("needsReply");
	const [reply, setReply] = useState("");
	const [status, setStatus] = useState("");
	const [statusKind, setStatusKind] = useState<"ok" | "warn" | "">("");
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [approving, setApproving] = useState(false);
	const selectedIdRef = useRef(selectedId);
	const refreshRequestIdRef = useRef(0);

	useEffect(() => {
		selectedIdRef.current = selectedId;
	}, [selectedId]);

	const visible = useMemo(
		() =>
			sortForView(
				conversations.filter(
					(conversation) => inView(conversation, view) && matchesThreadSearch(conversation, query),
				),
				view,
			),
		[conversations, query, view],
	);
	const counts = useMemo(
		() => ({
			needsReply: conversations.filter((conversation) => !conversation.sentAt).length,
			sent: conversations.filter((conversation) => Boolean(conversation.sentAt)).length,
			all: conversations.length,
		}),
		[conversations],
	);
	const selected = conversations.find((conversation) => conversation.id === selectedId) || null;

	const refresh = useCallback(async (keepId?: string | null) => {
		const requestId = ++refreshRequestIdRef.current;
		try {
			const list = await api<Conversation[]>("/api/conversations");
			if (requestId !== refreshRequestIdRef.current) {
				return list;
			}
			setConversations(list);
			setLoadError(false);
			const id = keepId === undefined ? selectedIdRef.current : keepId;
			const next = list.find((conversation) => conversation.id === id) || list[0] || null;
			if (next && !id) {
				setSelectedId(next.id);
			}
			if (next?.oneShot?.draft?.reply) {
				setReply(next.oneShot.draft.reply);
			}
			return list;
		} catch {
			if (requestId === refreshRequestIdRef.current) {
				setLoadError(true);
			}
			return [];
		} finally {
			if (requestId === refreshRequestIdRef.current) {
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!selectedId) {
			return;
		}
		if (visible.some((conversation) => conversation.id === selectedId)) {
			return;
		}
		setSelectedId(visible[0]?.id ?? null);
	}, [selectedId, visible]);

	useEffect(() => {
		if (selected?.oneShot?.draft?.reply) {
			setReply(selected.oneShot.draft.reply);
		}
		if (selected?.sentAt) {
			setStatus(t("alreadySent", { at: formatInboxTimestamp(selected.sentAt, locale) }));
			setStatusKind("ok");
		} else if (selected) {
			setStatus(t("notSent"));
			setStatusKind("");
		}
	}, [selected?.id, selected?.sentAt, selected?.oneShot?.draft?.reply, t, locale]); // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps

	async function onApprove() {
		if (!selected || selected.sentAt || approving) {
			return;
		}
		setApproving(true);
		setStatus(t("sending"));
		setStatusKind("");
		try {
			const result = await api<{ conversation: Conversation }>(
				`/api/conversations/${encodeURIComponent(selected.id)}/approve`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ reply }),
				},
			);
			toast.add({
				title: t("sentTo", { name: displayName(result.conversation) }),
				type: "success",
			});
			// In the queue view the sent thread leaves the list and the selection effect
			// advances to the next waiting guest; in other views it stays selected.
			await refresh(view === "needsReply" ? null : result.conversation.id);
		} catch (err) {
			const error = err as Error & { data?: { message?: string; error?: string } };
			setStatusKind("warn");
			setStatus(error.data?.message || error.data?.error || error.message);
		} finally {
			setApproving(false);
		}
	}

	const cribNotes = selected
		? formatConversationCrib(selected, (key, values) => t(key, values))
		: null;

	function openThread(id: string) {
		setSelectedId(id);
		setDetailOpen(true);
	}

	function listBody() {
		if (loading && conversations.length === 0 && !loadError) {
			return <ThreadListSkeleton />;
		}
		if (visible.length === 0) {
			const caughtUp = !loadError && !query && view === "needsReply" && conversations.length > 0;
			const title = loadError
				? t("loadError")
				: conversations.length === 0
					? t("empty")
					: caughtUp
						? t("allCaughtUp")
						: t("noMatches");
			return (
				<ThreadListState
					title={title}
					action={
						loadError ? (
							<Button
								type="button"
								variant="outline"
								className="mt-3 min-h-11"
								onClick={() => {
									setLoading(true);
									void refresh();
								}}
							>
								{t("retry")}
							</Button>
						) : caughtUp && counts.sent > 0 ? (
							<Button
								type="button"
								variant="outline"
								className="mt-3 min-h-11"
								onClick={() => setView("sent")}
							>
								{t("viewSent")}
							</Button>
						) : null
					}
				/>
			);
		}
		return visible.map((conversation) => {
			const active = conversation.id === selectedId;
			const preview = lastInboundText(conversation);
			const name = displayName(conversation);
			const when = conversation.lastGuestInboundAt;
			return (
				<Button
					key={conversation.id}
					type="button"
					variant="ghost"
					aria-current={active ? "true" : undefined}
					className={cn(
						"gap-2.5 px-3 py-2.5 font-normal min-w-0 swiss:border-b swiss:border-b-border swiss:py-3 flat:my-0.5 flat:mx-1.5 flat:w-[calc(100%-0.75rem)] flat:rounded-lg flat:border-l-0 h-auto w-full items-start justify-start overflow-hidden rounded-none border-l-2 border-l-transparent text-left active:scale-100",
						active
							? "flat:bg-primary/8 flat:hover:bg-primary/12 border-l-touch bg-sidebar-accent/80 hover:bg-sidebar-accent"
							: "hover:bg-muted/70",
					)}
					onClick={() => openThread(conversation.id)}
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
							<CompactFlag tone="neutral">{pipeLabel(conversation.pipe, t)}</CompactFlag>
							<CompactFlag tone={conversation.sentAt ? "success" : "warning"}>
								{conversation.sentAt ? t("sent") : t("needsApprove")}
							</CompactFlag>
						</span>
					</span>
				</Button>
			);
		});
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
						onChange={(event) => setQuery(event.target.value)}
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
								onClick={() => setView(option)}
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
									{counts[option]}
								</span>
							</button>
						);
					})}
				</div>
				<p className="text-xs text-muted-foreground" aria-live="polite">
					{t("queueCount", { count: counts.needsReply })}
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
						aria-busy={loading}
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
								<CompactFlag tone="neutral">{pipeLabel(selected.pipe, t)}</CompactFlag>
								<CompactFlag tone={selected.sentAt ? "success" : "warning"}>
									{selected.sentAt ? t("sent") : t("needsApprove")}
								</CompactFlag>
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
								<SendStatus
									status={status}
									statusKind={statusKind}
									visuallyQuiet={!selected.sentAt && !approving && statusKind !== "warn"}
								/>
								<Button
									type="button"
									variant="primary"
									className="min-h-11 ml-auto shrink-0"
									disabled={Boolean(selected.sentAt) || approving}
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
