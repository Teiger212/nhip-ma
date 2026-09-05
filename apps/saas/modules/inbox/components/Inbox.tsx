"use client";

import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	cn,
	Input,
	Textarea,
} from "@repo/ui";
import { ChevronLeftIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatConversationCrib } from "../lib/crib";
import { arrangeExtractRows, isEmptyExtractValue } from "../lib/extract-rows";
import { lastInboundText, matchesThreadSearch } from "../lib/search";
import { formatInboxTimestamp } from "../lib/time";
import type { Conversation, Message } from "../lib/types";
import { InboxLocaleSwitch } from "./InboxLocaleSwitch";

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

function ExtractRowList({ rows }: { rows: Array<{ id: string; label: string; value: string }> }) {
	const t = useTranslations("inbox");
	return (
		<dl className="gap-x-3 gap-y-1 text-sm grid grid-cols-[minmax(7.5rem,auto)_1fr]">
			{rows.map((row) => (
				<div key={row.id} className="contents">
					<dt className="text-muted-foreground">{row.label}</dt>
					<dd
						className={
							isEmptyExtractValue(row.value, [t("missing"), t("fields.noneMentioned")])
								? "text-muted-foreground"
								: "text-foreground"
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
		<Card>
			<CardContent className="gap-2 p-4 flex flex-col">
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
			</CardContent>
		</Card>
	);
}

function ThreadMessage({ message }: { message: Message }) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	return (
		<div
			className={cn(
				"px-2.5 py-2 text-sm rounded-md border bg-card",
				message.direction === "in"
					? "border-l-2 border-l-foreground"
					: "border-l-2 border-l-muted-foreground",
			)}
		>
			<div className="mb-1 gap-1.5 text-xs flex flex-wrap items-center text-muted-foreground">
				<span>
					{message.source} ·{" "}
					<time dateTime={message.at}>{formatInboxTimestamp(message.at, locale)}</time>
				</span>
				{message.mock ? (
					<Badge status="info" className="h-4 px-1.5 text-[10px] normal-case">
						{t("mock")}
					</Badge>
				) : null}
			</div>
			<div className="whitespace-pre-wrap">{message.text}</div>
		</div>
	);
}

function SendStatus({ status, statusKind }: { status: string; statusKind: "ok" | "warn" | "" }) {
	return (
		<output
			aria-live="polite"
			aria-atomic="true"
			className={statusKind === "warn" ? "text-destructive" : "text-muted-foreground"}
		>
			{status}
		</output>
	);
}

export function Inbox() {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [reply, setReply] = useState("");
	const [status, setStatus] = useState("");
	const [statusKind, setStatusKind] = useState<"ok" | "warn" | "">("");
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [approving, setApproving] = useState(false);

	const visible = useMemo(
		() => conversations.filter((conversation) => matchesThreadSearch(conversation, query)),
		[conversations, query],
	);
	const selected = conversations.find((conversation) => conversation.id === selectedId) || null;

	const refresh = useCallback(
		async (keepId?: string | null) => {
			try {
				const list = await api<Conversation[]>("/api/conversations");
				setConversations(list);
				setLoadError(false);
				const id = keepId === undefined ? selectedId : keepId;
				const next = list.find((conversation) => conversation.id === id) || list[0] || null;
				if (next && !id) {
					setSelectedId(next.id);
				}
				if (next?.oneShot?.draft?.reply) {
					setReply(next.oneShot.draft.reply);
				}
				return list;
			} catch {
				setLoadError(true);
				return [];
			} finally {
				setLoading(false);
			}
		},
		[selectedId],
	);

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
	}, [selected?.id, selected?.sentAt, selected?.oneShot?.draft?.reply, t, selected, locale]);

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
			setSelectedId(result.conversation.id);
			await refresh(result.conversation.id);
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

	return (
		<div className="min-h-0 text-sm flex h-svh flex-col bg-background text-foreground">
			<div
				className={cn(
					"p-2 gap-2 flex shrink-0 items-center border-b",
					detailOpen && "md:flex hidden",
				)}
			>
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchAria")}
					className="min-w-0 flex-1"
				/>
				<div className="md:hidden shrink-0">
					<InboxLocaleSwitch />
				</div>
			</div>
			<div className="min-h-0 flex flex-1">
				<aside
					className={cn(
						"min-h-0 flex-col",
						"md:w-72 md:flex md:shrink-0 md:border-r w-full",
						detailOpen ? "md:flex hidden" : "flex flex-1",
					)}
				>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{visible.length === 0 ? (
							<p className="px-3 py-3 text-muted-foreground">
								{loading
									? t("loading")
									: loadError
										? t("loadError")
										: conversations.length === 0
											? t("empty")
											: t("noMatches")}
							</p>
						) : (
							visible.map((conversation) => {
								const active = conversation.id === selectedId;
								const preview = lastInboundText(conversation);
								return (
									<Button
										key={conversation.id}
										type="button"
										variant="ghost"
										aria-current={active ? "true" : undefined}
										className={cn(
											"gap-1 px-3 py-2.5 font-normal h-auto w-full flex-col items-start rounded-none border-b border-l-2 border-l-transparent text-left",
											active && "border-l-foreground bg-muted hover:bg-muted",
										)}
										onClick={() => openThread(conversation.id)}
									>
										<span className="font-medium w-full truncate">{displayName(conversation)}</span>
										{preview ? (
											<span className="text-xs line-clamp-2 w-full text-muted-foreground">
												{preview}
											</span>
										) : null}
										<span className="gap-1 flex flex-wrap items-center">
											<Badge status="info" className="normal-case">
												{pipeLabel(conversation.pipe, t)}
											</Badge>
											<Badge
												status={conversation.sentAt ? "success" : "warning"}
												className="normal-case"
											>
												{conversation.sentAt ? t("sent") : t("needsApprove")}
											</Badge>
										</span>
									</Button>
								);
							})
						)}
					</div>
				</aside>
				<article
					className={cn("min-h-0 min-w-0 flex-1 flex-col", detailOpen ? "flex" : "md:flex hidden")}
				>
					{!selected ? (
						<p className="p-3 text-muted-foreground">{t("noneSelected")}</p>
					) : (
						<>
							<header className="gap-2 px-3 py-2 flex shrink-0 flex-wrap items-center border-b">
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
								<p className="font-medium">{displayName(selected)}</p>
								<Badge status="info" className="normal-case">
									{pipeLabel(selected.pipe, t)}
								</Badge>
								<Badge status={selected.sentAt ? "success" : "warning"} className="normal-case">
									{selected.sentAt ? t("sent") : t("needsApprove")}
								</Badge>
								<div className="md:hidden ml-auto shrink-0">
									<InboxLocaleSwitch />
								</div>
							</header>
							<div className="min-h-0 flex-1 overflow-y-auto">
								<div className="max-w-3xl gap-3 p-3 mx-auto flex flex-col">
									{selected.messages.map((message) => (
										<ThreadMessage key={message.id} message={message} />
									))}
									<div className="border-t" />
									<ExtractFields conversation={selected} />
									{cribNotes ? (
										<Card className="bg-muted/40">
											<CardHeader className="border-b">
												<CardTitle>{t("forYou")}</CardTitle>
												<CardDescription>{t("forYouHint")}</CardDescription>
											</CardHeader>
											<CardContent>
												<p className="whitespace-pre-wrap">{cribNotes}</p>
											</CardContent>
										</Card>
									) : null}
									<Card>
										<CardHeader>
											<CardTitle>{t("reply")}</CardTitle>
										</CardHeader>
										<CardContent>
											<Textarea
												value={reply}
												onChange={(event) => setReply(event.target.value)}
												className="min-h-28"
												aria-label={t("reply")}
											/>
										</CardContent>
									</Card>
								</div>
							</div>
							<div className="gap-2 px-3 py-2 flex shrink-0 flex-wrap items-center border-t bg-background">
								<Button
									type="button"
									variant="primary"
									className="min-h-11"
									disabled={Boolean(selected.sentAt) || approving}
									onClick={() => void onApprove()}
								>
									{t("approveAndSend")}
								</Button>
								<SendStatus status={status} statusKind={statusKind} />
							</div>
						</>
					)}
				</article>
			</div>
			<footer
				className={cn(
					"px-3 py-2 text-xs md:hidden shrink-0 border-t text-muted-foreground",
					detailOpen && "hidden",
				)}
			>
				{t("footer")}
			</footer>
		</div>
	);
}
