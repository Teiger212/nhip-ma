"use client";

import { useSession } from "@auth/hooks/use-session";
import { languageName } from "@inbox/lib/language-name";
import { PIPE_NAMES } from "@inbox/lib/pipe-names";
import { formatInboxTimestamp } from "@inbox/lib/time";
import { Badge, Button, cn, Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowRightLeftIcon,
	BellIcon,
	InfoIcon,
	PartyPopperIcon,
	SparklesIcon,
	UnplugIcon,
	UserPlusIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";

import { type BellLine, bellLines } from "../lib/bell-rows";

const TYPE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
	WELCOME: PartyPopperIcon,
	APP_UPDATE: SparklesIcon,
	PIPE_DISCONNECTED: UnplugIcon,
	THREAD_ASSIGNED: UserPlusIcon,
	THREAD_MOVED: ArrowRightLeftIcon,
	system: InfoIcon,
	announcement: InfoIcon,
};

function getNotificationIcon(type: string) {
	return TYPE_ICONS[type] ?? BellIcon;
}

type NotificationRow = {
	id: string;
	type: string;
	data: unknown;
	link: string | null;
	read: boolean;
	createdAt: Date | string;
};

const EMPTY_NOTIFICATION_LIST: NotificationRow[] = [];

type Payload = {
	title?: string;
	message?: string;
	pipe?: string;
	office?: string | null;
	guestName?: string | null;
	language?: string | null;
};

function payloadOf(row: NotificationRow): Payload {
	return row.data && typeof row.data === "object" ? (row.data as Payload) : {};
}

/** One line of the bell: its icon, a title with when on its right, and an optional line under. */
function BellItem({
	icon: Icon,
	title,
	message,
	at,
	read,
	link,
	onOpen,
}: {
	icon: ComponentType<{ className?: string }>;
	title: string;
	message: ReactNode;
	at: Date | string;
	read: boolean;
	link: string | null;
	onOpen: () => void;
}) {
	const locale = useLocale();
	const iso = new Date(at).toISOString();
	const inner = (
		<div
			className={cn(
				"gap-3 px-2 py-2 text-sm ease-out flex rounded-lg transition-colors duration-200 motion-reduce:transition-none",
				read ? "hover:bg-muted/70" : "bg-accent/40 hover:bg-accent/70",
			)}
		>
			<Icon className="mt-0.5 size-4 shrink-0 text-primary" />
			<div className="min-w-0 flex-1">
				<div className="gap-2 flex items-baseline justify-between">
					<p className="font-medium min-w-0 leading-snug text-pretty">{title}</p>
					<time dateTime={iso} className="text-micro shrink-0 text-muted-foreground tabular-nums">
						{formatInboxTimestamp(iso, locale)}
					</time>
				</div>
				{message ? (
					<p className="mt-0.5 text-xs leading-snug text-muted-foreground">{message}</p>
				) : null}
			</div>
		</div>
	);
	return (
		<li>
			{link ? (
				<Link
					href={link}
					className="block rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
					onClick={onOpen}
				>
					{inner}
				</Link>
			) : (
				inner
			)}
		</li>
	);
}

