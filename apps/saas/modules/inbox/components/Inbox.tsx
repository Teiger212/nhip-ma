"use client";

import { Button, cn, toast } from "@repo/ui";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";

import { formatConversationCrib } from "../lib/crib";
import { displayName } from "../lib/display-name";
import {
	InboxApiError,
	useApproveAndSend,
	useConversation,
	useConversations,
	useDisconnectedEndpoints,
	useOfficeAgents,
	useOfficeRole,
	useRegenerateDraft,
} from "../lib/inbox-queries";
import { PIPE_NAMES } from "../lib/pipe-names";
import { buildQueueView, INBOX_VIEWS, nextSelection } from "../lib/queue";
import { sendStatusFor } from "../lib/send-status";
import { summarize } from "../lib/summary";
import type { ConversationSummary } from "../lib/types";
import { replyKey, useReplyDraft } from "../lib/use-reply-draft";
import { InboxToolbar } from "./InboxToolbar";
import { ThreadDetail, ThreadDetailSkeleton } from "./ThreadDetail";
import { ThreadList } from "./ThreadList";
import { ThreadListState } from "./ThreadParts";

const viewParser = parseAsStringLiteral(INBOX_VIEWS).withDefault("yourTurn");

/** What a row shows about a thread's state; when the row's differs from the open thread's, one of them is behind. */
function turnState(thread: ConversationSummary): string {
	return [thread.updatedAt, thread.unansweredInboundId, thread.sentAt, thread.owner?.id].join("|");
}

/**
 * The inbox shell: it owns the state (server data through TanStack Query, the view and
 * search in the URL, the selection and the reply edits locally), the two mutations, and
 * the two-column layout with its phone behaviour. The components under it render what
 * they are handed and decide nothing (HANDOFF: renders, does not decide). The list is
 * summaries; the selected thread is loaded whole on its own and shown only once it is the
 * thread selected, never the previous one.
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
	// `?thread=` opens one thread on arrival (Home's Waiting now and CRM leads link here); it
	// is read once, then dropped from the URL, so the selection stays local like every other click.
	const [threadParam, setThreadParam] = useQueryState("thread");
	const [selectedId, setSelectedId] = useState<string | null>(threadParam);
	const [detailOpen, setDetailOpen] = useState(threadParam !== null);
	// The link named no thread this operator can open (an old link, another office's thread):
	// say so, and open nothing until they choose, never another guest's thread (#141).
	const [linkMissing, setLinkMissing] = useState(false);
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

	// A link (`?thread=`) waits for the list, then is judged against every thread the operator
	// can open, not just the current view's: one they can't is "not here", never another
	// guest's thread; one outside the view, search or owner filter (answered, say) opens in All.
	// Otherwise selection follows the list: it stays put while the thread is there, otherwise
	// advances (this is what moves to the next waiting guest after a send).
	useEffect(() => {
		if (threadParam !== null) {
			if (!conversationsQuery.isSuccess) return;
			if (!conversationsQuery.data.some((conversation) => conversation.id === threadParam)) {
				setLinkMissing(true);
				setSelectedId(null);
				void setThreadParam(null);
				return;
			}
			if (!ordered.some((conversation) => conversation.id === threadParam)) {
				void setView("all");
				void setQuery(null);
				void setOwnerFilter(null);
				return;
			}
			setLinkMissing(false);
			setSelectedId(threadParam);
			setDetailOpen(true);
			void setThreadParam(null);
			return;
		}
		if (conversationsQuery.isPending || linkMissing) return;
		const next = nextSelection(ordered, selectedId);
		if (next !== selectedId) setSelectedId(next);
	}, [
		conversationsQuery.isPending,
		conversationsQuery.isSuccess,
		conversationsQuery.data,
		ordered,
		selectedId,
		threadParam,
		setThreadParam,
		setView,
		setQuery,
		setOwnerFilter,
		linkMissing,
	]);

	const detailQuery = useConversation(selectedId);
	const row = conversations.find((conversation) => conversation.id === selectedId) ?? null;
	const listed = row !== null;
	// Gone for this operator (reassigned, deleted): the list catches up and selection moves on.
	const detailGone =
		detailQuery.error instanceof InboxApiError && detailQuery.error.code === "not_found";
	const selected =
		listed && !detailGone && detailQuery.data?.id === selectedId ? detailQuery.data : null;
	const refetchList = conversationsQuery.refetch;
	useEffect(() => {
		if (detailGone) void refetchList();
	}, [detailGone, refetchList]);
	// The list's poll saw the open thread change (the guest wrote, a send settled, it was
	// reassigned): fetch the thread now rather than on its own next poll. Each detail fetch
	// rewrites the row from the thread, so the two settle on one story.
	const rowState = row ? turnState(row) : null;
	const detailState = selected ? turnState(summarize(selected)) : null;
	const detailFetching = detailQuery.isFetching;
	const refetchDetail = detailQuery.refetch;
	useEffect(() => {
		if (rowState && detailState && rowState !== detailState && !detailFetching) {
			void refetchDetail();
		}
	}, [rowState, detailState, detailFetching, refetchDetail]);
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
		setLinkMissing(false);
		setSelectedId(id);
		setDetailOpen(true);
	}

	return (
		<div className="min-h-0 text-sm md:gap-2.5 md:p-3 lg:pl-1 md:bg-canvas flex h-full flex-col bg-card text-foreground">
			{disconnectedPipes.length > 0 ? (
				<output
					data-test="pipe-disconnected-banner"
					className="px-3 py-2 text-sm font-medium md:rounded-xl md:border-0 block border-b bg-destructive/10 text-destructive"
				>
					{t("pipeDisconnectedBanner", {
						pipes: disconnectedPipes.map((pipe) => PIPE_NAMES[pipe]).join(", "),
					})}
				</output>
			) : null}
			<div className="min-h-0 min-w-0 md:gap-2.5 flex flex-1 overflow-hidden">
				<aside
					className={cn(
						"min-h-0 min-w-0 flex-col overflow-hidden bg-card",
						"md:w-inbox-list md:min-w-inbox-list md:max-w-inbox-list w-full",
						"md:flex md:flex-none md:shrink-0 md:grow-0 md:basis-inbox-list md:rounded-3xl md:border",
						detailOpen ? "md:flex hidden" : "md:flex-none flex flex-1",
					)}
				>
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
						onViewChange={(next) => {
							setLinkMissing(false);
							void setView(next);
						}}
						counts={queue.counts}
					/>
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
						"min-h-0 min-w-0 md:rounded-3xl md:border flex-1 flex-col overflow-hidden bg-card",
						detailOpen ? "flex" : "md:flex hidden",
					)}
				>
					{linkMissing ? (
						<ThreadListState
							testId="thread-not-found"
							title={t("threadNotFound")}
							action={
								<Button
									type="button"
									variant="outline"
									className="mt-3 min-h-11 md:hidden"
									onClick={() => {
										setLinkMissing(false);
										setDetailOpen(false);
									}}
								>
									{t("back")}
								</Button>
							}
						/>
					) : !selected ? (
						!listed || detailGone ? (
							<ThreadListState title={t("noneSelected")} />
						) : detailQuery.isError ? (
							<ThreadListState
								testId="thread-load-error"
								title={t("loadError")}
								action={
									<Button
										type="button"
										variant="outline"
										className="mt-3 min-h-11"
										onClick={() => void detailQuery.refetch()}
									>
										{t("retry")}
									</Button>
								}
							/>
						) : (
							<ThreadDetailSkeleton />
						)
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
