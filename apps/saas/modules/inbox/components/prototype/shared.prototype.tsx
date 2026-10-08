"use client";

/**
 * PROTOTYPE (throwaway, branch prototype/thread-layout): the data helpers the layout variants
 * share. Layout is never shared: each variant owns its own structure.
 */
import { useSession } from "@auth/hooks/use-session";
import { useActiveOrganization } from "@organizations/hooks/use-active-organization";
import { toast } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { arrangeExtractRows, type ExtractFieldId } from "../../lib/extract-rows";
import type { Conversation, Message } from "../../lib/types";
import { useOperatorLanguage } from "../ThreadParts";
import {
	missingFieldIds,
	normaliseFact,
	type StubTranslation,
	stubTranslate,
} from "./stubs.prototype";
import { suggestReply } from "./suggest-reply.prototype";

export type ProtoFactRow = {
	id: ExtractFieldId;
	label: string;
	/** In the operator's language, normalised. */
	value: string;
	/** The span the guest wrote, for fields taken from their words; null for derived ones. */
	raw: string | null;
	/** The raw span is in another script/language and differs from `value`: worth showing. */
	foreign: boolean;
};

function derived(id: ExtractFieldId, label: string, value: string): ProtoFactRow {
	return { id, label, value, raw: null, foreign: false };
}

const NON_ASCII = /[^ -~]/;

export function useProtoThread(conversation: Conversation) {
	const t = useTranslations("inbox");
	const operator = useOperatorLanguage();
	const guestLanguage = conversation.oneShot?.language ?? null;
	return useMemo(() => {
		const facts: ProtoFactRow[] = arrangeExtractRows(conversation.oneShot)
			.visible.filter((row) => row.present)
			.map((row) => {
				const label = t(`fields.${row.id}`);
				switch (row.id) {
					case "language":
						return derived(row.id, label, t(`guestLanguage.${String(row.value)}`));
					case "rentOrBuy":
						return derived(row.id, label, t(`intent.${String(row.value)}`));
					case "inVietnamNow":
						return derived(row.id, label, row.value ? t("yes") : t("no"));
					case "paperwork":
						return derived(row.id, label, t("paperworkFlag"));
					default: {
						const raw = String(row.value);
						const { value } = normaliseFact(row.id, raw, operator);
						return { id: row.id, label, value, raw, foreign: value !== raw && NON_ASCII.test(raw) };
					}
				}
			});
		const missing = missingFieldIds(conversation).map((id) => ({ id, label: t(`fields.${id}`) }));
		return {
			operator,
			guestLanguage,
			guestLanguageName: guestLanguage ? t(`guestLanguage.${guestLanguage}`) : null,
			operatorLanguageName: t(`guestLanguage.${operator}`),
			facts,
			missing,
			/** A guest message's stored translation, or the stub for an office message. */
			messageTr: (message: Message) =>
				message.direction === "in"
					? message.translations?.[operator]
						? { text: message.translations[operator] as string, stub: false }
						: null
					: stubTranslate(message.text, operator, guestLanguage),
			tr: (text: string) => stubTranslate(text, operator, guestLanguage),
		};
	}, [conversation, operator, guestLanguage, t]);
}

/**
 * The reply box's text in the variants: the no-model suggestion in the agent's own voice
 * (suggest-reply.prototype.ts) instead of the server's follow-up template, edited locally only.
 * Its line under the box is the same suggestion composed in the operator's language; once the
 * operator edits, it falls back to the stub table.
 */
export function useStubReply(conversation: Conversation, serverReply: string) {
	const operator = useOperatorLanguage();
	const { user } = useSession();
	const { activeOrganization } = useActiveOrganization();
	const firstName = user?.name?.trim().split(/\s+/)[0] || "your agent";
	const office = activeOrganization?.name || "the office";
	const guestLanguage = conversation.oneShot?.language ?? null;
	const suggestion = useMemo(() => {
		if (!guestLanguage) return null;
		const who = { firstName, office };
		const text = suggestReply(conversation, guestLanguage, who);
		if (!text) return null;
		return {
			text,
			tr: guestLanguage === operator ? null : suggestReply(conversation, operator, who),
		};
	}, [conversation, guestLanguage, operator, firstName, office]);
	const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
	const initial = suggestion?.text ?? serverReply;
	const value = edit?.id === conversation.id ? edit.text : initial;
	const edited = value !== initial;
	const translation: StubTranslation =
		!edited && suggestion
			? suggestion.tr
				? { text: suggestion.tr, stub: false }
				: null
			: stubTranslate(value, operator, guestLanguage);
	return {
		value,
		onChange: (text: string) => setEdit({ id: conversation.id, text }),
		translation,
		edited,
		/** Honest about who wrote it: no model, a template filled from the extracted details. */
		sourceLabel: "Suggested reply · template",
	};
}

/** Who a message came from, as a person reads it, plus who wrote an auto-reply. */
export function useMessageSource() {
	const t = useTranslations("inbox");
	return (message: Message): { label: string; writer: string | null } => {
		const key = {
			guest: "guest",
			nhip: "nhip",
			"oa-echo": "oaEcho",
			"auto-reply": "autoReply",
		}[message.source] as "guest" | "nhip" | "oaEcho" | "autoReply";
		return {
			label: t(`source.${key}`),
			writer: message.writtenBy ? t(`autoReply.${message.writtenBy}`) : null,
		};
	};
}

/** Keep a chat-like column scrolled to its newest message when a thread opens. */
export function useScrollToEnd(key: string) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [key]);
	return ref;
}

/** Every mutation in a prototype variant lands here instead: the prototype is read-only. */
export function prototypeOnly(what: string) {
	toast.add({ title: `Prototype: ${what} is not wired here`, type: "info" });
}

/** "move-in, budget and nationality" from the missing labels. */
export function listPhrase(labels: string[]): string {
	const lower = labels.map((l) =>
		l === l.toUpperCase() ? l : l.charAt(0).toLowerCase() + l.slice(1),
	);
	if (lower.length <= 1) return lower.join("");
	return `${lower.slice(0, -1).join(", ")} and ${lower.at(-1)}`;
}
