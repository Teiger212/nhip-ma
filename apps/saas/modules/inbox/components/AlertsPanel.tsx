"use client";

import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { BellRingIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
	type AlertsPanelState,
	alertsPanelState,
	type BrowserAlerts,
	browserAlerts,
	notNow,
	saidNotNow,
	thisDeviceQueryKey,
	turnOnAlerts,
	useThisDevice,
} from "../lib/this-device";

/**
 * The Inbox's alerts panel (ADR 0019 "Asking", #135), a panel on the canvas above the list
 * (The Canvas And Panel Rule). It never prompts on load: the browser asks only after "Turn on
 * alerts". It asks, gives an iPhone the Home Screen steps, says how to unblock a blocked browser,
 * or asks again when this sign-in's device is gone; it shows nothing while loading, once alerts
 * are on, or for 7 days after "Not now" on this device. Nothing on it is red.
 */
export function AlertsPanel() {
	const t = useTranslations("inbox.alertsPanel");
	const queryClient = useQueryClient();
	const status = useThisDevice();
	// Read after mount: the server can't know the browser, and a first render must match it.
	const [browser, setBrowser] = useState<BrowserAlerts | null>(null);
	const [dismissed, setDismissed] = useState(false);
	const [turningOn, setTurningOn] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		setBrowser(browserAlerts());
		setDismissed(saidNotNow());
	}, []);

	const state: AlertsPanelState = alertsPanelState({
		status: status.data,
		browser,
		notNowSaid: dismissed,
	});
	if (state === "nothing") return null;

	const publicKey = status.data?.publicKey;

	async function onTurnOn() {
		if (!publicKey) return;
		setTurningOn(true);
		setFailed(false);
		const outcome = await turnOnAlerts(publicKey);
		setTurningOn(false);
		setBrowser(browserAlerts());
		if (outcome === "on") {
			await queryClient.invalidateQueries({ queryKey: thisDeviceQueryKey });
		} else if (outcome === "failed") {
			setFailed(true);
		}
	}

	function onNotNow() {
		notNow();
		setDismissed(true);
	}

	const asks = state === "ask" || state === "gone";

	return (
		<section
			data-test="alerts-panel"
			aria-labelledby="alerts-panel-title"
			className="px-4 py-3 md:rounded-3xl md:border shrink-0 border-b bg-card"
		>
			<div className="gap-3 flex items-start">
				<BellRingIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
				<div className="min-w-0 flex-1">
					<h2 id="alerts-panel-title" className="font-medium text-sm text-foreground">
						{t(`${state}.title`)}
					</h2>
					{state === "iphone" ? (
						<ol className="mt-1 space-y-0.5 pl-4 text-xs list-decimal text-muted-foreground">
							<li>{t("iphone.share")}</li>
							<li>{t("iphone.add")}</li>
							<li>{t("iphone.open")}</li>
						</ol>
					) : (
						<p className="mt-0.5 text-xs text-pretty text-muted-foreground">{t(`${state}.body`)}</p>
					)}
					{failed ? (
						<p role="status" className="mt-1.5 text-xs text-foreground">
							{t("failed")}
						</p>
					) : null}
					<div className="mt-2.5 gap-2 flex flex-wrap items-center">
						{asks ? (
							<Button
								type="button"
								variant="primary"
								className="min-h-11 md:min-h-9"
								loading={turningOn}
								onClick={() => void onTurnOn()}
							>
								{t("turnOn")}
							</Button>
						) : null}
						<Button
							type="button"
							variant="ghost"
							className="min-h-11 md:min-h-9 text-muted-foreground"
							onClick={onNotNow}
						>
							{t("notNow")}
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
