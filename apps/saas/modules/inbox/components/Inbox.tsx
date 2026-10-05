"use client";

import { Button, cn, toast } from "@repo/ui";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";

import { formatConversationCrib } from "../lib/crib";
import { displayName } from "../lib/display-name";
import type { AlertLinkTarget } from "../lib/guest-alerts/alert-link";
import {
	clearHandedOffThread,
	setInboxListShown,
	useHandedOffThread,
	useInboxSideBySide,
} from "../lib/inbox-presence";
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

/**
 * Why a link opened no thread: `?thread=` named none this operator can open ("not here", #141),
 * or an alert's link or a toast's tap led to a guest a colleague now holds (#136).
 */
type LinkNotice = "notHere" | "colleague";

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
export function Inbox({ alertLink }: { alertLink?: AlertLinkTarget }) {
	const t = useTranslations("inbox");
	const disconnectedPipes = [...new Set(useDisconnectedEndpoints().map((item) => item.pipe))];
	const conversationsQuery = useConversations();
	const approve = useApproveAndSend();
	const regenerate = useRegenerateDraft();
	const [view, setView] = useQueryState("view", viewParser);
	const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
	// A manager narrows the office's threads to Unassigned or one operator (ADR 0022).
	const [ownerFilter, setOwnerFilter] = useQueryState("owner", parseAsString.withDefault("all"));
	const { role } = useOfficeRole();
	const manager = role === "manager";
	const agents = useOfficeAgents(manager);
	// `?thread=` opens one thread on arrival (Home's Waiting now and CRM leads link here); it
	// is read once, then dropped from the URL, so the selection stays local like every other click.
	const [threadParam, setThreadParam] = useQueryState("thread");
	// `?alert=` was resolved on the server for this operator (the page): it is dropped from the
	// URL like `?thread=`. What it opens, and a guest toast's tap, arrive here instead, so a
	// thread's id never goes in a URL (ADR 0019).
	const [alertParam, setAlertParam] = useQueryState("alert");
	const handedOff = useHandedOffThread();
	const [linkedThread, setLinkedThread] = useState<string | null>(alertLink?.threadId ?? handedOff);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detailOpen, setDetailOpen] = useState(
		threadParam !== null || alertLink !== undefined || handedOff !== null,
	);
	// The link opened no thread: say so, and open nothing until they choose, never another
	// guest's thread (#141). An alert that isn't the viewer's own, or whose thread they can no
	// longer open, says "A colleague is answering this guest" and nothing more (#136).
	const [notice, setNotice] = useState<LinkNotice | null>(
		alertLink && alertLink.threadId === null ? "colleague" : null,
	);
	const sideBySide = useInboxSideBySide();
	const listOnScreen = sideBySide || !detailOpen;
	const [sendError, setSendError] = useState<string | null>(null);

	const conversations = useMemo(() => {
		const all = conversationsQuery.data ?? [];
		if (!manager || ownerFilter === "all") return all;
		return all.filter((conversation) =>
			ownerFilter === "unassigned" ? !conversation.owner : conversation.owner?.id === ownerFilter,
		);
	}, [conversationsQuery.data, manager, ownerFilter]);
	const queue = useMemo(
		() => buildQueueView(conversations, view, query),
		[conversations, view, query],
	);
	const ordered = useMemo(() => [...queue.visible, ...queue.quiet], [queue.visible, queue.quiet]);

	useEffect(() => {
		if (alertParam !== null) void setAlertParam(null);
	}, [alertParam, setAlertParam]);
	// A guest toast tapped while the Inbox is already open (a phone, on a thread).
	useEffect(() => {
		if (handedOff === null) return;
		setLinkedThread(handedOff);
		setDetailOpen(true);
		clearHandedOffThread();
	}, [handedOff]);
	// Guest toasts stay away while the list is on screen (spec #84).
	useEffect(() => {
		setInboxListShown(listOnScreen);
	}, [listOnScreen]);
	useEffect(() => () => setInboxListShown(false), []);

	// A link (`?thread=`, an alert's, a toast's) waits for the list, then is judged against every
	// thread the operator can open, not just the current view's: one they can't is a notice,
	// never another guest's thread; one outside the view, search or owner filter (answered,
	// say) opens in All. Otherwise selection follows the list: it stays put while the thread is
	// there, otherwise advances (this is what moves to the next waiting guest after a send).
	useEffect(() => {
		const link = threadParam ?? linkedThread;
		if (link !== null) {
			if (!conversationsQuery.isSuccess) return;
			const done = () => {
				if (threadParam !== null) void setThreadParam(null);
				else setLinkedThread(null);
			};
			if (!conversationsQuery.data.some((conversation) => conversation.id === link)) {
				setNotice(threadParam !== null ? "notHere" : "colleague");
				setSelectedId(null);
				done();
				return;
			}
			if (!ordered.some((conversation) => conversation.id === link)) {
				void setView("all");
				void setQuery(null);
				void setOwnerFilter(null);
				return;
			}
			setNotice(null);
			setSelectedId(link);
			setDetailOpen(true);
			done();
			return;
		}
		if (conversationsQuery.isPending || notice) return;
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
		linkedThread,
		setView,
		setQuery,
		setOwnerFilter,
		notice,
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
		setNotice(null);
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
								<option value="unassigned">{t("owner.unassigned")}</option>
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
							setNotice(null);
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
							emptyTitle={manager ? undefined : t("emptyAssigned")}
						/>
					</div>
				</aside>
				<article
					className={cn(
						"min-h-0 min-w-0 md:rounded-3xl md:border flex-1 flex-col overflow-hidden bg-card",
						detailOpen ? "flex" : "md:flex hidden",
					)}
				>
					{notice ? (
						<ThreadListState
							testId={notice === "colleague" ? "alert-colleague" : "thread-not-found"}
							title={notice === "colleague" ? t("alerts.colleagueAnswering") : t("threadNotFound")}
							action={
								<Button
									type="button"
									variant="outline"
									className="mt-3 min-h-11 md:hidden"
									onClick={() => {
										setNotice(null);
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
