"use client";

import { Button, Skeleton } from "@repo/ui";
import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";

import { EASE, reducedMotion } from "../lib/motion";
import type { QueueView } from "../lib/queue";
import type { ConversationSummary } from "../lib/types";
import { ThreadListState, type TurnChip } from "./ThreadParts";
import { ThreadRow } from "./ThreadRow";

function ThreadListSkeleton() {
	return (
		<div className="px-1.5" aria-hidden="true">
			{Array.from({ length: 4 }, (_, index) => (
				<div key={index} className="gap-2.5 px-2.5 py-2.5 flex items-start">
					<Skeleton className="size-7 rounded-lg" />
					<div className="min-w-0 flex-1">
						<Skeleton className="mb-1.5 h-3.5 w-28" />
						<Skeleton className="mb-1 h-3 w-full" />
						<Skeleton className="h-3 w-2/3" />
					</div>
				</div>
			))}
		</div>
	);
}

/** Where a row stood after the last commit: its element and its box in the list. */
type RowPlace = { node: HTMLLIElement; top: number; left: number; width: number };

/**
 * The handoff's list half (#330): when the thread just answered leaves the list, a faded copy of
 * its row slides 12px left where it stood (160ms) while the rows below glide up into place
 * (FLIP, 220ms). Transform and opacity only, so the list lays out once and the compositor runs
 * the rest. Only the answered thread's leaving animates: a poll, a view switch or a search swaps
 * the list at once. Under reduced motion the row just goes. The copy sits in a layer of its own,
 * never in the list React renders, and carries no test hook, focus or name.
 */
function useHandoffRows(departingId: string | null) {
	const layer = useRef<HTMLDivElement>(null);
	const rows = useRef(new Map<string, HTMLLIElement>());
	const placed = useRef(new Map<string, RowPlace>());
	const registerRow = useCallback((id: string, node: HTMLLIElement | null) => {
		if (node) rows.current.set(id, node);
		else rows.current.delete(id);
	}, []);
	useLayoutEffect(() => {
		const before = placed.current;
		const after = new Map<string, RowPlace>();
		for (const [id, node] of rows.current) {
			// A row out of view (the list hidden on a phone, a closed Quiet fold) has no place.
			if (!node.isConnected || node.offsetParent === null) continue;
			after.set(id, { node, top: node.offsetTop, left: node.offsetLeft, width: node.offsetWidth });
		}
		placed.current = after;
		const left = departingId ? before.get(departingId) : undefined;
		if (!left || !departingId || after.has(departingId) || !layer.current || reducedMotion()) {
			return;
		}
		layer.current.replaceChildren();
		const ghost = left.node.cloneNode(true) as HTMLElement;
		for (const element of [ghost, ...ghost.querySelectorAll<HTMLElement>("*")]) {
			element.removeAttribute("data-test");
			element.removeAttribute("aria-current");
			element.removeAttribute("id");
		}
		ghost.inert = true;
		ghost.setAttribute("aria-hidden", "true");
		Object.assign(ghost.style, {
			position: "absolute",
			top: `${left.top}px`,
			left: `${left.left}px`,
			width: `${left.width}px`,
		});
		layer.current.append(ghost);
		const fade = ghost.animate(
			[
				{ opacity: 1, transform: "none" },
				{ opacity: 0, transform: "translateX(-12px)" },
			],
			{ duration: 160, easing: EASE.exit, fill: "forwards" },
		);
		void fade.finished.then(
			() => ghost.remove(),
			() => ghost.remove(),
		);
		for (const [id, now] of after) {
			const was = before.get(id);
			const shift = was ? was.top - now.top : 0;
			if (Math.abs(shift) < 1) continue;
			now.node.animate([{ transform: `translateY(${shift}px)` }, { transform: "none" }], {
				duration: 220,
				easing: EASE.arrive,
			});
		}
	});
	return { layer, registerRow };
}

