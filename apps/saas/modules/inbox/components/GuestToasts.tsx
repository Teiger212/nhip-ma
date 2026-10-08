"use client";

import { isInboxPath } from "@i18n/lib/locale-path";
import { LocaleLink } from "@i18n/routing";
import { toast } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { type AlertTranslate, guestAlertContent } from "../lib/guest-alerts/content";
import {
	GUEST_TOASTS_MAX,
	type GuestToastKind,
	guestToasts,
	type ListedThread,
	listed,
	toastStands,
} from "../lib/guest-toasts";
import { handOffThread, takeOwnAction, useInboxListShown } from "../lib/inbox-presence";
import { useConversations, useOfficeRole } from "../lib/inbox-queries";
import { inView, viewsFor } from "../lib/queue";
import type { ConversationSummary } from "../lib/types";

const toastId = (threadId: string) => `guest-${threadId}`;

/**
 * While Nhịp is open, a guest who writes on one of the operator's own threads, or a thread a
 * manager just gave them, raises a toast naming the guest (ADR 0019 "How", spec #84, #136),
 * unless the operator is looking at the Inbox list, which already shows it. It reads the list's
 * poll, the same one the nav count reads, so nothing else asks the server. One toast per guest,
 * replaced like the push; at most three; none for what was already there when the page loaded.
 * A toast stays until it is tapped (which opens the thread), closed, or has nothing left to say
 * (the guest answered, the thread given away); opening the Inbox list closes them all. The tap
 * hands the thread to the Inbox in memory: its id never goes in a URL.
 */
export function GuestToasts({ enabled }: { enabled: boolean }) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const list = useConversations({ enabled });
	const { userId, role } = useOfficeRole({ enabled });
	const listShown = useInboxListShown();
	const seen = useRef<Map<string, ListedThread> | null>(null);
	// Open guest toasts by thread, oldest first.
	const open = useRef<Map<string, GuestToastKind>>(new Map());

	useEffect(() => {
		if (!listShown) return;
		for (const threadId of open.current.keys()) toast.close(toastId(threadId));
		open.current.clear();
	}, [listShown]);

	useEffect(() => {
		if (!list.data || !userId) return;
		const operator = { userId, manager: role === "manager" };
		const before = seen.current;
		seen.current = listed(list.data);
		const byId = new Map(list.data.map((thread) => [thread.id, thread]));
		for (const [threadId, kind] of open.current) {
			if (!toastStands(kind, byId.get(threadId), operator)) close(threadId);
		}
		// The first poll is what was already there.
		if (before === null) return;
		const raised = guestToasts(before, list.data, operator, {
			ownAction: (threadId) => takeOwnAction(threadId, userId),
		});
		// The Inbox list shows guests itself.
		if (listShown) return;
		for (const { threadId, kind } of raised) {
			const thread = byId.get(threadId);
			if (thread) raise(thread, kind);
		}

		function close(threadId: string) {
			toast.close(toastId(threadId));
			open.current.delete(threadId);
		}

		function raise(thread: ConversationSummary, kind: GuestToastKind) {
			const content = guestAlertContent(
				{ guestName: thread.guestName, pipe: thread.pipe, guestLanguage: thread.guestLanguage },
				t as unknown as AlertTranslate,
				locale,
			);
			const name = thread.guestName?.trim();
			const title =
				kind === "waiting"
					? content.title
					: name
						? t("alerts.assignedToYou", { name })
						: t("alerts.assignedToYouUnnamed");
			// Adding with the same id replaces the guest's toast in place.
			toast.add({
				id: toastId(thread.id),
				title: (
					<LocaleLink
						// The first of the operator's views that holds the thread, so the Inbox opens on it
						// at once (a view is no guest's identifier).
						href={{
							pathname: "/inbox",
							query: {
								view: viewsFor(operator.manager).find((option) => inView(thread, option)) ?? "all",
							},
						}}
						data-test="guest-toast"
						// The whole toast is the tap target; the close button sits above it.
						className="after:inset-0 after:absolute after:rounded-xl"
						onClick={(event) => {
							handOffThread(thread.id);
							close(thread.id);
							// Already on the Inbox (a phone, on a thread): it takes the thread in memory,
							// and a navigation would remount it without the handoff.
							if (isInboxPath(window.location.pathname)) event.preventDefault();
						}}
					>
						{title}
					</LocaleLink>
				),
				description: content.body,
				timeout: 0,
				onRemove: () => {
					open.current.delete(thread.id);
				},
			});
			// A guest writing again keeps their toast's place: the oldest still gives way first.
			open.current.set(thread.id, kind);
			while (open.current.size > GUEST_TOASTS_MAX) close(open.current.keys().next().value!);
		}
	}, [list.data, userId, role, listShown, t, locale]);

	return null;
}
