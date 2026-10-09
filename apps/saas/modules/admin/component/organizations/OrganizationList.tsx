"use client";

import { getAdminPath } from "@admin/lib/links";
import { OrganizationLogo } from "@organizations/components/OrganizationLogo";
import { organizationListQueryKey } from "@organizations/lib/api";
import { authClient } from "@repo/auth/client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { Pagination } from "@shared/components/Pagination";
import { orpc } from "@shared/lib/orpc-query-utils";
import { manualPaginationTableFeatures } from "@shared/lib/table-features";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, useTable } from "@tanstack/react-table";
import { EditIcon, MoreVerticalIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef } from "react";
import { withQuery } from "ufo";
import { useDebounceValue } from "usehooks-ts";

const ITEMS_PER_PAGE = 10;

export function OrganizationList() {
	const t = useTranslations();
	const { confirm } = useConfirmationAlert();
	const queryClient = useQueryClient();
	const [currentPage, setCurrentPage] = useQueryState("currentPage", parseAsInteger.withDefault(1));
	const [searchTerm, setSearchTerm] = useQueryState("query", parseAsString.withDefault(""));
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useDebounceValue(searchTerm, 300, {
		leading: true,
		trailing: false,
	});

	const previousSearchTermRef = useRef(debouncedSearchTerm);

	const getPathWithBackToParemeter = (path: string) => {
		const searchParams = new URLSearchParams(window.location.search);
		return withQuery(path, {
			backTo: `${window.location.pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`,
		});
	};

	const getOrganizationEditPath = (id: string) => {
		return getPathWithBackToParemeter(getAdminPath(`/organizations/${id}`));
	};

	useEffect(() => {
		setDebouncedSearchTerm(searchTerm);
	}, [searchTerm]); // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps

	const { data, isLoading } = useQuery(
		orpc.admin.organizations.list.queryOptions({
			input: {
				limit: ITEMS_PER_PAGE,
				offset: (currentPage - 1) * ITEMS_PER_PAGE,
				query: debouncedSearchTerm,
			},
		}),
	);

	useEffect(() => {
		if (
			previousSearchTermRef.current !== debouncedSearchTerm &&
			previousSearchTermRef.current !== undefined
		) {
			void setCurrentPage(1);
		}
		previousSearchTermRef.current = debouncedSearchTerm;
	}, [debouncedSearchTerm, setCurrentPage]);

	const deleteOrganization = async (id: string) => {
		const removeOrganization = async () => {
			const { error } = await authClient.organization.delete({
				organizationId: id,
			});

			if (error) {
				throw error;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: orpc.admin.organizations.list.key(),
				}),
				queryClient.invalidateQueries({
					queryKey: organizationListQueryKey,
				}),
			]);
		};

		await toast
			.promise(removeOrganization(), {
				loading: { title: t("admin.organizations.deleteOrganization.deleting") },
				success: { title: t("admin.organizations.deleteOrganization.deleted") },
				error: { title: t("admin.organizations.deleteOrganization.notDeleted") },
			})
			.catch(() => undefined);
	};

	const columns: ColumnDef<
		typeof manualPaginationTableFeatures,
		NonNullable<typeof data>["organizations"][number]
	>[] = useMemo(
		() => [
			{
				accessorKey: "user",
				header: "",
				accessorFn: (row) => row.name,
				cell: ({
					row: {
						original: { id, name, logo, membersCount },
					},
				}) => (
					<div className="gap-3 min-w-0 flex items-center">
						<OrganizationLogo name={name} logoUrl={logo} />
						<div className="min-w-0">
							<Link
								href={getOrganizationEditPath(id)}
								className="font-heading font-semibold text-sm tracking-tight block truncate hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
							>
								{name}
							</Link>
							<p className="text-xs text-muted-foreground tabular-nums">
								{t("admin.organizations.membersCount", {
									count: membersCount,
								})}
							</p>
						</div>
					</div>
				),
			},
			{
				accessorKey: "actions",
				header: "",
				cell: ({
					row: {
						original: { id },
					},
				}) => {
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
										nativeButton={false}
										render={(props) => (
											<Link {...props} href={getOrganizationEditPath(id)}>
												<EditIcon className="mr-2 size-4" />
												{t("admin.organizations.edit")}
											</Link>
										)}
									/>
									<DropdownMenuItem
										variant="destructive"
										onClick={() =>
											confirm({
												title: t("admin.organizations.confirmDelete.title"),
												message: t("admin.organizations.confirmDelete.message"),
												confirmLabel: t("admin.organizations.confirmDelete.confirm"),
												destructive: true,
												onConfirm: () => deleteOrganization(id),
											})
										}
									>
										<TrashIcon className="mr-2 size-4" />
										{t("admin.organizations.delete")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				},
			},
		],
		[], // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps
	);

	const organizations = useMemo(() => data?.organizations ?? [], [data?.organizations]);

	const table = useTable({
		features: manualPaginationTableFeatures,
		data: organizations,
		columns,
		manualPagination: true,
	});

	return (
		<Card>
			<CardHeader className="gap-4 space-y-0 flex-row items-center justify-between">
				<CardTitle>{t("admin.organizations.title")}</CardTitle>
				<Button
					variant="primary"
					render={(props) => (
						<Link {...props} href={getAdminPath("/organizations/new")}>
							<PlusIcon className="size-4" />
							{t("admin.organizations.create")}
						</Link>
					)}
				/>
			</CardHeader>
			<CardContent>
				<Input
					data-test="admin-organizations-search"
					type="search"
					aria-label={t("admin.organizations.search")}
					placeholder={t("admin.organizations.search")}
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className="mb-2"
				/>

				{/* Rows split by hairlines on the card itself: no box inside the card (#295). */}
				<Table>
					<TableBody>
						{isLoading ? (
							Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
								<TableRow key={`skeleton-${index}`}>
									<TableCell>
										<div className="gap-3 flex items-center">
											<Skeleton className="size-8 rounded-md" />
											<div className="space-y-2 flex-1">
												<Skeleton className="h-4 w-32" />
												<Skeleton className="h-3 w-24" />
											</div>
										</div>
									</TableCell>
									<TableCell>
										<div className="flex justify-end">
											<Skeleton className="size-8 rounded-full" />
										</div>
									</TableCell>
								</TableRow>
							))
						) : table.getRowModel().rows?.length ? (
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
									<p data-test="admin-no-results" className="text-muted-foreground">
										{t("admin.organizations.empty")}
									</p>
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
	);
}
