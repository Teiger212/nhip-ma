"use client";

import { Button, Skeleton } from "@repo/ui";
import { useTranslations } from "next-intl";

import type { QueueView } from "../lib/queue";
import type { Conversation } from "../lib/types";
import { ThreadListState } from "./ThreadParts";
import { ThreadRow } from "./ThreadRow";

function ThreadListSkeleton() {
	return (
		<div className="divide-y" aria-hidden="true">
			{Array.from({ length: 4 }, (_, index) => (
				<div key={index} className="gap-2.5 px-3 py-2.5 flex items-start">
					<Skeleton className="size-8 rounded-md" />
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
}) {
	const t = useTranslations("inbox");

	function rows(list: Conversation[]) {
		return list.map((conversation) => (
			<ThreadRow
				key={conversation.id}
				conversation={conversation}
				active={conversation.id === selectedId}
				onOpen={() => onOpen(conversation.id)}
			/>
		));
	}

	if (loading) return <ThreadListSkeleton />;
	if (failed) {
		return (
			<ThreadListState
				title={t("loadError")}
				action={
					<Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onRetry}>
						{t("retry")}
					</Button>
				}
			/>
		);
	}
	if (queue.visible.length === 0 && queue.quiet.length === 0) {
		const title = total === 0 ? t("empty") : queue.caughtUp ? t("allCaughtUp") : t("noMatches");
		return (
			<ThreadListState
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
		<>
			{queue.visible.length === 0 ? (
				<ThreadListState title={t("onlyQuiet")} />
			) : (
				rows(queue.visible)
			)}
			{queue.quiet.length > 0 ? (
				<details className="border-t">
					<summary className="min-h-11 px-3 text-xs font-medium gap-2 flex cursor-pointer items-center text-muted-foreground">
						{t("quiet", { count: queue.quiet.length })}
					</summary>
					<p className="px-3 pb-2 text-xs text-pretty text-muted-foreground">{t("quietHint")}</p>
					{rows(queue.quiet)}
				</details>
			) : null}
		</>
	);
}
