"use client";

import type { CrmKind } from "@inbox/lib/types";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
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
import { type FormEvent, useId, useState } from "react";

type Kind = CrmKind | null;
/**
 * The server names the kinds (from `CrmKind`) and those that take an access token; a client
 * component never imports the store. Whether a token is set, never the token.
 */
type CrmSetting = { kind: Kind; tokenSet: boolean; kinds: CrmKind[]; tokenKinds: CrmKind[] };
type Choice = { kind: Kind; token?: string };
const NONE = "none";

const crmKey = (officeId: string) => ["admin", "crm", officeId] as const;

/**
 * The office's CRM (ADR 0003, spec #59 Q6), in the Connections card next to Zalo and WhatsApp.
 * The platform admin chooses it; it saves at once, except a CRM that takes an access token
 * (#65): that one is saved with its token, which is write-only. The field is always empty;
 * saving a new token replaces the one set.
 */
export function OfficeCrm({ officeId }: { officeId: string }) {
	const t = useTranslations("admin.connections.crm");
	const queryClient = useQueryClient();
	const tokenId = useId();
	const hintId = useId();
	const requiredId = useId();
	/** A kind that takes a token, picked but not saved until its token is. */
	const [pending, setPending] = useState<CrmKind | null>(null);
	const [token, setToken] = useState("");
	const [tokenMissing, setTokenMissing] = useState(false);

	const crm = useQuery({
		queryKey: crmKey(officeId),
		queryFn: async (): Promise<CrmSetting> => {
			const res = await fetch(`/api/crm/connection?officeId=${encodeURIComponent(officeId)}`);
			if (!res.ok) throw new Error(`crm ${res.status}`);
			return res.json() as Promise<CrmSetting>;
		},
	});
	const save = useMutation({
		mutationFn: async (choice: Choice) => {
			const res = await fetch("/api/crm/connection", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ officeId, ...choice }),
			});
			if (!res.ok) throw new Error(`crm ${res.status}`);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: crmKey(officeId) });
			setPending(null);
			setToken("");
			setTokenMissing(false);
			toast.add({ title: t("saved"), type: "success" });
		},
		onError: () => toast.add({ title: t("failed"), type: "error" }),
	});

	const setting = crm.data;
	const shown: Kind = pending ?? setting?.kind ?? null;
	const takesToken = (kind: Kind) => kind !== null && (setting?.tokenKinds.includes(kind) ?? false);
	const items = [
		{ value: NONE, label: t("none") },
		...(setting?.kinds ?? []).map((kind) => ({ value: kind, label: t(kind) })),
	];

	const choose = (value: string | null) => {
		setTokenMissing(false);
		if (value === NONE) {
			setPending(null);
			save.mutate({ kind: null });
			return;
		}
		// A choice is none or one of the kinds the server named; anything else is not one.
		const kind = setting?.kinds.find((known) => known === value);
		if (!kind) return;
		if (takesToken(kind)) {
			// Nothing is saved until the token is.
			setPending(kind === setting?.kind ? null : kind);
			return;
		}
		setPending(null);
		save.mutate({ kind });
	};

	const saveToken = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!shown) return;
		if (!token.trim()) {
			setTokenMissing(true);
			return;
		}
		save.mutate({ kind: shown, token });
	};

	return (
		<div className="gap-3 grid grid-cols-1" data-test="connection-crm">
			<div className="gap-3 flex items-start justify-between">
				<div className="min-w-0">
					<p className="font-medium">{t("label")}</p>
					<p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
				</div>
				<Select
					items={items}
					value={setting ? (shown ?? NONE) : null}
					disabled={!crm.isSuccess || save.isPending}
					onValueChange={choose}
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
			{takesToken(shown) && (
				<form className="gap-2 p-3 grid grid-cols-1 rounded-md border" onSubmit={saveToken}>
					<Label htmlFor={tokenId}>{t("token")}</Label>
					<div className="gap-2 flex items-center">
						<Input
							id={tokenId}
							type="password"
							autoComplete="new-password"
							spellCheck={false}
							className="min-w-0 flex-1"
							value={token}
							onChange={(event) => {
								setToken(event.target.value);
								setTokenMissing(false);
							}}
							aria-describedby={tokenMissing ? `${hintId} ${requiredId}` : hintId}
							aria-invalid={tokenMissing || undefined}
							data-test="crm-token"
						/>
						<Button type="submit" size="sm" className="shrink-0" loading={save.isPending}>
							{t("save")}
						</Button>
					</div>
					<p id={hintId} className="text-sm text-muted-foreground">
						{t("tokenHint")}
					</p>
					{tokenMissing ? (
						<p id={requiredId} className="text-sm text-destructive">
							{t("tokenRequired")}
						</p>
					) : (
						!pending &&
						setting?.tokenSet && <p className="text-sm text-muted-foreground">{t("tokenSet")}</p>
					)}
				</form>
			)}
		</div>
	);
}
