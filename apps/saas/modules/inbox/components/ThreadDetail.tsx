"use client";

import { Button, cn, Skeleton } from "@repo/ui";
import { ArrowDownIcon, ChevronLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import { displayName } from "../lib/display-name";
import { replyEndpoint, useDisconnectedEndpoints } from "../lib/inbox-queries";
import { PIPE_NAMES } from "../lib/pipe-names";
import type { SendStatus } from "../lib/send-status";
import type { Conversation, DraftSource } from "../lib/types";
import { CrmStatus } from "./CrmStatus";
import { ExtractFields } from "./ExtractFields";
import { OwnerControl } from "./OwnerControl";
import { ReplyBox } from "./ReplyBox";
import { SendBar } from "./SendBar";
import { ThreadActions } from "./ThreadActions";
import { ThreadMessage } from "./ThreadMessage";
import { GuestMark, ThreadFlags } from "./ThreadParts";

export type ReplyState = {
	reply: string;
	edited: boolean;
	/** The operator's edit was kept after the guest wrote again (ADR 0024). */
	guestWroteAgain: boolean;
	draftSource: DraftSource;
	canApprove: boolean;
	onReplyChange: (reply: string) => void;
	regenerating: boolean;
	onRegenerate: () => void;
	sending: boolean;
	status: SendStatus;
	onApprove: () => void;
};

/**
 * From this width of the thread's own pane (56rem, 896px) the guest's details sit in a rail beside
 * the conversation; narrower, they fold into a strip under the header (#248). Measured on the
 * pane, not the window, so the sidebar and the thread list count.
 */
const RAIL_MIN_PANE_REM = 56;

/** Whether the pane is wide enough for the details rail, kept current as the pane resizes. */
function usePaneFitsRail(pane: RefObject<HTMLElement | null>): boolean {
	const [fits, setFits] = useState(false);
	useLayoutEffect(() => {
		const element = pane.current;
		if (!element) return;
		const measure = () => {
			const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
			setFits(element.getBoundingClientRect().width >= RAIL_MIN_PANE_REM * rem);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [pane]);
	return fits;
}

/** How close to the latest message still counts as reading it: the conversation follows from here. */
const NEAR_LATEST_PX = 80;

/**
 * Where the conversation sits (#248, PR #258). It opens on its latest message. While the operator
 * is at (or within 80px of) the latest message, it follows: a new message comes into view, and it
 * stays at the bottom when the column resizes (a phone shows the thread only after it loaded out
 * of sight; the details fold and unfold as the pane changes width). Scrolled up to read older
 * messages, it stays put when the guest writes, and `unseen` says a new message is below, until
 * the operator goes down to it (`toLatest`, or scrolling there). The operator's own send always
 * goes to the latest.
 */
function useConversationScroll(threadId: string, messages: Conversation["messages"]) {
	const scroller = useRef<HTMLDivElement>(null);
	const atLatest = useRef(true);
	const [unseen, setUnseen] = useState(false);
	const count = messages.length;
	const latest = messages.at(-1);
	const latestIsOwnSend = latest?.direction === "out" && latest.source === "nhip";
	const shown = useRef({ threadId, count });

	const toLatest = useCallback(() => {
		const element = scroller.current;
		atLatest.current = true;
		setUnseen(false);
		if (element) element.scrollTop = element.scrollHeight;
	}, []);

	useLayoutEffect(() => {
		const before = shown.current;
		shown.current = { threadId, count };
		const opened = before.threadId !== threadId;
		if (opened || atLatest.current || latestIsOwnSend) {
			toLatest();
		} else if (count > before.count) {
			setUnseen(true);
		}
	}, [threadId, count, latestIsOwnSend, toLatest]);

	useEffect(() => {
		const element = scroller.current;
		if (!element) return;
		const onScroll = () => {
			atLatest.current =
				element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_LATEST_PX;
			if (atLatest.current) setUnseen(false);
		};
		const observer = new ResizeObserver(() => {
			if (atLatest.current) element.scrollTop = element.scrollHeight;
		});
		observer.observe(element);
		if (element.firstElementChild) observer.observe(element.firstElementChild);
		element.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			observer.disconnect();
			element.removeEventListener("scroll", onScroll);
		};
	}, []);
	return { scroller, unseen, toLatest };
}

/** The open thread's place while it loads: a header and a few bubble-shaped bars. */
export function ThreadDetailSkeleton() {
	return (
		<div className="flex flex-col" aria-hidden="true">
			<div className="gap-2 px-4 py-2.5 flex items-center border-b">
				<Skeleton className="size-8 rounded-md" />
				<Skeleton className="h-4 w-32" />
			</div>
			<div className="gap-4 px-5 py-5 flex flex-col">
				<Skeleton className="h-16 w-3/5 rounded-xl" />
				<Skeleton className="h-12 w-1/2 self-end rounded-xl" />
				<Skeleton className="h-10 w-2/5 rounded-xl" />
			</div>
		</div>
	);
}

/** One titled block of the details rail. */
function RailSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="gap-2.5 p-4 flex flex-col">
			<h2 className="font-semibold tracking-wide text-xs font-heading text-muted-foreground uppercase">
				{title}
			</h2>
			{children}
		</section>
	);
}

