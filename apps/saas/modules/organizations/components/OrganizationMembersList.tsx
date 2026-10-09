"use client";
import { useSession } from "@auth/hooks/use-session";
import { useOrganizationMemberRoles } from "@organizations/hooks/member-roles";
import {
	fullOrganizationQueryKey,
	organizationListQueryKey,
	useFullOrganizationQuery,
} from "@organizations/lib/api";
import type { OrganizationMemberRole } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { isPlatformAdmin } from "@repo/auth/lib/roles";
import { checkPermission } from "@repo/permissions";
import { Button } from "@repo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Table, TableBody, TableCell, TableRow } from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { UserAvatar } from "@shared/components/UserAvatar";
import { clientDataTableFeatures } from "@shared/lib/table-features";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { flexRender, useTable } from "@tanstack/react-table";
import { LogOutIcon, MoreVerticalIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { OrganizationRoleSelect } from "./OrganizationRoleSelect";

export function OrganizationMembersList({
	organizationId,
	lockOwnRow = false,
}: {
	organizationId: string;
	lockOwnRow?: boolean;
}) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { user } = useSession();
	const { confirm } = useConfirmationAlert();
	const { data: organization } = useFullOrganizationQuery(organizationId);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const memberRoles = useOrganizationMemberRoles();

	// Scoped to this organizationId — do not use active-org usePermissions().check here.
	const membershipRole = organization?.members.find((member) => member.userId === user?.id)?.role;
	const canManageOrganization = checkPermission(
		{
			user,
			membershipRole,
		},
		"organization.manage",
	);

	const updateMemberRole = async (memberId: string, role: OrganizationMemberRole) => {
		const updateRole = async () => {
			// The client answers a refusal with `error` rather than throwing; the toast must say so.
			const { error } = await authClient.organization.updateMemberRole({
				memberId,
				role,
				organizationId,
			});
			if (error) {
				throw error;
			}

			await queryClient.invalidateQueries({
				queryKey: fullOrganizationQueryKey(organizationId),
			});
		};

		await toast
			.promise(updateRole(), {
				loading: {
					title: t(
						"organizations.settings.members.notifications.updateMembership.loading.description",
					),
				},
				success: {
					title: t(
						"organizations.settings.members.notifications.updateMembership.success.description",
					),
				},
				error: {
					title: t(
						"organizations.settings.members.notifications.updateMembership.error.description",
					),
				},
			})
			.catch(() => undefined);
	};

	const removeMember = async (memberId: string) => {
		const remove = async () => {
			const { error } = await authClient.organization.removeMember({
				memberIdOrEmail: memberId,
				organizationId,
			});
			if (error) {
				throw error;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: fullOrganizationQueryKey(organizationId),
				}),
				queryClient.invalidateQueries({
					queryKey: organizationListQueryKey,
				}),
			]);
		};

		await toast
			.promise(remove(), {
				loading: {
					title: t("organizations.settings.members.notifications.removeMember.loading.description"),
				},
				success: {
					title: t("organizations.settings.members.notifications.removeMember.success.description"),
				},
				error: {
					title: t("organizations.settings.members.notifications.removeMember.error.description"),
				},
			})
			.catch(() => undefined);
	};

	const columns: ColumnDef<
		typeof clientDataTableFeatures,
		NonNullable<typeof organization>["members"][number]
	>[] = [
		{
			accessorKey: "user",
			header: "",
			accessorFn: (row) => row.user,
			cell: ({ row }) =>
				row.original.user ? (
					<div className="gap-3 min-w-0 flex items-center">
						<UserAvatar
							name={row.original.user.name ?? row.original.user.email}
							avatarUrl={row.original.user?.image}
						/>
						<div className="min-w-0">
							<p className="font-heading font-semibold text-sm tracking-tight">
								{row.original.user.name}
							</p>
							<p className="text-xs break-all text-muted-foreground">{row.original.user.email}</p>
						</div>
					</div>
				) : null,
		},
		{
			accessorKey: "actions",
			header: "",
			cell: ({ row }) => {
				const ownRow = row.original.userId === user?.id;
				const locked = lockOwnRow && ownRow;
				// The platform admin's own row (in the admin area: office pages send them there) reads
				// "Platform admin", with no role or Leave: their membership is inert (ADR 0015, #174).
				if (ownRow && isPlatformAdmin(user?.role)) {
					return (
						<div className="gap-2 flex flex-row justify-end">
							<span
								data-test="team-member-role"
								className="text-sm text-right text-muted-foreground"
							>
								{t("organizations.settings.members.platformAdmin")}
							</span>
						</div>
					);
				}
				const name = row.original.user?.name || row.original.user?.email || "";
				return (
					<div className="gap-2 flex flex-row items-center justify-end">
						{canManageOrganization ? (
							<>
								<OrganizationRoleSelect
									dataTest="team-member-role"
									size="sm"
									value={row.original.role}
									onSelect={async (value) => updateMemberRole(row.original.id, value)}
									disabled={!canManageOrganization || row.original.role === "owner" || locked}
								/>
								{locked ? null : (
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button size="icon" variant="ghost">
													<MoreVerticalIcon className="size-4" />
												</Button>
											}
										/>
										<DropdownMenuContent>
											{row.original.userId !== user?.id && (
												<DropdownMenuItem
													disabled={!canManageOrganization}
													variant="destructive"
													onClick={() =>
														// Removal ends the account (ADR 0013), so it asks first (#174).
														confirm({
															title: t("organizations.settings.members.confirmRemove.title", {
																name,
															}),
															message: t("organizations.settings.members.confirmRemove.message", {
																name,
															}),
															confirmLabel: t(
																"organizations.settings.members.confirmRemove.confirm",
															),
															destructive: true,
															onConfirm: async () => removeMember(row.original.id),
														})
													}
												>
													<TrashIcon className="mr-2 size-4" />
													{t("organizations.settings.members.removeMember")}
												</DropdownMenuItem>
											)}
											{row.original.userId === user?.id && (
												<DropdownMenuItem
													variant="destructive"
													onClick={async () => removeMember(row.original.id)}
												>
													<LogOutIcon className="mr-2 size-4" />
													{t("organizations.settings.members.leaveOrganization")}
												</DropdownMenuItem>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</>
						) : (
							<span data-test="team-member-role" className="text-sm text-muted-foreground">
								{memberRoles[row.original.role as keyof typeof memberRoles]}
							</span>
						)}
					</div>
				);
			},
		},
	];

	// Managers first, then agents, each by name; the platform admin's own row (inert, ADR 0015)
	// last. Presentation only: who can do what is unchanged.
	const members = useMemo(() => {
		const rank = (member: NonNullable<typeof organization>["members"][number]) => {
			if (member.userId === user?.id && isPlatformAdmin(user?.role)) return 2;
			return member.role === "member" ? 1 : 0;
		};
		const nameOf = (member: NonNullable<typeof organization>["members"][number]) =>
			member.user?.name || member.user?.email || "";
		return [...(organization?.members ?? [])].sort(
			(a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)),
		);
	}, [organization?.members, user?.id, user?.role]);

	const table = useTable({
		features: clientDataTableFeatures,
		data: members,
		columns,
		manualPagination: true,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		state: {
			sorting,
			columnFilters,
		},
	});

	return (
		// Rows split by hairlines on the card itself: no box inside the card (#295).
		<div>
			<Table>
				<TableBody>
					{table.getRowModel().rows?.length ? (
						table.getRowModel().rows.map((row) => (
							<TableRow key={row.id} data-test="team-member">
								{/* One cell: the person, then the role and actions, which wrap under them on a
								    phone instead of squeezing the name (#295). */}
								<TableCell>
									<div className="gap-x-3 gap-y-2 flex flex-wrap items-center justify-between">
										{row.getVisibleCells().map((cell, index) => (
											<div key={cell.id} className={index === 0 ? "min-w-48 flex-1" : "ml-auto"}>
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</div>
										))}
									</div>
								</TableCell>
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell>
								<div className="h-24 text-sm flex items-center justify-center text-muted-foreground">
									{t("organizations.settings.members.emptyMembers")}
								</div>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
