"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

type Kind = "mock" | null;
const NONE = "none";

const crmKey = (officeId: string) => ["admin", "crm", officeId] as const;

/**
 * The office's CRM (ADR 0003, spec #59 Q6), in the Connections card next to Zalo and WhatsApp.
 * The platform admin chooses it; it saves at once. New guests then become leads in it.
 */
export function OfficeCrm({ officeId }: { officeId: string }) {
	const t = useTranslations("admin.connections.crm");
	const queryClient = useQueryClient();
	const crm = useQuery({
		queryKey: crmKey(officeId),
		queryFn: async (): Promise<{ kind: Kind }> => {
			const res = await fetch(`/api/crm/connection?officeId=${encodeURIComponent(officeId)}`);
			if (!res.ok) throw new Error(`crm ${res.status}`);
			return res.json() as Promise<{ kind: Kind }>;
		},
	});
	const save = useMutation({
		mutationFn: async (kind: Kind) => {
			const res = await fetch("/api/crm/connection", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ officeId, kind }),
			});
			if (!res.ok) throw new Error(`crm ${res.status}`);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: crmKey(officeId) });
			toast.add({ title: t("saved"), type: "success" });
		},
		onError: () => toast.add({ title: t("failed"), type: "error" }),
	});
	const items = [
		{ value: NONE, label: t("none") },
		{ value: "mock", label: t("mock") },
	];
	return (
		<div className="gap-3 flex items-start justify-between" data-test="connection-crm">
			<div className="min-w-0">
				<p className="font-medium">{t("label")}</p>
				<p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
			</div>
			<Select
				items={items}
				value={crm.data ? (crm.data.kind ?? NONE) : null}
				disabled={!crm.isSuccess || save.isPending}
				onValueChange={(value) => save.mutate(value === "mock" ? "mock" : null)}
			>
				<SelectTrigger className="w-56 shrink-0" aria-label={t("label")} data-test="crm-kind">
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
		</div>
	);
}