/**
 * One open thread (#248, layout D): the header; the conversation as bubbles, with the reply box
 * and the send control docked under it, always in view; and the guest's details, in a rail beside
 * the conversation on a wide pane, or in a strip under the header on a narrow one, where the CRM
 * status and the owner control move into the header. Everything is handed in; the Inbox shell
 * owns the state and the mutations.
 */
export function ThreadDetail({
	conversation,
	cribNotes,
	reply,
	onBack,
	onAssigned,
}: {
	conversation: Conversation;
	cribNotes: string | null;
	reply: ReplyState;
	/** Phone only: close the thread and show the list again. */
	onBack: () => void;
	/** The manager gave this thread to an operator (#267): the Inbox keeps it open. */
	onAssigned: (id: string) => void;
}) {
	const t = useTranslations("inbox");
	const pane = useRef<HTMLDivElement>(null);
	const rail = usePaneFitsRail(pane);
	const { scroller, unseen, toLatest } = useConversationScroll(
		conversation.id,
		conversation.messages,
	);
	const disconnected = useDisconnectedEndpoints();
	const endpoint = replyEndpoint(conversation);
	const blocked = disconnected.some(
		(item) => item.pipe === conversation.pipe && item.externalId === endpoint,
	);
	// An office with no CRM shows no CRM status (DESIGN.md, Badges), so no CRM section either.
	const hasCrm = Boolean(conversation.crm) || conversation.officeHasCrm;
	const name = displayName(conversation);
	return (
		<div ref={pane} className="min-h-0 min-w-0 flex flex-1 flex-col">
			<header className="gap-2 px-3 py-2 md:px-4 flex shrink-0 flex-wrap items-center border-b">
				<Button
					type="button"
					variant="ghost"
					className="md:hidden min-h-11 min-w-11"
					onClick={onBack}
					aria-label={t("backAria")}
				>
					<ChevronLeftIcon className="size-4" />
					{t("back")}
				</Button>
				{/* Who it is, as one group: a long name truncates before the controls wrap. */}
				<div className="gap-2 min-w-0 basis-40 flex flex-1 flex-wrap items-center">
					<GuestMark name={name} />
					<p className="min-w-0 font-semibold tracking-tight font-heading max-w-full truncate">
						{name}
					</p>
					<ThreadFlags conversation={conversation} />
				</div>
				<div className={cn("gap-2 ml-auto flex shrink-0 items-center", !rail && "flex-wrap")}>
					{rail ? null : (
						<>
							<CrmStatus conversation={conversation} />
							<OwnerControl
								conversation={conversation}
								placement="header"
								onAssigned={onAssigned}
							/>
						</>
					)}
					{/* Keyed: a dialog left open never carries over to the next thread (deletion is irreversible). */}
					<ThreadActions
						key={conversation.id}
						conversation={conversation}
						approving={reply.sending}
					/>
				</div>
			</header>
			{rail ? null : <ExtractFields conversation={conversation} layout="strip" />}
			<div className="min-h-0 flex flex-1">
				<div className="min-h-0 min-w-0 flex flex-1 flex-col">
					<div className="min-h-0 relative flex flex-1 flex-col">
						<div ref={scroller} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
							<div className="gap-4 px-3 py-4 md:px-5 md:py-5 flex flex-col">
								{conversation.messages.map((message) => (
									<ThreadMessage
										key={message.id}
										message={message}
										guestLanguage={conversation.oneShot?.guestLanguage ?? null}
									/>
								))}
							</div>
						</div>
						{unseen ? (
							// A floating layer over the conversation, so it lifts (DESIGN.md, The Flat Desk Rule).
							<div className="bottom-3 shadow-md absolute left-1/2 -translate-x-1/2 rounded-full">
								<Button
									type="button"
									variant="primary"
									size="sm"
									className="min-h-11 md:min-h-0"
									onClick={toLatest}
									data-test="new-message-pill"
								>
									<ArrowDownIcon aria-hidden="true" className="size-3.5" />
									{t("newMessage")}
								</Button>
							</div>
						) : null}
					</div>
					<div className="gap-2 px-3 py-3 md:px-5 flex shrink-0 flex-col border-t bg-muted/40">
						<ReplyBox
							reply={reply.reply}
							onReplyChange={reply.onReplyChange}
							edited={reply.edited}
							guestWroteAgain={reply.guestWroteAgain}
							draftSource={reply.draftSource}
							canApprove={reply.canApprove}
							regenerating={reply.regenerating}
							onRegenerate={reply.onRegenerate}
							note={cribNotes}
						/>
						<SendBar
							blockedReason={
								blocked ? t("pipeDisconnected", { pipe: PIPE_NAMES[conversation.pipe] }) : undefined
							}
							status={reply.status}
							canApprove={reply.canApprove}
							sending={reply.sending}
							onApprove={reply.onApprove}
						/>
					</div>
				</div>
				{rail ? (
					<div
						data-test="thread-details"
						className="min-h-0 w-88 flex shrink-0 flex-col divide-y overflow-y-auto border-l"
					>
						<RailSection title={t("details.title")}>
							<ExtractFields conversation={conversation} layout="rail" />
						</RailSection>
						{hasCrm ? (
							<RailSection title={t("details.crm")}>
								<div className="flex">
									<CrmStatus conversation={conversation} />
								</div>
							</RailSection>
						) : null}
						<RailSection title={t("details.owner")}>
							<OwnerControl conversation={conversation} placement="rail" onAssigned={onAssigned} />
						</RailSection>
					</div>
				) : null}
			</div>
		</div>
	);
}
