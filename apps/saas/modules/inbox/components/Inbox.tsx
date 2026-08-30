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
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { lastInboundText, matchesThreadSearch } from "../lib/search";
import type { Conversation, Message } from "../lib/types";

function field(value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return "(missing)";
	}
	if (value === true) {
		return "yes";
	}
	if (value === false) {
		return "no";
	}
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}
	return "(missing)";
}

function displayName(conversation: Conversation): string {
	return conversation.guestName || conversation.guestId;
}

function pipeLabel(pipe: Conversation["pipe"]): string {
	return pipe === "zalo" ? "Zalo" : "WhatsApp";
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

function ExtractFields({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox.fields");
	const q = conversation.oneShot?.qualification;
	const paper = conversation.oneShot?.paperwork;
	const rows: [string, string][] = [
		[t("language"), field(conversation.oneShot?.language)],
		[t("area"), field(q?.areaOfInterest)],
		[t("nationality"), field(q?.nationality)],
		[t("inVietnamNow"), field(q?.inVietnamNow)],
		[t("rentOrBuy"), field(q?.rentOrBuy)],
		[t("moveIn"), field(q?.timeframe)],
		[t("budget"), field(q?.budgetBand)],
		[t("beds"), field(q?.bedsOrHousehold)],
		[t("paperwork"), paper?.mentioned ? field(paper.flag) : t("noneMentioned")],
	];

	return (
		<Card>
			<CardContent className="p-4">
				<dl className="gap-x-3 gap-y-1 text-sm grid grid-cols-[minmax(7.5rem,auto)_1fr]">
					{rows.map(([label, value]) => (
						<div key={label} className="contents">
							<dt className="text-muted-foreground">{label}</dt>
							<dd
								className={
									value === "(missing)" || value === t("noneMentioned")
										? "text-muted-foreground"
										: "text-foreground"
								}
							>
								{value}
							</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}

function ThreadMessage({ message }: { message: Message }) {
	const t = useTranslations("inbox");
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
					{message.source} · {message.at}
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

export function Inbox() {
	const t = useTranslations("inbox");
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [reply, setReply] = useState("");
	const [status, setStatus] = useState("");
	const [statusKind, setStatusKind] = useState<"ok" | "warn" | "">("");

	const visible = useMemo(
		() => conversations.filter((conversation) => matchesThreadSearch(conversation, query)),
		[conversations, query],
	);
	const selected = conversations.find((conversation) => conversation.id === selectedId) || null;

	const refresh = useCallback(
		async (keepId?: string | null) => {
			const list = await api<Conversation[]>("/api/conversations");
			setConversations(list);
			const id = keepId === undefined ? selectedId : keepId;
			const next = list.find((conversation) => conversation.id === id) || list[0] || null;
			if (next && !id) {
				setSelectedId(next.id);
			}
			if (next?.oneShot?.draft?.reply) {
				setReply(next.oneShot.draft.reply);
			}
			return list;
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
			setStatus(t("alreadySent", { at: selected.sentAt }));
			setStatusKind("ok");
		} else if (selected) {
			setStatus(t("notSent"));
			setStatusKind("");
		}
	}, [selected?.id, selected?.sentAt, selected?.oneShot?.draft?.reply, t, selected]);

	async function onApprove() {
		if (!selected) {
			return;
		}
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
		}
	}

	const draft = selected?.oneShot?.draft;

	return (
		<div className="min-h-0 text-sm flex h-svh flex-col bg-background text-foreground">
			<div className="min-h-0 flex flex-1">
				<aside className="w-72 flex shrink-0 flex-col border-r">
					<div className="p-2 border-b">
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t("searchPlaceholder")}
							aria-label={t("searchAria")}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{visible.length === 0 ? (
							<p className="px-3 py-3 text-muted-foreground">
								{conversations.length === 0 ? t("empty") : t("noMatches")}
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
										onClick={() => setSelectedId(conversation.id)}
									>
										<span className="font-medium w-full truncate">{displayName(conversation)}</span>
										{preview ? (
											<span className="text-xs line-clamp-2 w-full text-muted-foreground">
												{preview}
											</span>
										) : null}
										<span className="gap-1 flex flex-wrap items-center">
											<Badge status="info" className="normal-case">
												{pipeLabel(conversation.pipe)}
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
				<article className="min-w-0 flex-1">
					<div className="h-full overflow-y-auto">
						<div className="max-w-3xl gap-3 p-3 mx-auto flex flex-col">
							{!selected ? (
								<p className="text-muted-foreground">{t("noneSelected")}</p>
							) : (
								<>
									<div className="gap-2 flex flex-wrap items-center">
										<p className="font-medium">{displayName(selected)}</p>
										<Badge status="info" className="normal-case">
											{pipeLabel(selected.pipe)}
										</Badge>
										<Badge status={selected.sentAt ? "success" : "warning"} className="normal-case">
											{selected.sentAt ? t("sent") : t("needsApprove")}
										</Badge>
									</div>
									{selected.messages.map((message) => (
										<ThreadMessage key={message.id} message={message} />
									))}
									<div className="border-t" />
									<ExtractFields conversation={selected} />
									<Card className="bg-muted/40">
										<CardHeader className="border-b">
											<CardTitle>{t("forYou")}</CardTitle>
											<CardDescription>{t("forYouHint")}</CardDescription>
										</CardHeader>
										<CardContent>
											<p className="whitespace-pre-wrap">{draft?.crib || ""}</p>
										</CardContent>
									</Card>
									<Card>
										<CardHeader>
											<CardTitle>{t("reply")}</CardTitle>
										</CardHeader>
										<CardContent className="gap-3 flex flex-col">
											<Textarea
												value={reply}
												onChange={(event) => setReply(event.target.value)}
												className="min-h-28"
												aria-label={t("reply")}
											/>
											<div className="gap-2 flex flex-wrap items-center">
												<Button type="button" variant="primary" onClick={() => void onApprove()}>
													{t("approveAndSend")}
												</Button>
												<span
													className={
														statusKind === "warn" ? "text-destructive" : "text-muted-foreground"
													}
												>
													{status}
												</span>
											</div>
										</CardContent>
									</Card>
								</>
							)}
						</div>
					</div>
				</article>
			</div>
			<footer className="px-3 py-2 text-xs md:hidden shrink-0 border-t text-muted-foreground">
				{t("footer")}
			</footer>
		</div>
	);
}
