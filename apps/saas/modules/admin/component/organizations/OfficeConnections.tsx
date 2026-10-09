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

import { OfficeCrm } from "./OfficeCrm";

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
		<Card data-test="office-connections" data-pipes-loaded={pipesQuery.isSuccess || undefined}>
			<CardHeader>
				<CardTitle>{t("title")}</CardTitle>
			</CardHeader>
			{/* Zalo, WhatsApp and the CRM as sections split by hairlines on the card (#295). */}
			<CardContent>
				<div className="*:py-4 *:first:pt-0 *:last:pb-0 grid grid-cols-1 divide-y">
					<div className="gap-2 grid grid-cols-1" data-test="connection-zalo">
						<div className="gap-3 flex items-start justify-between">
							<div className="min-w-0">
								<p className="font-medium">Zalo</p>
								{zalo.length === 0 && (
									<Badge status="neutral" data-test="connection-status">
										{t("status.none")}
									</Badge>
								)}
								{!pipesQuery.data?.configured.zalo && pipesQuery.isSuccess && (
									<p className="mt-1 text-sm text-muted-foreground">{t("zaloNotConfigured")}</p>
								)}
							</div>
							{pipesQuery.data?.configured.zalo && (
								<Button
									size="sm"
									variant={zalo.length === 0 ? "primary" : "outline"}
									data-test="connect-zalo"
									render={(props) => (
										<a {...props} href={connectHref}>
											{t("connectZalo")}
										</a>
									)}
								/>
							)}
						</div>
						{/* The office's OAs as hairline rows, not boxes inside the card (#295). */}
						{zalo.map((pipe) => (
							<div
								key={pipe.externalId}
								data-test="connection-zalo-oa"
								data-oa-id={pipe.externalId}
								className="gap-3 py-2 flex flex-wrap items-center justify-between border-t"
							>
								<div className="gap-2 min-w-0 flex flex-wrap items-center">
									<Badge
										status={
											pipe.credential === "connected"
												? "success"
												: pipe.credential === "disconnected"
													? "error"
													: "neutral"
										}
										data-test="connection-status"
									>
										{t(
											`status.${pipe.credential === "connected" ? "connected" : pipe.credential === "disconnected" ? "needsReconnect" : "none"}`,
										)}
									</Badge>
									<span className="text-sm">OA {pipe.externalId}</span>
									{pipe.disconnectedReason && (
										<span className="text-sm text-muted-foreground">
											· {pipe.disconnectedReason}
										</span>
									)}
								</div>
								<div className="gap-2 flex shrink-0">
									{pipe.credential !== "connected" && pipesQuery.data?.configured.zalo && (
										<Button
											size="sm"
											variant="primary"
											data-test="reconnect-zalo"
											render={(props) => (
												<a {...props} href={connectHref}>
													{t("reconnect")}
												</a>
											)}
										/>
									)}
									<Button
										size="sm"
										variant="outline"
										data-test="disconnect-zalo"
										loading={
											disconnect.isPending && disconnect.variables?.externalId === pipe.externalId
										}
										onClick={() =>
											confirm({
												title: t("confirmDisconnect.title"),
												message: t("confirmDisconnect.message", { oa: pipe.externalId }),
												destructive: true,
												onConfirm: async () => {
													await disconnect.mutateAsync(pipe);
												},
											})
										}
									>
										{t("disconnect")}
									</Button>
								</div>
							</div>
						))}
					</div>
					<div className="gap-3 flex items-start justify-between" data-test="connection-whatsapp">
						<div>
							<p className="font-medium">WhatsApp</p>
							{pipesQuery.isSuccess && (
								<>
									<Badge status="neutral" data-test="connection-status">
										{pipesQuery.data.configured.whatsapp ? t("status.onNhip") : t("status.none")}
									</Badge>
									<p className="mt-1 text-sm text-muted-foreground">
										{pipesQuery.data.configured.whatsapp
											? t("whatsappShared")
											: t("whatsappNotConfigured")}
									</p>
								</>
							)}
						</div>
					</div>
					<OfficeCrm officeId={officeId} />
				</div>
			</CardContent>
		</Card>
	);
}

function outcomeKey(outcome: string): "held" | "expired" | "refused" | "failed" {
	return outcome === "held" || outcome === "expired" || outcome === "refused" ? outcome : "failed";
}
