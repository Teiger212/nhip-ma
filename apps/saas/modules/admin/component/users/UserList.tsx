"use client";

import { useSession } from "@auth/hooks/use-session";
import { authClient } from "@repo/auth/client";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import type { UserType } from "@repo/database";
import { Spinner } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Table, TableBody, TableCell, TableRow } from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/toast";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { Pagination } from "@shared/components/Pagination";
import { UserAvatar } from "@shared/components/UserAvatar";
import { orpc } from "@shared/lib/orpc-query-utils";
import { manualPaginationTableFeatures } from "@shared/lib/table-features";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, useTable } from "@tanstack/react-table";
import {
	BanIcon,
	MoreVerticalIcon,
	Repeat1Icon,
	ShieldCheckIcon,
	ShieldXIcon,
	SquareUserRoundIcon,
	TrashIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { useDebounceValue } from "usehooks-ts";

import { EmailVerified } from "../EmailVerified";
import { BanUserDialog } from "./BanUserDialog";

const ITEMS_PER_PAGE = 10;
const BAN_STATUS_REFRESH_INTERVAL = 30_000;

type AdminUser = UserType;

function isUserActivelyBanned(user: AdminUser, currentTime: number) {
	if (user.banned !== true) {
		return false;
	}

	if (!user.banExpires) {
		return true;
	}

	return new Date(user.banExpires).getTime() > currentTime;
}

function UserBanStatus({ user, currentTime }: { user: AdminUser; currentTime: number }) {
	const t = useTranslations();
	const formatter = useFormatter();

	if (!isUserActivelyBanned(user, currentTime)) {
		return null;
	}

	return (
		<TooltipProvider delay={0}>
			<Tooltip>
				<TooltipTrigger>
					<Badge status="error">{t("admin.users.ban.status.banned")}</Badge>
				</TooltipTrigger>
				<TooltipContent>
					<div className="space-y-1">
						<p>{t("admin.users.ban.status.reason", { reason: user.banReason ?? "" })}</p>
						<p>
							{user.banExpires
								? t("admin.users.ban.status.expires", {
										date: formatter.dateTime(new Date(user.banExpires), {
											dateStyle: "medium",
											timeStyle: "short",
										}),
									})
								: t("admin.users.ban.status.permanent")}
						</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function UserList() {
	const t = useTranslations();
	const { user: currentUser } = useSession();
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();
	const [userToBan, setUserToBan] = useState<AdminUser | null>(null);
	const [banStatusTime, setBanStatusTime] = useState(Date.now);
	const [currentPage, setCurrentPage] = useQueryState("currentPage", parseAsInteger.withDefault(1));
	const [searchTerm, setSearchTerm] = useQueryState("query", parseAsString.withDefault(""));
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useDebounceValue(searchTerm, 300, {
		leading: true,
		trailing: false,
	});

	useEffect(() => {
		setDebouncedSearchTerm(searchTerm);
	}, [searchTerm]); // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps

	useEffect(() => {
		const refreshInterval = window.setInterval(() => {
			setBanStatusTime(Date.now());
		}, BAN_STATUS_REFRESH_INTERVAL);

		return () => window.clearInterval(refreshInterval);
	}, []);

	const { data, isLoading, refetch } = useQuery(
		orpc.admin.users.list.queryOptions({
			input: {
				limit: ITEMS_PER_PAGE,
				offset: (currentPage - 1) * ITEMS_PER_PAGE,
				query: debouncedSearchTerm,
			},
		}),
	);

	useEffect(() => {
		if (currentPage > 1) {
			void setCurrentPage(1);
		}
	}, [debouncedSearchTerm]); // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps

	const impersonateUser = async (userId: string, { name }: { name: string }) => {
		const toastId = toast.add({
			title: t("admin.users.impersonation.impersonating", {
				name,
			}),
			type: "loading",
			timeout: 0,
		});

		await authClient.admin.impersonateUser({
			userId,
		});
		await refetch();
		toast.close(toastId);
		window.location.href = new URL("/", window.location.origin).toString();
	};

	const deleteUser = async (id: string) => {
		const removeUser = async () => {
			const { error } = await authClient.admin.removeUser({
				userId: id,
			});

			if (error) {
				throw error;
			}

			await queryClient.invalidateQueries({
				queryKey: orpc.admin.users.list.key(),
			});
		};

		await toast
			.promise(removeUser(), {
				loading: { title: t("admin.users.deleteUser.deleting") },
				success: { title: t("admin.users.deleteUser.deleted") },
				error: { title: t("admin.users.deleteUser.notDeleted") },
			})
			.catch(() => undefined);
	};

	const resendVerificationMail = async (email: string) => {
		const sendVerificationEmail = async () => {
			const { error } = await authClient.sendVerificationEmail({
				email,
			});

			if (error) {
				throw error;
			}
		};

		await toast
			.promise(sendVerificationEmail(), {
				loading: { title: t("admin.users.resendVerificationMail.submitting") },
				success: { title: t("admin.users.resendVerificationMail.success") },
				error: { title: t("admin.users.resendVerificationMail.error") },
			})
			.catch(() => undefined);
	};

	const assignAdminRole = async (id: string) => {
		await authClient.admin.setRole({
			userId: id,
			role: "admin",
		});

		await queryClient.invalidateQueries({
			queryKey: orpc.admin.users.list.key(),
		});
	};

	const removeAdminRole = async (id: string) => {
		await authClient.admin.setRole({
			userId: id,
			role: "user",
		});

		await queryClient.invalidateQueries({
			queryKey: orpc.admin.users.list.key(),
		});
	};

	const unbanUser = async (userId: string) => {
		const unban = async () => {
			const { error } = await authClient.admin.unbanUser({
				userId,
			});

			if (error) {
				throw error;
			}

			await queryClient.invalidateQueries({
				queryKey: orpc.admin.users.list.key(),
			});
		};

		await toast
			.promise(unban(), {
				loading: { title: t("admin.users.ban.notifications.unbanning") },
				success: { title: t("admin.users.ban.notifications.unbanSuccess") },
				error: { title: t("admin.users.ban.notifications.unbanError") },
			})
			.catch(() => undefined);
	};

	const columns: ColumnDef<typeof manualPaginationTableFeatures, AdminUser>[] = useMemo(
		() => [
			{
				accessorKey: "user",
				header: "",
				accessorFn: (row) => row.name,
				cell: ({ row }) => (
					<div className="gap-3 min-w-0 flex items-center">
						<UserAvatar
							name={row.original.name ?? row.original.email}
							avatarUrl={row.original.image}
						/>
						<div className="min-w-0">
							<p className="gap-2 flex flex-wrap items-center">
								<span className="font-heading font-semibold text-sm tracking-tight">
									{row.original.name ?? row.original.email}
								</span>
								{isPlatformAdmin(row.original.role) && (
									<Badge>{t("organizations.settings.members.platformAdmin")}</Badge>
								)}
								<UserBanStatus user={row.original} currentTime={banStatusTime} />
							</p>
							<p className="gap-1 text-xs flex items-center text-muted-foreground">
								{!!row.original.name && (
									<span className="min-w-0 break-all">{row.original.email}</span>
								)}
								<EmailVerified verified={row.original.emailVerified} className="shrink-0" />
							</p>
						</div>
					</div>
				),
			},
			{
				accessorKey: "actions",
				header: "",
				cell: ({ row }) => {
					return (
						<div className="gap-2 flex flex-row justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger
									render={
										<Button size="icon" variant="ghost">
											<MoreVerticalIcon className="size-4" />
										</Button>
									}
								/>
								<DropdownMenuContent>
									<DropdownMenuItem
										onClick={() =>
											impersonateUser(row.original.id, {
												name: row.original.name ?? "",
											})
										}
									>
										<SquareUserRoundIcon className="mr-2 size-4" />
										{t("admin.users.impersonate")}
									</DropdownMenuItem>

									{!row.original.emailVerified && (
										<DropdownMenuItem onClick={() => resendVerificationMail(row.original.email)}>
											<Repeat1Icon className="mr-2 size-4" />
											{t("admin.users.resendVerificationMail.title")}
										</DropdownMenuItem>
									)}

									{isUserActivelyBanned(row.original, banStatusTime) ? (
										<DropdownMenuItem onClick={() => unbanUser(row.original.id)}>
											<ShieldCheckIcon className="mr-2 size-4" />
											{t("admin.users.ban.actions.unban")}
										</DropdownMenuItem>
									) : (
										currentUser?.id !== row.original.id && (
											<DropdownMenuItem onClick={() => setUserToBan(row.original)}>
												<BanIcon className="mr-2 size-4" />
												{t("admin.users.ban.actions.ban")}
											</DropdownMenuItem>
										)
									)}

									{row.original.role !== "admin" ? (
										<DropdownMenuItem onClick={() => assignAdminRole(row.original.id)}>
											<ShieldCheckIcon className="mr-2 size-4" />
											{t("admin.users.assignAdminRole")}
										</DropdownMenuItem>
									) : (
										<DropdownMenuItem onClick={() => removeAdminRole(row.original.id)}>
											<ShieldXIcon className="mr-2 size-4" />
											{t("admin.users.removeAdminRole")}
										</DropdownMenuItem>
									)}

									<DropdownMenuItem
										variant="destructive"
										onClick={() =>
											confirm({
												title: t("admin.users.confirmDelete.title"),
												message: t("admin.users.confirmDelete.message"),
												confirmLabel: t("admin.users.confirmDelete.confirm"),
												destructive: true,
												onConfirm: () => deleteUser(row.original.id),
											})
										}
									>
										<TrashIcon className="mr-2 size-4" />
										{t("admin.users.delete")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				},
			},
		],
		[banStatusTime, currentUser?.id], // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps
	);

	const users = useMemo(() => data?.users ?? [], [data?.users]);

	const table = useTable({
		features: manualPaginationTableFeatures,
		data: users,
		columns,
		manualPagination: true,
	});

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>{t("admin.users.title")}</CardTitle>
				</CardHeader>
				<CardContent>
					<Input
						data-test="admin-users-search"
						type="search"
						aria-label={t("admin.users.search")}
						placeholder={t("admin.users.search")}
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						className="mb-2"
					/>

					{/* Rows split by hairlines on the card itself: no box inside the card (#295). */}
					<Table>
						<TableBody>
							{table.getRowModel().rows?.length ? (
								table.getRowModel().rows.map((row) => (
									<TableRow key={row.id}>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id}>
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</TableCell>
										))}
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={columns.length} className="h-24 text-center">
										{isLoading ? (
											<div className="flex h-full items-center justify-center text-muted-foreground">
												<Spinner className="mr-2 size-4" />
												{t("admin.users.loading")}
											</div>
										) : (
											<p data-test="admin-no-results" className="text-muted-foreground">
												{t("admin.users.empty")}
											</p>
										)}
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>

					{!!data?.total && data.total > ITEMS_PER_PAGE && (
						<Pagination
							className="mt-4"
							totalItems={data.total}
							itemsPerPage={ITEMS_PER_PAGE}
							currentPage={currentPage}
							onChangeCurrentPage={setCurrentPage}
						/>
					)}
				</CardContent>
			</Card>

			<BanUserDialog
				open={userToBan !== null}
				onOpenChange={(open) => {
					if (!open) {
						setUserToBan(null);
					}
				}}
				user={userToBan}
			/>
		</>
	);
}
