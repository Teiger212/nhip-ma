"use client";

import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
	InboxApiError,
	useCrmLeadSearch,
	useLinkCrmLead,
	useUnlinkCrmLead,
} from "../lib/inbox-queries";
import { isResolved } from "../lib/queue";
import type { Conversation } from "../lib/types";
import { type FlagTone, flagClass } from "./ThreadParts";

/**
 * The thread's CRM lead (ADR 0003): a chip with the outcome when linked, a "Link to CRM
 * lead" action when not. Either opens the picker, where the agent searches the office's
 * CRM and chooses. Nothing here links on a name by itself. Hidden while the office has no
 * CRM (the thread was never looked up).
 */
export function CrmLink({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox.crm");
	const [open, setOpen] = useState(false);
	const crm = conversation.crm;
	if (!crm) return null;

	const linked = crm.leadId !== null;
	// A resolved thread already shows Won / Lost as its status flag; the chip names the lead.
	// A lead whose guest wrote after the outcome keeps the outcome here, so it is not lost.
	const outcome =
		!isResolved(conversation) && (crm.outcome === "won" || crm.outcome === "lost")
			? crm.outcome
			: null;
	const tone: FlagTone = outcome === "won" ? "success" : "neutral";
	const label = outcome
		? `${t(outcome)} · ${crm.leadName}`
		: t("inCrm", { name: crm.leadName ?? "" });

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					linked ? (
						<button
							type="button"
							title={crm.outcomeReason ?? undefined}
							className={cn(
								flagClass(tone),
								"max-w-56 truncate transition-colors hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
							)}
						>
							{label}
						</button>
					) : (
						<Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
							<LinkIcon className="size-3.5" />
							{t("link")}
						</Button>
					)
				}
			/>
			<PopoverContent align="start" className="p-0 w-[min(100vw-2rem,20rem)]">
				{open ? (
					<LeadPicker
						conversationId={conversation.id}
						linked={linked}
						onDone={() => setOpen(false)}
					/>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function LeadPicker({
	conversationId,
	linked,
	onDone,
}: {
	conversationId: string;
	linked: boolean;
	onDone: () => void;
}) {
	const t = useTranslations("inbox.crm");
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const search = useCrmLeadSearch(query);
	const link = useLinkCrmLead();
	const unlink = useUnlinkCrmLead();
	const busy = link.isPending || unlink.isPending;

	function explain(caught: unknown) {
		const code = caught instanceof InboxApiError ? caught.code : null;
		const known = ["crm_not_connected", "lead_not_found", "not_found", "lead_required"];
		setError(code && known.includes(code) ? t(`errors.${code}`) : t("errors.not_found"));
	}

	async function choose(leadId: string) {
		setError(null);
		try {
			await link.mutateAsync({ id: conversationId, leadId });
			onDone();
		} catch (caught) {
			explain(caught);
		}
	}

	async function onUnlink() {
		setError(null);
		try {
			await unlink.mutateAsync({ id: conversationId });
			onDone();
		} catch (caught) {
			explain(caught);
		}
	}

	const leads = search.data?.leads ?? [];
	const typed = query.trim().length >= 2;

	return (
		<div className="flex flex-col">
			<div className="p-2 border-b">
				<Input
					autoFocus
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t("searchPlaceholder")}
					aria-label={t("searchPlaceholder")}
					className="h-9"
				/>
			</div>
			<ul className="max-h-64 p-1 overflow-y-auto">
				{!typed ? (
					<li className="px-2 py-3 text-xs text-muted-foreground">{t("searchHint")}</li>
				) : search.isPending ? (
					<li className="px-2 py-3 text-xs text-muted-foreground">…</li>
				) : leads.length === 0 ? (
					<li className="px-2 py-3 text-xs text-muted-foreground">{t("noResults")}</li>
				) : (
					leads.map((lead) => (
						<li key={lead.id}>
							<button
								type="button"
								disabled={busy}
								onClick={() => void choose(lead.id)}
								className="min-h-11 gap-3 px-2 text-sm flex w-full items-center justify-between rounded-md text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
							>
								<span className="font-medium truncate">{lead.name}</span>
								{lead.phone ? (
									<span className="font-mono text-xs shrink-0 text-muted-foreground tabular-nums">
										{lead.phone}
									</span>
								) : null}
							</button>
						</li>
					))
				)}
			</ul>
			{error ? <p className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
			{linked ? (
				<div className="p-1 border-t">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => void onUnlink()}
						className="min-h-11 text-xs w-full justify-start text-muted-foreground"
					>
						{t("unlink")}
					</Button>
				</div>
			) : null}
		</div>
	);
}
