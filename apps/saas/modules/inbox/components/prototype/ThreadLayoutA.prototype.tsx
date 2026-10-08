"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout) · A · Workbench.
 * Two columns: the conversation with the reply composer docked under it on the left, and a
 * fixed rail on the right holding everything about the guest (details in the operator's
 * language, what is still missing, the operator note, CRM, owner). Read-only: Approve,
 * Regenerate and Assign only toast.
 */
import { Badge, Button, cn, Textarea } from "@repo/ui";
import { ChevronLeftIcon, EllipsisIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { isDecided } from "../../lib/crm/rules";
import { displayName } from "../../lib/display-name";
import { useOfficeAgents, useOfficeRole } from "../../lib/inbox-queries";
import { threadStatus } from "../../lib/queue";
import { formatInboxTimestamp } from "../../lib/time";
import type { Conversation, Message } from "../../lib/types";
import { CrmStatus } from "../CrmStatus";
import type { ReplyState } from "../ThreadDetail";
import { GuestMark, useOperatorLanguage } from "../ThreadParts";
import {
	prototypeOnly,
	useMessageSource,
	useProtoThread,
	useStubReply,
	useScrollToEnd,
} from "./shared.prototype";

type Proto = ReturnType<typeof useProtoThread>;

export function TurnBadge({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const { userId, role } = useOfficeRole();
	const status = threadStatus(conversation);
	if (isDecided(status)) return <Badge status="neutral">{t(`crm.${status}`)}</Badge>;
	if (status === "sent") return <Badge status="success">{t("sent")}</Badge>;
	const waiting = role === "manager" && conversation.owner?.id !== userId;
	return <Badge status="warning">{waiting ? t("waiting") : t("yourTurn")}</Badge>;
}

function Translation({ text, stub, label }: { text: string; stub: boolean; label: string }) {
	return (
		<div className="mt-2 pt-2 text-xs leading-relaxed border-t border-dashed whitespace-pre-wrap text-muted-foreground">
			<span className="mr-1.5 font-medium tracking-wide text-2xs uppercase">{label}</span>
			<span className={cn(stub && "italic")}>{text}</span>
		</div>
	);
}

function MessageCard({ message, proto }: { message: Message; proto: Proto }) {
	const t = useTranslations("inbox");
	const locale = useOperatorLanguage();
	const source = useMessageSource()(message);
	const inbound = message.direction === "in";
	const tr = proto.messageTr(message);
	return (
		<div
			className={cn(
				"px-3.5 py-2.5 text-sm max-w-2xl rounded-xl",
				inbound ? "shadow-hairline bg-card" : "ml-8 bg-muted/60",
			)}
		>
			<div className="mb-1 gap-x-2 text-xs flex flex-wrap items-baseline text-muted-foreground">
				{message.source === "auto-reply" ? (
					<>
						<Badge status="neutral" size="sm">
							{source.label}
						</Badge>
						{source.writer ? <span>{source.writer}</span> : null}
					</>
				) : (
					<span className="font-medium text-foreground/80">{source.label}</span>
				)}
				<time className="tabular-nums" dateTime={message.at}>
					{formatInboxTimestamp(message.at, locale)}
				</time>
				{message.mock ? (
					<Badge status="info" size="sm">
						{t("mock")}
					</Badge>
				) : null}
			</div>
			<div className="leading-relaxed whitespace-pre-wrap">{message.text}</div>
			{tr ? <Translation text={tr.text} stub={tr.stub} label={proto.operatorLanguageName} /> : null}
		</div>
	);
}

export function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="gap-2.5 px-4 py-4 flex flex-col">
			<h3 className="font-semibold tracking-tight text-xs font-heading text-muted-foreground uppercase">
				{title}
			</h3>
			{children}
		</section>
	);
}

export function OwnerPicker({
	conversation,
	compact = false,
}: {
	conversation: Conversation;
	/** In a header row: a small select sized to its label. */
	compact?: boolean;
}) {
	const t = useTranslations("inbox.owner");
	const { role, userId } = useOfficeRole();
	const agents = useOfficeAgents(role === "manager");
	// Local only: the prototype never reassigns a real thread.
	const [owner, setOwner] = useState(conversation.owner?.id ?? "");
	if (role !== "manager") {
		return (
			<p className="text-sm font-medium">
				{!conversation.owner
					? t("unassigned")
					: conversation.owner.id === userId
						? t("mine")
						: conversation.owner.name}
			</p>
		);
	}
	return (
		<select
			className={cn(
				"px-2 text-sm border border-input bg-card text-foreground",
				compact ? "h-8 rounded-md" : "h-9 w-full rounded-xl",
			)}
			aria-label={t("assignTo")}
			value={owner}
			onChange={(event) => {
				setOwner(event.target.value);
				prototypeOnly("Assign");
			}}
		>
			<option value="">{t("unassigned")}</option>
			{agents.data?.map((agent) => (
				<option key={agent.id} value={agent.id}>
					{agent.name}
				</option>
			))}
		</select>
	);
}

