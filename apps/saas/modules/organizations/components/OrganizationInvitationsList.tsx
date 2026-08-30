"use client";

import { useSession } from "@auth/hooks/use-session";
import { fullOrganizationQueryKey, useFullOrganizationQuery } from "@organizations/lib/api";
import type { ActiveOrganization } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { checkPermission } from "@repo/permissions";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Table, TableBody, TableCell, TableRow } from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/toast";
import { clientDataTableFeatures } from "@shared/lib/table-features";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, useTable } from "@tanstack/react-table";
import { CheckIcon, ClockIcon, MailXIcon, MoreVerticalIcon, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";

import { OrganizationRoleSelect } from "./OrganizationRoleSelect";
export function OrganizationInvitationsList({ organizationId }: { organizationId: string }) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { user } = useSession();
	const formatter = useFormatter();
	const { data: organization } = useFullOrganizationQuery(organizationId);

	// Scoped to this organizationId — do not use active-org usePermissions().check here.
	const membershipRole = organization?.members.find((member) => member.userId === user?.id)?.role;
	const canManageOrganization = checkPermission(
		{
			user,
			membershipRole,
		},
		"organization.manage",
	);

	const invitations = useMemo(
		() =>
			organization?.invitations
				?.filter((invitation) => invitation.status === "pending")
				.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()),
		[organization?.invitations],
	);

	const revokeInvitation = async (invitationId: string) => {
		const cancelInvitation = async () => {
			const { error } = await authClient.organization.cancelInvitation({
				invitationId,
			});

			if (error) {
				throw error;
			}

			await queryClient.invalidateQueries({
				queryKey: fullOrganizationQueryKey(organizationId),
			});
		};

		await toast
			.promise(cancelInvitation(), {
				loading: {
					title: t(
						"organizations.settings.members.notifications.revokeInvitation.loading.description",
					),
				},
				success: {
					title: t(
						"organizations.settings.members.notifications.revokeInvitation.success.description",
					),
				},
				error: {
					title: t(
						"organizations.settings.members.notifications.revokeInvitation.error.description",
					),
				},
			})
			.catch(() => undefined);
	};

	const columns: ColumnDef<
		typeof clientDataTableFeatures,
		NonNullable<ActiveOrganization["invitations"]>[number]
	>[] = [
		{
			accessorKey: "email",
			accessorFn: (row) => row.email,
			cell: ({ row }) => {
				const InvitationStatusIcon = {
					pending: ClockIcon,
					accepted: CheckIcon,
					rejected: XIcon,
					canceled: XIcon,
				}[row.original.status];
				return (
					<div className="leading-normal">
						<strong
							className={cn("block", {
								"opacity-50": row.original.status === "canceled",
							})}
						>
							{row.original.email}
						</strong>
						<small className="gap-1 flex flex-wrap text-foreground/60">
							<span className="gap-0.5 flex items-center">
								<InvitationStatusIcon className="size-3" />
								{t(
									`organizations.settings.members.invitations.invitationStatus.${row.original.status}`,
								)}
							</span>
							<span>-</span>
							<span>
								{t("organizations.settings.members.invitations.expiresAt", {
									date: formatter.dateTime(new Date(row.original.expiresAt), {
										dateStyle: "medium",
										timeStyle: "short",
									}),
								})}
							</span>
						</small>
					</div>
				);
			},
		},
		{
			accessorKey: "actions",
			cell: ({ row }) => {
				const isPending = row.original.status === "pending";

				return (
					<div className="gap-2 flex flex-row justify-end">
						<OrganizationRoleSelect
							value={row.original.role}
							disabled
							onSelect={() => {
								return;
							}}
						/>

						{canManageOrganization && (
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
										disabled={!isPending}
										onClick={() => revokeInvitation(row.original.id)}
									>
										<MailXIcon className="mr-2 size-4" />
										{t("organizations.settings.members.invitations.revoke")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				);
			},
		},
	];

	const table = useTable({
		features: clientDataTableFeatures,
		data: invitations ?? [],
		columns,
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
								{t("organizations.settings.members.invitations.empty")}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
