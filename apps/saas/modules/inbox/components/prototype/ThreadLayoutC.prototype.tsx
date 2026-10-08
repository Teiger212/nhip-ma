"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout) · C · Parallel text.
 * Bilingual reading is the organising principle: every message is a row of two columns, what
 * was said | what it says in the operator's language. The guest details follow as the same
 * kind of table (field | guest wrote | means), and the reply is two panes: what the guest gets
 * (editable, their language) | what it says (read-only, the operator's). Read-only: Approve,
 * Regenerate and Assign only toast.
 */
import { Badge, Button, cn, Textarea } from "@repo/ui";
import { ChevronLeftIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { displayName } from "../../lib/display-name";
import { formatInboxTimestamp } from "../../lib/time";
import type { Conversation, Message } from "../../lib/types";
import { CrmStatus } from "../CrmStatus";
import { SendBar } from "../SendBar";
import type { ReplyState } from "../ThreadDetail";
import { GuestMark, ThreadFlags, useOperatorLanguage } from "../ThreadParts";
import {
	listPhrase,
	prototypeOnly,
	useMessageSource,
	useProtoThread,
	useStubReply,
} from "./shared.prototype";

type Proto = ReturnType<typeof useProtoThread>;

function ColumnHead({ children }: { children: React.ReactNode }) {
	return (
		<p className="font-medium tracking-wide text-2xs text-muted-foreground uppercase">{children}</p>
	);
}

function ParallelRow({ message, proto }: { message: Message; proto: Proto }) {
	const t = useTranslations("inbox");
	const locale = useOperatorLanguage();
	const source = useMessageSource()(message);
	const inbound = message.direction === "in";
	const tr = proto.messageTr(message);
	return (
		<div className={cn("px-5 py-3 border-b", !inbound && "bg-muted/40")}>
			<div className="mb-1.5 gap-x-2 text-xs flex flex-wrap items-baseline text-muted-foreground">
				{message.source === "auto-reply" ? (
					<Badge status="neutral" size="sm">
						{source.label}
						{source.writer ? ` · ${source.writer}` : ""}
					</Badge>
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
			<div className="gap-6 text-sm leading-relaxed grid grid-cols-2">
				<p className="whitespace-pre-wrap text-foreground/80">{message.text}</p>
				{tr ? (
					<p
						className={cn(
							"whitespace-pre-wrap text-foreground",
							tr.stub && "text-muted-foreground italic",
						)}
					>
						{tr.text}
					</p>
				) : (
					<p className="text-xs self-center text-muted-foreground">
						Already in {proto.operatorLanguageName}
					</p>
				)}
			</div>
		</div>
	);
}

export function ThreadLayoutC({
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
	const stubReply = useStubReply(conversation, reply.reply);
	const draftTr = stubReply.translation;
	const name = displayName(conversation);
	const guestLang = proto.guestLanguageName ?? "Guest's language";
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
				<ThreadFlags conversation={conversation} />
				<CrmStatus conversation={conversation} />
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{/* The two languages, named once, above every row. */}
				<div className="gap-6 px-5 py-2 top-0 sticky z-10 grid grid-cols-2 border-b bg-card">
					<ColumnHead>{guestLang} · as written</ColumnHead>
					<ColumnHead>{proto.operatorLanguageName} · what it says</ColumnHead>
				</div>
				{conversation.messages.map((message) => (
					<ParallelRow key={message.id} message={message} proto={proto} />
				))}

				{/* What we know, read the same way: what the guest wrote | what it means. */}
				<section className="px-5 pt-5 pb-2">
					<h2 className="mb-2 font-semibold tracking-tight text-sm font-heading">Guest details</h2>
					<div className="text-sm rounded-xl border">
						<div className="gap-6 px-3 py-1.5 grid grid-cols-3 bg-muted/40">
							<ColumnHead>Field</ColumnHead>
							<ColumnHead>Guest wrote</ColumnHead>
							<ColumnHead>In {proto.operatorLanguageName}</ColumnHead>
						</div>
						{proto.facts.map((fact) => (
							<div key={fact.id} className="gap-6 px-3 py-1.5 grid grid-cols-3 border-t">
								<span className="text-muted-foreground">{fact.label}</span>
								<span className={fact.raw ? "text-foreground/80" : "text-muted-foreground"}>
									{fact.raw ?? "—"}
								</span>
								<span className="font-medium">{fact.value}</span>
							</div>
						))}
						{proto.missing.length > 0 ? (
							<div className="gap-6 px-3 py-1.5 grid grid-cols-3 border-t bg-muted/40">
								<span className="text-muted-foreground">Missing</span>
								<span className="col-span-2 text-foreground/80">
									{listPhrase(proto.missing.map((m) => m.label))}
								</span>
							</div>
						) : null}
					</div>
				</section>

				<section className="gap-2 px-5 pt-4 pb-5 flex flex-col">
					<div className="gap-2 flex items-center">
						<h2 className="font-semibold tracking-tight text-sm font-heading">{t("reply")}</h2>
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
					{cribNotes ? (
						<p className="p-3 text-xs leading-relaxed rounded-xl bg-touch/8">
							<span className="font-medium">{t("forYou")} · </span>
							{cribNotes}
						</p>
					) : null}
					<div className="gap-4 grid grid-cols-2">
						<div className="gap-1.5 flex flex-col">
							<label htmlFor="proto-reply-c">
								<ColumnHead>
									{name} gets · {guestLang}
								</ColumnHead>
							</label>
							<Textarea
								id="proto-reply-c"
								value={stubReply.value}
								onChange={(event) => stubReply.onChange(event.target.value)}
								className="min-h-28"
							/>
						</div>
						<div className="gap-1.5 flex flex-col">
							<ColumnHead>It says · {proto.operatorLanguageName}</ColumnHead>
							<div className="min-h-28 px-3 py-2 text-sm leading-relaxed flex-1 rounded-xl bg-muted/60 whitespace-pre-wrap">
								{draftTr ? (
									<span className={cn(draftTr.stub && "text-muted-foreground italic")}>
										{draftTr.text}
									</span>
								) : (
									<span className="text-muted-foreground">{stubReply.value || "—"}</span>
								)}
							</div>
						</div>
					</div>
				</section>
			</div>
			<SendBar
				status={reply.status}
				canApprove={reply.canApprove}
				sending={false}
				onApprove={() => prototypeOnly("Approve and send")}
			/>
		</>
	);
}
