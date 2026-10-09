"use client";

import { Badge } from "@repo/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";

type Delivery = {
	id: string;
	pipe: "zalo" | "whatsapp";
	receivedAt: string;
	outcome: "refused" | "processed" | "failed";
	endpoints: string[];
	officeIds: string[];
	filed: number;
	dropped: number;
	errorKind: string | null;
};

const PIPE_NAMES = { whatsapp: "WhatsApp", zalo: "Zalo" } as const;

/**
 * The delivery log (ADR 0017): every incoming webhook, newest first, for "the guest says they
 * wrote, but nothing arrived". It holds no message text and no guest ids.
 */
export function WebhookDeliveries() {
	const t = useTranslations("admin.webhooks");
	const format = useFormatter();
	const query = useQuery({
		queryKey: ["admin", "webhook-deliveries"],
		queryFn: async () => {
			const res = await fetch("/api/pipes/deliveries");
			if (!res.ok) throw new Error(`deliveries ${res.status}`);
			return res.json() as Promise<{ deliveries: Delivery[]; offices: Record<string, string> }>;
		},
		refetchInterval: 15_000,
	});
	const deliveries = query.data?.deliveries ?? [];
	const offices = query.data?.offices ?? {};

	return (
		<Card data-test="webhook-deliveries">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
				<CardDescription>{t("description")}</CardDescription>
			</CardHeader>
			<CardContent>
				{query.isSuccess && deliveries.length === 0 ? (
					<p className="text-sm text-muted-foreground" data-test="webhook-deliveries-empty">
						{t("empty")}
					</p>
				) : (
					<ul className="divide-y">
						{deliveries.map((delivery) => (
							<li
								key={delivery.id}
								data-test="webhook-delivery"
								data-outcome={outcomeOf(delivery)}
								className="gap-x-3 gap-y-1 py-3 text-sm flex flex-wrap items-center"
							>
								<time className="text-muted-foreground tabular-nums" dateTime={delivery.receivedAt}>
									{format.dateTime(new Date(delivery.receivedAt), {
										dateStyle: "short",
										timeStyle: "medium",
									})}
								</time>
								<span className="font-medium">{PIPE_NAMES[delivery.pipe]}</span>
								<Badge
									status={
										outcomeOf(delivery) === "filed"
											? "success"
											: outcomeOf(delivery) === "dropped"
												? "neutral"
												: "error"
									}
									data-test="webhook-delivery-outcome"
								>
									{t(`outcome.${outcomeOf(delivery)}`, {
										offices: delivery.officeIds.map((id) => offices[id] ?? id).join(", "),
										filed: delivery.filed,
										dropped: delivery.dropped,
									})}
								</Badge>
								{delivery.endpoints.length > 0 && (
									<span className="text-muted-foreground">
										{t("endpoint", { endpoints: delivery.endpoints.join(", ") })}
									</span>
								)}
								{delivery.errorKind && (
									<span className="text-destructive">{delivery.errorKind}</span>
								)}
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

/** One word for what became of a delivery, as the list shows it. */
function outcomeOf(delivery: Delivery): "refused" | "failed" | "filed" | "dropped" | "empty" {
	if (delivery.outcome !== "processed") return delivery.outcome;
	if (delivery.filed > 0) return "filed";
	if (delivery.dropped > 0) return "dropped";
	return "empty";
}
