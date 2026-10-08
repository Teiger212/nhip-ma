"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout) · B · Chat + summary strip.
 * A messenger: bubbles across the whole pane (guest left, office right), each carrying its
 * translation as a muted second line. The guest details shrink to one strip of label:value
 * facts under the header, ending in what is still missing; the operator note folds into the
 * composer as a hint. Read-only: Approve, Regenerate and Assign only toast.
 */
import { Badge, Button, cn, Textarea } from "@repo/ui";
import { ChevronLeftIcon, EllipsisIcon, InfoIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { displayName } from "../../lib/display-name";
import { formatInboxTimestamp } from "../../lib/time";
import type { Conversation, Message } from "../../lib/types";
import { CrmStatus } from "../CrmStatus";
import type { ReplyState } from "../ThreadDetail";
import { GuestMark, ThreadFlags, useOperatorLanguage } from "../ThreadParts";
import {
	listPhrase,
	prototypeOnly,
	useMessageSource,
	useProtoThread,
	useStubReply,
	useScrollToEnd,
} from "./shared.prototype";

type Proto = ReturnType<typeof useProtoThread>;

function Bubble({ message, proto }: { message: Message; proto: Proto }) {
	const t = useTranslations("inbox");
	const locale = useOperatorLanguage();
	const source = useMessageSource()(message);
	const inbound = message.direction === "in";
	const tr = proto.messageTr(message);
	return (
		<div className={cn("gap-1 flex flex-col", inbound ? "items-start" : "items-end")}>
			<div
				className={cn(
					"px-3.5 py-2.5 text-sm max-w-xl rounded-2xl",
					inbound ? "shadow-hairline rounded-bl-md bg-card" : "rounded-br-md bg-muted",
				)}
			>
				<p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
				{tr ? (
					<p
						className={cn(
							"mt-1.5 pt-1.5 text-xs leading-relaxed border-t border-foreground/10 whitespace-pre-wrap text-muted-foreground",
							tr.stub && "italic",
						)}
					>
						{tr.text}
					</p>
				) : null}
			</div>
			<div className="gap-1.5 px-1 text-micro flex items-center text-muted-foreground">
				{message.source === "auto-reply" ? (
					<Badge status="neutral" size="sm">
						{source.label}
						{source.writer ? ` · ${source.writer}` : ""}
					</Badge>
				) : inbound ? null : (
					<span>{source.label}</span>
				)}
				{message.mock ? (
					<Badge status="info" size="sm">
						{t("mock")}
					</Badge>
				) : null}
				<time className="tabular-nums" dateTime={message.at}>
					{formatInboxTimestamp(message.at, locale)}
				</time>
			</div>
		</div>
	);
}

/** The guest details as one line of facts: what we know, then what we don't. */
function SummaryStrip({ proto }: { proto: Proto }) {
	const facts = proto.facts.filter((f) => f.id !== "language" && f.id !== "paperwork");
	const paperwork = proto.facts.some((f) => f.id === "paperwork");
	return (
		<div className="gap-x-5 gap-y-1.5 px-4 py-2 text-xs flex shrink-0 flex-wrap items-baseline border-b bg-muted/40">
			{facts.map((fact) => (
				<span
					key={fact.id}
					className="gap-1.5 inline-flex items-baseline"
					title={fact.foreign ? `“${fact.raw}”` : undefined}
				>
					<span className="text-muted-foreground">{fact.label}</span>
					<span className="font-medium text-foreground">{fact.value}</span>
				</span>
			))}
			{paperwork ? <Badge status="neutral">Paperwork asked</Badge> : null}
			{proto.missing.length > 0 ? (
				<span className="gap-1.5 inline-flex items-baseline">
					<span className="text-muted-foreground">Missing</span>
					<span className="font-medium text-foreground/70">
						{listPhrase(proto.missing.map((m) => m.label))}
					</span>
				</span>
			) : null}
		</div>
	);
}

export function ThreadLayoutB({
	conversation,
	cribNotes,
	reply,
	onBack,
}: {
	conversation: Conversation;
	cribNotes: string | null;
	reply: ReplyState;
	onBack: () => void;
}) {
	const t = useTranslations("inbox");
	const proto = useProtoThread(conversation);
	const scrollRef = useScrollToEnd(conversation.id);
	const stubReply = useStubReply(conversation, reply.reply);
	const draftTr = stubReply.translation;
	const name = displayName(conversation);
	return (
		<>
			<header className="gap-2 px-4 py-2.5 flex shrink-0 flex-wrap items-center border-b">
				<Button
					type="button"
					variant="ghost"
					className="md:hidden min-h-11 min-w-11"
					onClick={onBack}
					aria-label={t("backAria")}
				>
					<ChevronLeftIcon className="size-4" />
				</Button>
				<GuestMark name={name} />
				<p className="mr-1 font-semibold tracking-tight font-heading">{name}</p>
				{proto.guestLanguageName ? (
					<span className="mr-1 text-xs text-muted-foreground">{proto.guestLanguageName}</span>
				) : null}
				<ThreadFlags conversation={conversation} />
				<CrmStatus conversation={conversation} />
				<div className="gap-1 ml-auto flex items-center">
					<Button type="button" variant="ghost" size="sm" onClick={() => prototypeOnly("Assign")}>
						{t("owner.assignTo")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="More"
						onClick={() => prototypeOnly("The thread menu")}
					>
						<EllipsisIcon className="size-4" />
					</Button>
				</div>
			</header>
			<SummaryStrip proto={proto} />
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
				<div className="gap-4 px-6 py-5 flex flex-col">
					{conversation.messages.map((message) => (
						<Bubble key={message.id} message={message} proto={proto} />
					))}
				</div>
			</div>
			<div className="gap-2 px-4 pt-2.5 pb-3 flex shrink-0 flex-col border-t">
				<div className="gap-3 flex items-start">
					{cribNotes ? (
						<p className="gap-1.5 text-xs leading-relaxed min-w-0 flex flex-1 items-start text-muted-foreground">
							<InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-touch" />
							<span>
								<span className="font-medium text-foreground/80">{t("forYou")}: </span>
								{cribNotes}
							</span>
						</p>
					) : (
						<span className="flex-1" />
					)}
					{!stubReply.edited ? (
						<Badge status="neutral" size="sm" className="shrink-0">
							{stubReply.sourceLabel}
						</Badge>
					) : null}
				</div>
				<div className="gap-3 flex items-end">
					<div className="min-w-0 gap-1.5 flex flex-1 flex-col">
						<Textarea
							aria-label={t("reply")}
							value={stubReply.value}
							onChange={(event) => stubReply.onChange(event.target.value)}
							className="min-h-16"
						/>
						{draftTr ? (
							<p
								className={cn(
									"px-1 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground",
									draftTr.stub && "italic",
								)}
							>
								{draftTr.text}
							</p>
						) : null}
					</div>
					<div className="gap-1 flex shrink-0 flex-col items-stretch">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => prototypeOnly("Regenerate")}
						>
							<RefreshCwIcon aria-hidden="true" className="size-3.5" />
							{t("regenerate")}
						</Button>
						<Button
							type="button"
							variant="primary"
							className="min-h-11"
							disabled={!reply.canApprove}
							onClick={() => prototypeOnly("Approve and send")}
						>
							{t("approveAndSend")}
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
