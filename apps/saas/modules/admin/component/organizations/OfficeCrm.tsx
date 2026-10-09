"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { CrmKind } from "@inbox/lib/types";
import { Button } from "@repo/ui/components/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
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
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
	/** A kind that takes a token, picked but not saved until its token is. */
	const [pending, setPending] = useState<CrmKind | null>(null);
	const tokenSchema = useMemo(
		() => z.object({ token: z.string().trim().min(1, t("tokenRequired")) }),
		[t],
	);
	const tokenForm = useForm({
		resolver: zodResolver(tokenSchema),
		defaultValues: { token: "" },
	});

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
			tokenForm.reset({ token: "" });
			toast.add({ title: t("saved"), type: "success" });
		},
		onError: () => toast.add({ title: t("failed"), type: "error" }),
	});

	const setting = crm.data;
	const shown: Kind = pending ?? setting?.kind ?? null;
	const takesToken = (kind: Kind) => kind !== null && (setting?.tokenKinds.includes(kind) ?? false);
	const items: { value: string; label: string; description?: string }[] = [
		{ value: NONE, label: t("none") },
		...(setting?.kinds ?? []).map((kind) => ({
			value: kind,
			label: t(kind),
			// The mock is for development and demos only (PRODUCT.md, Integrations).
			description: kind === "mock" ? t("mockHint") : undefined,
		})),
	];

	const choose = (value: string | null) => {
		tokenForm.clearErrors();
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

	/** Back to the office's saved CRM: the picked one was never saved. */
	const cancelPending = () => {
		setPending(null);
		tokenForm.reset({ token: "" });
	};

	// The field is checked on Save, so an empty one asks for the token and saves nothing.
	const saveToken = tokenForm.handleSubmit(({ token }) => {
		if (shown) save.mutate({ kind: shown, token });
	});

	return (
		<div className="gap-3 grid grid-cols-1" data-test="connection-crm">
			{/* Label over control on a phone, side by side from `sm`. */}
			<div className="gap-3 sm:flex-row sm:items-start sm:justify-between flex flex-col">
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
					<SelectTrigger
						className="sm:w-56 w-full shrink-0"
						aria-label={t("label")}
						data-test="crm-kind"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{items.map((item) => (
							<SelectItem key={item.value} value={item.value} description={item.description}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{takesToken(shown) && (
				<Form {...tokenForm}>
					<form className="gap-2 p-3 grid grid-cols-1 rounded-xl border" onSubmit={saveToken}>
						<FormField
							control={tokenForm.control}
							name="token"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("token")}</FormLabel>
									<div className="gap-2 flex items-center">
										<FormControl>
											<Input
												{...field}
												type="password"
												autoComplete="new-password"
												spellCheck={false}
												className="min-w-0 flex-1"
												data-test="crm-token"
											/>
										</FormControl>
										<Button
											type="submit"
											variant="primary"
											className="shrink-0"
											loading={save.isPending}
										>
											{t("save")}
										</Button>
									</div>
									<FormDescription>{t("tokenHint")}</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						{!tokenForm.formState.errors.token && !pending && setting?.tokenSet && (
							<p className="text-sm text-muted-foreground">{t("tokenSet")}</p>
						)}
						{/* A CRM picked here is not the office's until its token is saved: say so, and
						    offer the way back (#94). */}
						{pending ? (
							<div className="gap-3 flex flex-wrap items-center justify-between">
								<p className="text-sm text-muted-foreground" data-test="crm-pending">
									{t("pending")}
								</p>
								<Button
									type="button"
									variant="ghost"
									className="shrink-0"
									disabled={save.isPending}
									onClick={cancelPending}
								>
									{t("cancel")}
								</Button>
							</div>
						) : null}
					</form>
				</Form>
			)}
		</div>
	);
}
