"use client";

import { cn, toast } from "@repo/ui";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";

import { formatConversationCrib } from "../lib/crib";
import { displayName } from "../lib/display-name";
import {
	useApproveAndSend,
	useConversations,
	useDisconnectedEndpoints,
	useOfficeAgents,
	useOfficeRole,
	useRegenerateDraft,
} from "../lib/inbox-queries";
import { PIPE_NAMES } from "../lib/pipe-names";
import { buildQueueView, INBOX_VIEWS, nextSelection } from "../lib/queue";
import { sendStatusFor } from "../lib/send-status";
import { replyKey, useReplyDraft } from "../lib/use-reply-draft";
import { InboxToolbar } from "./InboxToolbar";
import { ThreadDetail } from "./ThreadDetail";
import { ThreadList } from "./ThreadList";
import { ThreadListState } from "./ThreadParts";

const viewParser = parseAsStringLiteral(INBOX_VIEWS).withDefault("yourTurn");

/**
 * The inbox shell: it owns the state (server data through TanStack Query, the view and
 * search in the URL, the selection and the reply edits locally), the two mutations, and
 * the two-column layout with its phone behaviour. The components under it render what
 * they are handed and decide nothing (HANDOFF: renders, does not decide).
 */
export function Inbox() {
	const t = useTranslations("inbox");
	const disconnectedPipes = [...new Set(useDisconnectedEndpoints().map((item) => item.pipe))];
	const conversationsQuery = useConversations();
	const approve = useApproveAndSend();
	const regenerate = useRegenerateDraft();
	const [view, setView] = useQueryState("view", viewParser);
	const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
	// A manager narrows the office's threads to the pool or one operator (ADR 0015).
	const [ownerFilter, setOwnerFilter] = useQueryState("owner", parseAsString.withDefault("all"));
	const { role } = useOfficeRole();
	const manager = role === "manager";
	const agents = useOfficeAgents(manager);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);

	const conversations = useMemo(() => {
		const all = conversationsQuery.data ?? [];
		if (!manager || ownerFilter === "all") return all;
		return all.filter((conversation) =>
			ownerFilter === "pool" ? !conversation.owner : conversation.owner?.id === ownerFilter,
		);
	}, [conversationsQuery.data, manager, ownerFilter]);
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

	return (
		<div className="min-h-0 text-sm flex h-full flex-col bg-background text-foreground">
			{disconnectedPipes.length > 0 ? (
				<output
					data-test="pipe-disconnected-banner"
					className="px-3 py-2 text-sm font-medium block border-b bg-destructive/10 text-destructive"
				>
					{t("pipeDisconnectedBanner", {
						pipes: disconnectedPipes.map((pipe) => PIPE_NAMES[pipe]).join(", "),
					})}
				</output>
			) : null}
			{manager ? (
				<div className="px-3 pt-3 gap-2 text-xs flex items-center text-muted-foreground">
					<label htmlFor="inbox-owner-filter">{t("owner.filter")}</label>
					<select
						id="inbox-owner-filter"
						data-test="owner-filter"
						className="h-8 px-2 text-sm rounded-md border bg-background text-foreground"
						value={ownerFilter}
						onChange={(event) =>
							void setOwnerFilter(event.target.value === "all" ? null : event.target.value)
						}
					>
						<option value="all">{t("owner.all")}</option>
						<option value="pool">{t("owner.pool")}</option>
						{agents.data?.map((agent) => (
							<option key={agent.id} value={agent.id}>
								{agent.name}
							</option>
						))}
					</select>
				</div>
			) : null}
			<InboxToolbar
				query={query}
				onQueryChange={(value) => void setQuery(value || null)}
				view={view}
				onViewChange={(next) => void setView(next)}
				counts={queue.counts}
				hiddenOnPhone={detailOpen}
			/>
			<div className="min-h-0 min-w-0 flex flex-1 overflow-hidden">
				<aside
					className={cn(
						"min-h-0 min-w-0 flex-col overflow-hidden bg-card/40",
						"md:w-inbox-list md:min-w-inbox-list md:max-w-inbox-list w-full",
						"md:flex md:flex-none md:shrink-0 md:grow-0 md:basis-inbox-list md:border-r",
						detailOpen ? "md:flex hidden" : "md:flex-none flex flex-1",
					)}
				>
					<div
						className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
						aria-busy={conversationsQuery.isFetching}
					>
						<ThreadList
							queue={queue}
							loading={conversationsQuery.isPending}
							failed={conversationsQuery.isError}
							total={conversations.length}
							selectedId={selectedId}
							onOpen={openThread}
							onRetry={() => void conversationsQuery.refetch()}
							onViewSent={() => void setView("sent")}
							emptyTitle={manager ? undefined : t("emptyPool")}
						/>
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
						<ThreadDetail
							conversation={selected}
							cribNotes={cribNotes}
							onBack={() => setDetailOpen(false)}
							reply={{
								reply,
								edited,
								draftSource: selected.oneShot?.draft?.source ?? "template",
								canApprove,
								onReplyChange: setReply,
								regenerating: regenerate.isPending,
								onRegenerate: () => void onRegenerate(),
								sending: approve.isPending,
								status: sendStatusFor({
									sending: approve.isPending,
									error: sendError,
									conversation: selected,
								}),
								onApprove: () => void onApprove(),
							}}
						/>
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