/**
 * The contents of the list column: loading, load error, the empty states, then the
 * visible threads with the quiet ones folded under them (ADR 0004). The column itself,
 * its width and its show/hide on a phone, belong to the Inbox shell.
 */
export function ThreadList({
	queue,
	loading,
	failed,
	total,
	selectedId,
	onOpen,
	onRetry,
	onViewSent,
	emptyTitle,
	rowAction,
	ownerBadges = true,
	viewSays = null,
	departingId = null,
}: {
	queue: QueueView;
	loading: boolean;
	failed: boolean;
	/** How many threads the office has at all, to tell "nothing yet" from "no matches". */
	total: number;
	selectedId: string | null;
	onOpen: (id: string) => void;
	onRetry: () => void;
	onViewSent: () => void;
	/** What an empty inbox says to this operator (an agent's: nothing assigned yet, ADR 0022). */
	emptyTitle?: string;
	/** What sits at each row's end (a manager's "Assign to…" in Unassigned, ADR 0022). */
	rowAction?: (conversation: ConversationSummary) => ReactNode;
	/** False in a manager's Unassigned view: the view says whose they are, so rows don't (#303). */
	ownerBadges?: boolean;
	/** The turn the view's tab already says, which its rows don't repeat (#327). */
	viewSays?: TurnChip | null;
	/** The thread whose reply is being sent: when it leaves the list, the handoff plays (#330). */
	departingId?: string | null;
}) {
	const t = useTranslations("inbox");
	const { layer, registerRow } = useHandoffRows(departingId);

	function rows(list: ConversationSummary[]) {
		return (
			<ul>
				{list.map((conversation) => (
					<ThreadRow
						key={conversation.id}
						conversation={conversation}
						active={conversation.id === selectedId}
						onOpen={onOpen}
						registerRow={registerRow}
						action={rowAction?.(conversation)}
						ownerBadge={ownerBadges}
						viewSays={viewSays}
					/>
				))}
			</ul>
		);
	}

	if (loading) return <ThreadListSkeleton />;
	if (failed) {
		return (
			<ThreadListState
				testId="inbox-load-error"
				title={t("loadError")}
				action={
					<Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onRetry}>
						{t("retry")}
					</Button>
				}
			/>
		);
	}
	if (queue.allAssigned) {
		return <ThreadListState testId="inbox-all-assigned" title={t("allAssigned")} />;
	}
	if (queue.visible.length === 0 && queue.quiet.length === 0) {
		const title =
			total === 0 ? (emptyTitle ?? t("empty")) : queue.caughtUp ? t("allCaughtUp") : t("noMatches");
		return (
			<ThreadListState
				testId={
					total === 0 ? "inbox-empty" : queue.caughtUp ? "inbox-caught-up" : "inbox-no-matches"
				}
				title={title}
				action={
					queue.caughtUp && queue.counts.sent > 0 ? (
						<Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onViewSent}>
							{t("viewSent")}
						</Button>
					) : null
				}
			/>
		);
	}
	return (
		<div className="relative">
			{queue.visible.length === 0 ? (
				<ThreadListState title={t("onlyQuiet")} />
			) : (
				rows(queue.visible)
			)}
			{queue.quiet.length > 0 ? (
				<details className="group/quiet mt-1 border-t">
					<summary className="min-h-11 px-4 text-xs font-medium gap-1.5 no-marker flex cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset">
						<ChevronRightIcon
							aria-hidden="true"
							className="size-3.5 ease-out shrink-0 transition-transform duration-200 group-open/quiet:rotate-90 motion-reduce:transition-none"
						/>
						{t("quiet", { count: queue.quiet.length })}
					</summary>
					<p className="px-4 pb-2 text-xs text-pretty text-muted-foreground">{t("quietHint")}</p>
					{rows(queue.quiet)}
				</details>
			) : null}
			<div ref={layer} aria-hidden="true" className="inset-0 pointer-events-none absolute" />
		</div>
	);
}
