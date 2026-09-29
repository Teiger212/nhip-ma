"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { toast } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

type OfficePipe = {
	pipe: "zalo" | "whatsapp";
	externalId: string;
	credential: "none" | "connected" | "disconnected";
	disconnectedReason: string | null;
};
type PipesResponse = { configured: { zalo: boolean; whatsapp: boolean }; pipes: OfficePipe[] };

const pipesKey = (officeId: string) => ["admin", "pipes", officeId] as const;

/**
 * An office's pipe connections (ADR 0017). The platform admin connects the Zalo OA with the
 * OA owner present (Zalo's consent page), reconnects it when it breaks, or disconnects it.
 * WhatsApp still runs on the deployment's own number, so it is shown, not connected here.
 */
export function OfficeConnections({ officeId }: { officeId: string }) {
	const t = useTranslations("admin.connections");
	const { confirm } = useConfirmationAlert();
	const queryClient = useQueryClient();
	const outcome = useSearchParams().get("zalo");

	const pipesQuery = useQuery({
		queryKey: pipesKey(officeId),
		queryFn: async (): Promise<PipesResponse> => {
			const res = await fetch(`/api/pipes?officeId=${encodeURIComponent(officeId)}`);
			if (!res.ok) throw new Error(`pipes ${res.status}`);
			return res.json() as Promise<PipesResponse>;
		},
	});

	const disconnect = useMutation({
		mutationFn: async (pipe: OfficePipe) => {
			const res = await fetch("/api/pipes/disconnect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ officeId, pipe: pipe.pipe, externalId: pipe.externalId }),
			});
			if (!res.ok) throw new Error(`disconnect ${res.status}`);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: pipesKey(officeId) }),
		onError: () => toast.add({ title: t("disconnectFailed"), type: "error" }),
	});

	useEffect(() => {
		if (outcome === "connected") toast.add({ title: t("outcome.connected"), type: "success" });
		else if (outcome) toast.add({ title: t(`outcome.${outcomeKey(outcome)}`), type: "error" });
	}, [outcome, t]);

	const zalo = pipesQuery.data?.pipes.filter((pipe) => pipe.pipe === "zalo") ?? [];
	const connectHref = `/api/pipes/zalo/connect?officeId=${encodeURIComponent(officeId)}`;

	return (
		<Card data-test="office-connections">
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 grid grid-cols-1">
				<div className="gap-3 flex items-start justify-between" data-test="connection-zalo">
					<div className="min-w-0">
						<p className="font-medium">Zalo</p>
						{zalo.length === 0 ? (
							<Badge status="info" data-test="connection-status">
								{t("status.none")}
							</Badge>
						) : (
							zalo.map((pipe) => (
								<div key={pipe.externalId} className="gap-2 mt-1 flex flex-wrap items-center">
									<Badge
										status={pipe.credential === "disconnected" ? "error" : "success"}
										data-test="connection-status"
									>
										{t(
											`status.${pipe.credential === "disconnected" ? "needsReconnect" : pipe.credential === "connected" ? "connected" : "none"}`,
										)}
									</Badge>
									<span className="text-sm text-muted-foreground">OA {pipe.externalId}</span>
									{pipe.disconnectedReason && (
										<span className="text-sm text-muted-foreground">
											· {pipe.disconnectedReason}
										</span>
									)}
								</div>
							))
						)}
						{!pipesQuery.data?.configured.zalo && pipesQuery.isSuccess && (
							<p className="mt-1 text-sm text-muted-foreground">{t("zaloNotConfigured")}</p>
						)}
					</div>
					<div className="gap-2 flex shrink-0">
						{pipesQuery.data?.configured.zalo &&
							(zalo.length === 0 || zalo.some((pipe) => pipe.credential !== "connected")) && (
								<Button
									size="sm"
									data-test="connect-zalo"
									render={(props) => (
										<a {...props} href={connectHref}>
											{zalo.length === 0 ? t("connectZalo") : t("reconnect")}
										</a>
									)}
								/>
							)}
						{zalo.map((pipe) => (
							<Button
								key={pipe.externalId}
								size="sm"
								variant="outline"
								data-test="disconnect-zalo"
								loading={disconnect.isPending}
								onClick={() =>
									confirm({
										title: t("confirmDisconnect.title"),
										message: t("confirmDisconnect.message"),
										destructive: true,
										onConfirm: async () => {
											await disconnect.mutateAsync(pipe);
										},
									})
								}
							>
								{t("disconnect")}
							</Button>
						))}
					</div>
				</div>
				<div className="gap-3 flex items-start justify-between" data-test="connection-whatsapp">
					<div>
						<p className="font-medium">WhatsApp</p>
						<Badge status="info" data-test="connection-status">
							{t("status.none")}
						</Badge>
						<p className="mt-1 text-sm text-muted-foreground">{t("whatsappLater")}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function outcomeKey(outcome: string): "held" | "expired" | "refused" | "failed" {
	return outcome === "held" || outcome === "expired" || outcome === "refused" ? outcome : "failed";
}
