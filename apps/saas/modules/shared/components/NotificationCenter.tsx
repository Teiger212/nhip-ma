"use client";

import { useSession } from "@auth/hooks/use-session";
import { PIPE_NAMES } from "@inbox/lib/pipe-names";
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
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
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

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

export function NotificationCenter({ className }: { className?: string }) {
	const t = useTranslations("app.notifications");
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
							<span className="-right-1.5 -top-1.5 h-5 min-w-5 px-1 font-semibold text-2xs absolute flex items-center justify-center rounded-full bg-touch leading-none text-touch-foreground">
								{unreadCount > 99 ? "99+" : unreadCount}
							</span>
						) : null}
					</Button>
				}
			/>
			<PopoverContent className="p-0 w-popover">
				<div className="gap-2 px-3 py-2 flex items-center justify-between border-b">
					<h2 className="font-semibold text-sm">{t("title")}</h2>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 text-xs shrink-0"
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
						<ul className="gap-1 flex flex-col">
							{(list as NotificationRow[]).map((n) => {
								const payload =
									n.data && typeof n.data === "object" && n.data !== null
										? (n.data as {
												title?: string;
												message?: string;
												pipe?: string;
												office?: string | null;
												guestName?: string | null;
											})
										: {};
								let title = payload.title ?? n.type ?? t("fallbackTitle");
								let message = payload.message ?? "";
								// Nhịp's own types are written in the reader's language from their data.
								if (n.type === "PIPE_DISCONNECTED") {
									const pipe =
										PIPE_NAMES[payload.pipe as keyof typeof PIPE_NAMES] ?? payload.pipe ?? "";
									title = payload.office
										? t("pipeDisconnected.title", { pipe, office: payload.office })
										: t("pipeDisconnected.titleNoOffice", { pipe });
									message = t("pipeDisconnected.message");
								}
								// A thread given to the reader names no guest (ADR 0019); one moved away from
								// them names the guest, never who has it now (ADR 0022, P4).
								if (n.type === "THREAD_ASSIGNED") {
									title = t("threadAssigned.title");
								}
								if (n.type === "THREAD_MOVED") {
									title = payload.guestName
										? t("threadMoved.title", { name: payload.guestName })
										: t("threadMoved.titleUnnamed");
								}
								const Icon = getNotificationIcon(n.type);
								const inner = (
									<div
										className={
											n.read
												? "gap-3 px-2 py-2 text-sm flex rounded-lg"
												: "gap-3 px-2 py-2 text-sm flex rounded-lg bg-accent/40"
										}
									>
										<Icon className="mt-0.5 size-4 shrink-0 text-primary" />
										<div className="min-w-0 flex-1">
											<p className="font-medium leading-snug">{title}</p>
											{message ? (
												<p className="mt-0.5 text-xs leading-snug text-muted-foreground">
													{message}
												</p>
											) : null}
										</div>
									</div>
								);
								return (
									<li key={n.id}>
										{n.link ? (
											<Link
												href={n.link}
												className="block rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
												onClick={() => setOpen(false)}
											>
												{inner}
											</Link>
										) : (
											inner
										)}
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