export function NotificationCenter({ className }: { className?: string }) {
	const t = useTranslations("app.notifications");
	const tInbox = useTranslations("inbox");
	const locale = useLocale();
	const { user } = useSession();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);

	const { data: unreadData } = useQuery({
		...orpc.notifications.unreadCount.queryOptions({
			input: {},
		}),
		enabled: Boolean(user),
		refetchOnWindowFocus: true,
	});

	const { data: list = EMPTY_NOTIFICATION_LIST } = useQuery({
		...orpc.notifications.list.queryOptions({
			input: {},
		}),
		enabled: Boolean(user) && open,
	});

	const { mutate: markNotificationsRead } = useMutation(
		orpc.notifications.markRead.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.notifications.unreadCount.queryKey({
						input: {},
					}),
				});
				await queryClient.invalidateQueries({
					queryKey: orpc.notifications.list.queryKey({ input: {} }),
				});
			},
		}),
	);

	const markAllReadMutation = useMutation(
		orpc.notifications.markAllRead.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.notifications.unreadCount.queryKey({
						input: {},
					}),
				});
				await queryClient.invalidateQueries({
					queryKey: orpc.notifications.list.queryKey({ input: {} }),
				});
			},
		}),
	);

	useEffect(() => {
		if (!open || list.length === 0) {
			return;
		}
		const rows = list as NotificationRow[];
		const ids = rows.filter((n) => !n.read).map((n) => n.id);
		if (ids.length === 0) {
			return;
		}
		markNotificationsRead({ ids });
	}, [open, list, markNotificationsRead]);

	if (!user) {
		return null;
	}

	const unreadCount = unreadData?.count ?? 0;
	const lines = bellLines(list as NotificationRow[]);

	/** "WhatsApp · Korean" for a thread given to the reader: the pipe and language, never the guest (ADR 0019). */
	function assignedMeta(payload: Payload): string {
		const pipe = PIPE_NAMES[payload.pipe as keyof typeof PIPE_NAMES];
		if (!pipe) return "";
		return payload.language
			? tInbox("alerts.body", {
					pipe,
					language: languageName(payload.language, locale, (language) =>
						tInbox(`guestLanguage.${language}`),
					),
				})
			: pipe;
	}

	function itemFor(line: BellLine<NotificationRow>) {
		if (line.kind === "assigned") {
			const [newest] = line.rows;
			return (
				<BellItem
					key={newest.id}
					icon={UserPlusIcon}
					title={t("threadAssigned.grouped", { count: line.rows.length })}
					message={null}
					at={newest.createdAt}
					read={line.read}
					link={`/${locale}/inbox`}
					onOpen={() => setOpen(false)}
				/>
			);
		}
		const n = line.row;
		const payload = payloadOf(n);
		let title = payload.title ?? n.type ?? t("fallbackTitle");
		let message = payload.message ?? "";
		// Nhịp's own types are written in the reader's language from their data.
		if (n.type === "PIPE_DISCONNECTED") {
			const pipe = PIPE_NAMES[payload.pipe as keyof typeof PIPE_NAMES] ?? payload.pipe ?? "";
			title = payload.office
				? t("pipeDisconnected.title", { pipe, office: payload.office })
				: t("pipeDisconnected.titleNoOffice", { pipe });
			message = t("pipeDisconnected.message");
		}
		// A thread given to the reader names no guest (ADR 0019), only its pipe and language (#94);
		// one moved away from them names the guest, never who has it now (ADR 0022, P4).
		if (n.type === "THREAD_ASSIGNED") {
			title = t("threadAssigned.title");
			message = assignedMeta(payload);
		}
		if (n.type === "THREAD_MOVED") {
			title = payload.guestName
				? t("threadMoved.title", { name: payload.guestName })
				: t("threadMoved.titleUnnamed");
		}
		return (
			<BellItem
				key={n.id}
				icon={getNotificationIcon(n.type)}
				title={title}
				message={message}
				at={n.createdAt}
				read={n.read}
				link={n.link}
				onOpen={() => setOpen(false)}
			/>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="icon"
						className={cn("relative", className)}
						aria-label={t("aria.open")}
					>
						<BellIcon className="size-4 text-muted-foreground" />
						{unreadCount > 0 ? (
							/* The squared count badge (DESIGN.md, Badges), on a backing of the bar it sits
							   on so its tint reads over the bell's edge, as the nav's count does (#234). */
							<span className="-right-1.5 -top-1.5 absolute flex rounded-md bg-sidebar ring-2 ring-sidebar">
								<Badge status="info" numeric size="sm">
									{unreadCount > 99 ? "99+" : unreadCount}
								</Badge>
							</span>
						) : null}
					</Button>
				}
			/>
			<PopoverContent layout="list">
				<div className="gap-2 px-3 py-2 flex items-center justify-between border-b">
					<h2 className="font-semibold text-sm">{t("title")}</h2>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="shrink-0"
						disabled={
							list.length === 0 || !list.some((n) => !n.read) || markAllReadMutation.isPending
						}
						onClick={() => markAllReadMutation.mutate({})}
					>
						{t("markAllRead")}
					</Button>
				</div>
				<div className="max-h-80 px-1 py-2 overflow-y-auto">
					{list.length === 0 ? (
						<p className="px-3 py-6 text-sm text-center text-muted-foreground">{t("empty")}</p>
					) : (
						<ul className="gap-1 flex flex-col">{lines.map(itemFor)}</ul>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
