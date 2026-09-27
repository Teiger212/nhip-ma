"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

type Choice = "none" | "mock";

/**
 * The office's CRM (ADR 0003), set by the platform admin like the office itself (ADR 0010).
 * Closings and lost on Home come from it; API keys live in the deployment's env.
 */
export function CrmConnectionCard({ organizationId }: { organizationId: string }) {
	const t = useTranslations("admin.organizations.crm");
	const queryClient = useQueryClient();
	const current = useQuery(
		orpc.admin.organizations.crm.get.queryOptions({ input: { id: organizationId } }),
	);
	const save = useMutation(orpc.admin.organizations.crm.set.mutationOptions());

	const items: Array<{ value: Choice; label: string }> = [
		{ value: "none", label: t("none") },
		{ value: "mock", label: t("mock") },
	];
	const value: Choice | undefined = current.data ? (current.data.kind ?? "none") : undefined;

	async function choose(choice: Choice) {
		try {
			await save.mutateAsync({ id: organizationId, kind: choice === "none" ? null : choice });
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.organizations.crm.get.key({ input: { id: organizationId } }),
			});
			toast.add({ title: t("saved"), type: "success" });
		} catch {
			toast.add({ title: t("failed"), type: "error" });
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
			</CardHeader>
			<CardContent className="gap-2 flex flex-col">
				<Select
					value={value}
					items={items}
					onValueChange={(selected) => {
						if (selected === null || selected === value) return;
						void choose(selected as Choice);
					}}
					disabled={current.isPending || save.isPending}
				>
					<SelectTrigger className="max-w-sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{items.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-pretty text-muted-foreground">{t("hint")}</p>
			</CardContent>
		</Card>
	);
}
