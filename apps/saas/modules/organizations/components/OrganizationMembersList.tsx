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
import { UserAvatar } from "@shared/components/UserAvatar";
import { clientDataTableFeatures } from "@shared/lib/table-features";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { flexRender, useTable } from "@tanstack/react-table";
import { LogOutIcon, MoreVerticalIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OrganizationRoleSelect } from "./OrganizationRoleSelect";

export function OrganizationMembersList({ organizationId }: { organizationId: string }) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { user } = useSession();
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
			await authClient.organization.updateMemberRole({
				memberId,
				role,
				organizationId,
			});

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
			await authClient.organization.removeMember({
				memberIdOrEmail: memberId,
				organizationId,
			});

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
					<div className="gap-2 flex items-center">
						<UserAvatar
							name={row.original.user.name ?? row.original.user.email}
							avatarUrl={row.original.user?.image}
						/>
						<div>
							<strong className="block">{row.original.user.name}</strong>
							<small className="text-foreground/60">{row.original.user.email}</small>
						</div>
					</div>
				) : null,
		},
		{
			accessorKey: "actions",
			header: "",
			cell: ({ row }) => {
				return (
					<div className="gap-2 flex flex-row justify-end">
						{canManageOrganization ? (
							<>
								<OrganizationRoleSelect
									value={row.original.role}
									onSelect={async (value) => updateMemberRole(row.original.id, value)}
									disabled={!canManageOrganization || row.original.role === "owner"}
								/>
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
												className="text-destructive"
												onClick={async () => removeMember(row.original.id)}
											>
												<TrashIcon className="mr-2 size-4" />
												{t("organizations.settings.members.removeMember")}
											</DropdownMenuItem>
										)}
										{row.original.userId === user?.id && (
											<DropdownMenuItem
												className="text-destructive"
												onClick={async () => removeMember(row.original.id)}
											>
												<LogOutIcon className="mr-2 size-4" />
												{t("organizations.settings.members.leaveOrganization")}
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</>
						) : (
							<span className="font-medium text-sm text-foreground/60">
								{memberRoles[row.original.role as keyof typeof memberRoles]}
							</span>
						)}
					</div>
				);
			},
		},
	];

	const table = useTable({
		features: clientDataTableFeatures,
		data: organization?.members ?? [],
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
		<div className="rounded-2xl border">
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
								No results.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
