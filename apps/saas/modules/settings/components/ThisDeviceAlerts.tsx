"use client";

import {
	type BrowserAlerts,
	browserAlerts,
	thisDeviceQueryKey,
	turnOnAlerts,
	useThisDevice,
} from "@inbox/lib/this-device";
import { Button } from "@repo/ui";
import { SettingsItem } from "@shared/components/SettingsItem";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Said = "sent" | "testFailed" | "turnOnFailed" | null;

/**
 * Settings → Notifications' "This device" row (ADR 0019, #135): whether alerts are on for this
 * sign-in (its devices, on the server), turning them on, and "Send test alert". A test alert
 * that finds no device on this sign-in (409) turns the row back to offering to turn alerts on.
 * Shown to an operator of an office; the platform admin, who is never alerted, gets nothing.
 */
export function ThisDeviceAlerts() {
	const t = useTranslations("settings.notificationsPage.thisDevice");
	const queryClient = useQueryClient();
	const status = useThisDevice();
	const [browser, setBrowser] = useState<BrowserAlerts | null>(null);
	const [busy, setBusy] = useState(false);
	const [said, setSaid] = useState<Said>(null);

	useEffect(() => {
		setBrowser(browserAlerts());
	}, []);

	// Nothing while loading, nor for the platform admin, whom the API refuses (never alerted).
	if (!status.data) return null;

	async function onTurnOn(publicKey: string) {
		setBusy(true);
		setSaid(null);
		const outcome = await turnOnAlerts(publicKey);
		setBrowser(browserAlerts());
		if (outcome === "on") await queryClient.invalidateQueries({ queryKey: thisDeviceQueryKey });
		else if (outcome === "failed") setSaid("turnOnFailed");
		setBusy(false);
	}

	async function onSendTest() {
		setBusy(true);
		setSaid(null);
		try {
			const res = await fetch("/api/alerts/devices/test", { method: "POST" });
			if (res.status === 409) {
				// No device on this sign-in after all: offer to turn alerts on instead.
				await queryClient.invalidateQueries({ queryKey: thisDeviceQueryKey });
			} else {
				setSaid(res.ok ? "sent" : "testFailed");
			}
		} catch {
			setSaid("testFailed");
		}
		setBusy(false);
	}

	const data = status.data;
	let body: React.ReactNode = null;
	if (data && browser) {
		if (!data.publicKey) {
			body = <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
		} else if (data.on) {
			body = (
				<>
					<p className="text-sm text-foreground">{t("on")}</p>
					<Button
						type="button"
						variant="outline"
						className="mt-3 min-h-11 md:min-h-9"
						loading={busy}
						onClick={() => void onSendTest()}
					>
						{t("sendTest")}
					</Button>
				</>
			);
		} else if (browser === "iphoneNotInstalled") {
			body = (
				<>
					<p className="text-sm text-foreground">{t("off")}</p>
					<ol className="mt-1 space-y-0.5 pl-4 text-xs list-decimal text-muted-foreground">
						<li>{t("iphoneShare")}</li>
						<li>{t("iphoneAdd")}</li>
						<li>{t("iphoneOpen")}</li>
					</ol>
				</>
			);
		} else if (browser === "denied") {
			body = (
				<>
					<p className="text-sm text-foreground">{t("off")}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">{t("blocked")}</p>
				</>
			);
		} else if (browser === "unsupported") {
			body = <p className="text-sm text-muted-foreground">{t("unsupported")}</p>;
		} else {
			const publicKey = data.publicKey;
			body = (
				<>
					<p className="text-sm text-foreground">{t("off")}</p>
					<Button
						type="button"
						variant="primary"
						className="mt-3 min-h-11 md:min-h-9"
						loading={busy}
						onClick={() => void onTurnOn(publicKey)}
					>
						{t("turnOn")}
					</Button>
				</>
			);
		}
	}

	return (
		<SettingsItem title={t("title")} description={t("description")}>
			<div data-test="this-device" aria-busy={!body}>
				{body}
				{said ? (
					<output className="mt-2 text-xs block text-muted-foreground">{t(said)}</output>
				) : null}
			</div>
		</SettingsItem>
	);
}