export function ThreadLayoutA({
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
			<header className="gap-3 px-4 py-2.5 flex shrink-0 items-center border-b">
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
				<div className="min-w-0 flex flex-col">
					<p className="font-semibold tracking-tight font-heading truncate">{name}</p>
					<p className="text-xs text-muted-foreground">
						{[proto.guestLanguageName, t(`pipes.${conversation.pipe}`)].filter(Boolean).join(" · ")}
					</p>
				</div>
				<TurnBadge conversation={conversation} />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="ml-auto"
					aria-label="More"
					onClick={() => prototypeOnly("The thread menu")}
				>
					<EllipsisIcon className="size-4" />
				</Button>
			</header>
			<div className="min-h-0 flex flex-1">
				{/* The conversation, with the composer docked at its foot. */}
				<section className="min-h-0 min-w-0 flex flex-1 flex-col">
					<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
						<div className="gap-3 px-5 py-4 flex flex-col">
							{conversation.messages.map((message) => (
								<MessageCard key={message.id} message={message} proto={proto} />
							))}
						</div>
					</div>
					<div className="gap-2 px-5 pt-3 pb-3 flex shrink-0 flex-col border-t bg-muted/40">
						<div className="gap-2 flex items-center">
							<label
								htmlFor="proto-reply-a"
								className="font-semibold tracking-tight text-sm font-heading"
							>
								{t("reply")}
							</label>
							{proto.guestLanguageName ? (
								<span className="text-xs text-muted-foreground">in {proto.guestLanguageName}</span>
							) : null}
							{!stubReply.edited ? (
								<Badge status="neutral" size="sm">
									{stubReply.sourceLabel}
								</Badge>
							) : null}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="ml-auto"
								onClick={() => prototypeOnly("Regenerate")}
							>
								<RefreshCwIcon aria-hidden="true" className="size-3.5" />
								{t("regenerate")}
							</Button>
						</div>
						<Textarea
							id="proto-reply-a"
							value={stubReply.value}
							onChange={(event) => stubReply.onChange(event.target.value)}
							className="min-h-20"
						/>
						{draftTr ? (
							<p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
								<span className="mr-1.5 font-medium tracking-wide text-2xs uppercase">
									{proto.operatorLanguageName}
								</span>
								<span className={cn(draftTr.stub && "italic")}>{draftTr.text}</span>
							</p>
						) : null}
						<div className="gap-3 flex items-center justify-end">
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
				</section>
				{/* The rail: everything about the guest, in the operator's language. */}
				<aside className="min-h-0 w-88 flex shrink-0 flex-col divide-y overflow-y-auto border-l">
					<RailSection title="Guest details">
						<dl className="gap-x-3 gap-y-2 text-sm grid-cols-fields grid">
							{proto.facts.map((fact) => (
								<div key={fact.id} className="contents">
									<dt className="text-muted-foreground">{fact.label}</dt>
									<dd className="min-w-0">
										<span className="font-medium">{fact.value}</span>
										{fact.foreign ? (
											<span className="text-xs block text-muted-foreground">“{fact.raw}”</span>
										) : null}
									</dd>
								</div>
							))}
						</dl>
						{proto.missing.length > 0 ? (
							<div className="mt-1 gap-1.5 flex flex-col">
								<p className="text-xs text-muted-foreground">Missing</p>
								<div className="gap-1.5 flex flex-wrap">
									{proto.missing.map((m) => (
										<Badge key={m.id} status="neutral">
											{m.label}
										</Badge>
									))}
								</div>
							</div>
						) : null}
					</RailSection>
					{cribNotes ? (
						<RailSection title={t("forYou")}>
							<div className="gap-1 p-3 text-sm flex flex-col rounded-xl bg-touch/8">
								<p className="text-xs text-muted-foreground">{t("forYouHint")}</p>
								<p className="leading-relaxed whitespace-pre-wrap">{cribNotes}</p>
							</div>
						</RailSection>
					) : null}
					<RailSection title="CRM">
						<div className="flex">
							{conversation.officeHasCrm || conversation.crm ? (
								<CrmStatus conversation={conversation} />
							) : (
								<span className="text-sm text-muted-foreground">No CRM</span>
							)}
						</div>
					</RailSection>
					<RailSection title="Owner">
						<OwnerPicker conversation={conversation} />
					</RailSection>
				</aside>
			</div>
		</>
	);
}
