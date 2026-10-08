"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout) · D · Workbench + bubbles.
 * A's structure (conversation with the docked reply box, guest rail on the right) with B's chat
 * bubbles. The operator note shrinks to one instruction beside the Reply label; the rail keeps
 * details, named missing chips, CRM and Owner.
 *
 * Responsive: the pane is a size container. Below @4xl (56rem = 896px of pane), a 22rem rail
 * would leave the conversation under ~540px, so the rail folds into B's summary strip under the
 * header and CRM / Owner move into the header. At 1563px (sidebar open) the pane is ~930px and
 * keeps the rail; at 1366px it is ~740px with the sidebar open (strip) and ~1030px with it
 * collapsed (rail). Read-only: Approve, Regenerate and Assign only toast.
 */
import { Badge, Button, cn, Textarea } from "@repo/ui";
import { ChevronLeftIcon, EllipsisIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { displayName } from "../../lib/display-name";
import type { Conversation } from "../../lib/types";
import { CrmStatus } from "../CrmStatus";
import type { ReplyState } from "../ThreadDetail";
import { GuestMark } from "../ThreadParts";
import { prototypeOnly, useProtoThread, useScrollToEnd, useStubReply } from "./shared.prototype";
import { OwnerPicker, RailSection, TurnBadge } from "./ThreadLayoutA.prototype";
import { Bubble, SummaryStrip } from "./ThreadLayoutB.prototype";

type Proto = ReturnType<typeof useProtoThread>;

/**
 * The operator note, slimmed to what the details don't already say: the reply language, the
 * no-interview rule, and the paperwork caution when it came up.
 */
function slimNote(proto: Proto): string {
	const parts = [
		proto.guestLanguageName ? `in ${proto.guestLanguageName}` : null,
		"don't interview",
		proto.facts.some((f) => f.id === "paperwork") ? "no promises on the pink book" : null,
	];
	return parts.filter(Boolean).join(" · ");
}

function CrmLine({ conversation }: { conversation: Conversation }) {
	return conversation.officeHasCrm || conversation.crm ? (
		<CrmStatus conversation={conversation} />
	) : (
		<span className="text-sm text-muted-foreground">No CRM</span>
	);
}

export function ThreadLayoutD({
	conversation,
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
	const scrollRef = useScrollToEnd(conversation.id);
	const name = displayName(conversation);
	return (
		<div className="min-h-0 @container flex flex-1 flex-col">
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
					<p className="text-xs truncate text-muted-foreground">
						{[proto.guestLanguageName, t(`pipes.${conversation.pipe}`)].filter(Boolean).join(" · ")}
					</p>
				</div>
				<TurnBadge conversation={conversation} />
				{/* Narrow pane: what the rail held moves up here. */}
				<div className="gap-2 @4xl:hidden ml-auto flex items-center">
					<CrmLine conversation={conversation} />
					<OwnerPicker conversation={conversation} compact />
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="@4xl:ml-auto shrink-0"
					aria-label="More"
					onClick={() => prototypeOnly("The thread menu")}
				>
					<EllipsisIcon className="size-4" />
				</Button>
			</header>
			<div className="@4xl:hidden shrink-0">
				<SummaryStrip proto={proto} />
			</div>
			<div className="min-h-0 flex flex-1">
				<section className="min-h-0 min-w-0 flex flex-1 flex-col">
					<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
						<div className="gap-4 px-5 py-5 flex flex-col">
							{conversation.messages.map((message) => (
								<Bubble key={message.id} message={message} proto={proto} />
							))}
						</div>
					</div>
					<div className="gap-2 px-5 pt-3 pb-3 flex shrink-0 flex-col border-t bg-muted/40">
						<div className="gap-x-2 gap-y-1 flex flex-wrap items-center">
							<label
								htmlFor="proto-reply-d"
								className="font-semibold tracking-tight text-sm font-heading"
							>
								{t("reply")}
							</label>
							<span className="text-xs text-muted-foreground" title={t("forYouHint")}>
								{slimNote(proto)}
							</span>
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
							id="proto-reply-d"
							value={stubReply.value}
							onChange={(event) => stubReply.onChange(event.target.value)}
							className="min-h-20"
						/>
						<div className="gap-4 flex items-start">
							<p
								className={cn(
									"text-xs leading-relaxed min-w-0 flex-1 whitespace-pre-wrap text-muted-foreground",
									draftTr?.stub && "italic",
								)}
							>
								{draftTr ? (
									<>
										<span className="mr-1.5 font-medium tracking-wide text-2xs uppercase">
											{proto.operatorLanguageName}
										</span>
										{draftTr.text}
									</>
								) : null}
							</p>
							<Button
								type="button"
								variant="primary"
								className="min-h-11 shrink-0"
								disabled={!reply.canApprove}
								onClick={() => prototypeOnly("Approve and send")}
							>
								{t("approveAndSend")}
							</Button>
						</div>
					</div>
				</section>
				<aside className="min-h-0 w-88 @4xl:flex hidden shrink-0 flex-col divide-y overflow-y-auto border-l">
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
					<RailSection title="CRM">
						<div className="flex">
							<CrmLine conversation={conversation} />
						</div>
					</RailSection>
					<RailSection title="Owner">
						<OwnerPicker conversation={conversation} />
					</RailSection>
				</aside>
			</div>
		</div>
	);
}
