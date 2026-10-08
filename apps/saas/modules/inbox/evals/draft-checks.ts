import { type ModelDraft, numbersIn, parseModelDraft, sentences } from "../lib/drafts/guardrails";
import { extractFromInbound } from "../lib/extract";
import { askedIn, missingQualifiers, type Qualifier } from "../lib/greeting";
import type { Message } from "../lib/types";

/**
 * The draft eval's local checks (#254, ADR 0024 "The rules a draft follows"): no model, so they
 * decide pass or fail on their own. A draft fails when it breaks the JSON shape, writes a number
 * the guest didn't, asks again a question the office asked and the guest hasn't answered,
 * introduces anyone, or runs past 4 sentences. Each runs on both texts, the reply in the guest's
 * language and the same reply in the office language: a pattern this file lacks for Japanese,
 * Korean or Russian is caught in the English or Vietnamese twin, as the post-check does.
 */

export type CheckId = "json" | "numbers" | "open-question" | "intro" | "length";

export const CHECK_LABELS: Record<CheckId, string> = {
	json: "JSON shape",
	numbers: "Only the guest's numbers",
	"open-question": "No repeated open question",
	intro: "No intro",
	length: "At most 4 sentences",
};

/** `pass` is null when the check didn't run: the answer wasn't the JSON shape. */
export type CheckVerdict = { id: CheckId; pass: boolean | null; detail: string | null };

/** The thread a draft answers: every message, oldest first. */
export type CheckThread = {
	messages: ReadonlyArray<Pick<Message, "direction" | "source" | "text">>;
	/** The offices' names: a draft that names one introduces it (rule 1). */
	officeNames: readonly string[];
};

/** ADR 0024, rule 6: 2 to 4 short sentences. */
export const MAX_SENTENCES = 4;

/** A sentence that asks: its stop is a question mark, maybe inside a closing quote or bracket. */
const QUESTION = /[?？]["'”’»)\]」]*$/u;

/**
 * What a question asks about, by topic. English and Vietnamese carry the check (every draft has
 * a twin in one of them); the Korean, Japanese and Russian words catch the plain cases.
 */
const TOPICS: Record<Qualifier, RegExp> = {
	rentOrBuy:
		/\brent(?:ing)? or (?:to )?buy|\bbuy(?:ing)? or (?:to )?rent|thuê hay mua|mua hay thuê|임대.{0,10}(?:구매|매매)|(?:구매|매매).{0,10}임대|賃貸.{0,10}購入|購入.{0,10}賃貸|снять.{0,15}купить|купить.{0,15}снять/iu,
	area: /\b(?:which|what)\s+(?:area|areas|neighbou?rhoods?|districts?|part of (?:town|the city|hanoi))\b|\bwhere (?:in hanoi )?(?:would|do) you (?:like|want|prefer) to (?:live|stay|be)\b|khu (?:vực )?nào|quận nào|어느 (?:지역|동네)|どの(?:エリア|地域|辺り)|как(?:ой|ие|ом) район/iu,
	budget: /\bbudget\b|\bprice range\b|ngân sách|tầm giá|예산|予算|бюджет/iu,
	timeframe:
		/\bmove[- ]?in\b|\bmoving (?:in|date)\b|\bwhen (?:would|do|are|will) you (?:like to |want to |plan(?:ning)? to |be )?(?:move|moving|start|arrive|arriving)\b|\b(?:lease|start) date\b|dọn (?:vào|đến|về|sang)|chuyển (?:vào|đến|về|sang)|입주|이사|入居|引っ越|заех|въех|переезж|засел/iu,
	household:
		/\bhow many (?:bedrooms|beds|rooms|people|of you)\b|\bwho (?:will|would) be (?:living|staying)\b|mấy phòng ngủ|bao nhiêu phòng|mấy người|bao nhiêu người|몇 (?:명|분)|침실.{0,6}몇|何人|何部屋|сколько (?:спален|комнат|человек)|кто будет жить/iu,
};

/** What a text's questions ask about: the auto-reply's own wording, or a topic in a question. */
export function asksAbout(text: string): Qualifier[] {
	const asked = new Set<Qualifier>(askedIn(text));
	for (const sentence of sentences(text.normalize("NFC"))) {
		if (!QUESTION.test(sentence)) continue;
		for (const [qualifier, topic] of Object.entries(TOPICS) as [Qualifier, RegExp][]) {
			if (topic.test(sentence)) asked.add(qualifier);
		}
	}
	return [...asked];
}

/**
 * The office's open questions (rule 5): what an office message asked, the auto-reply's or an
 * agent's, that the guest's messages still don't answer, as the one-shot reads them.
 */
export function openQualifiers(messages: CheckThread["messages"]): Qualifier[] {
	const guest = messages.filter((message) => message.direction === "in");
	const { qualification } = extractFromInbound(guest.map((message) => message.text).join("\n"));
	const asked = new Set(
		messages
			.filter((message) => message.direction === "out")
			.flatMap((message) => asksAbout(message.text)),
	);
	return missingQualifiers(qualification).filter((qualifier) => asked.has(qualifier));
}

/** A self-introduction, in the five languages: the model never introduces anyone (rule 1). */
const INTRO: RegExp[] = [
	/\bmy name is\b/iu,
	/\b(?:I'm|I am|this is)\s+\p{Lu}\p{L}*(?:\s+\p{Lu}\p{L}*)*\s*(?:,|\.|!|\bfrom\b|\bat\b|\bwith\b|\bof\b|\bhere\b)/u,
	/(?<!\p{L})(?:[Ee]m|[Tt]ôi|[Mm]ình)\s+là\s+\p{Lu}/u,
	/(?<!\p{L})tên (?:em|tôi|mình) là/iu,
	/(?<!\p{L})(?:em|tôi|mình) là (?:nhân viên|tư vấn viên|môi giới)/iu,
	/제 이름은|저는\s*\S+(?:입니다|이에요|예요|라고 합니다)/u,
	/と申します|私の名前は|(?:私|わたし)は\S{1,12}です/u,
	/меня зовут|(?:^|\s)(?:[Яя]|[Ээ]то)\s+\p{Lu}\p{Ll}+(?:\s*,|\s+из\b)/u,
];

function introIn(text: string, officeNames: readonly string[]): string | null {
	const lower = text.toLowerCase();
	const office = officeNames.find((name) => lower.includes(name.toLowerCase()));
	if (office) return `names the office "${office}"`;
	for (const pattern of INTRO) {
		const match = pattern.exec(text);
		if (match) return `"${match[0].trim()}"`;
	}
	return null;
}

/** The numbers in `text` the guest never wrote, as `text` writes them. */
export function strayNumbers(text: string, guestTexts: readonly string[]): string[] {
	const written = new Set(guestTexts.flatMap((guest) => numbersIn(guest.normalize("NFC")).flat()));
	const raw = text.normalize("NFKC").match(/\d+(?:[.,]\d+)*/gu) ?? [];
	return numbersIn(text.normalize("NFC")).flatMap((readings, index) =>
		readings.some((value) => written.has(value)) ? [] : [raw[index] ?? String(readings[0])],
	);
}

type Text = { name: "reply" | "office reply"; text: string };

/** One check over both texts: fails with the first text that breaks it. */
function verdict(
	id: CheckId,
	texts: Text[],
	finding: (text: string) => string | null,
): CheckVerdict {
	for (const { name, text } of texts) {
		const found = finding(text);
		if (found) return { id, pass: false, detail: `${name}: ${found}` };
	}
	return { id, pass: true, detail: null };
}

export type DraftCheck = {
	/** The model's answer read as JSON, or null when it isn't the shape. */
	draft: ModelDraft | null;
	verdicts: CheckVerdict[];
	/** Every check passed. */
	pass: boolean;
};

/** Runs every local check on the model's raw answer for `thread`. */
export function checkDraft(raw: string | null, thread: CheckThread): DraftCheck {
	const draft = parseModelDraft(raw);
	if (!draft) {
		const rest: CheckId[] = ["numbers", "open-question", "intro", "length"];
		return {
			draft: null,
			pass: false,
			verdicts: [
				{
					id: "json",
					pass: false,
					detail: raw ? 'not {"reply", "office_reply"}' : "no answer",
				},
				...rest.map((id) => ({ id, pass: null, detail: "not run" })),
			],
		};
	}
	const texts: Text[] = [
		{ name: "reply", text: draft.reply },
		{ name: "office reply", text: draft.officeReply },
	];
	const guestTexts = thread.messages
		.filter((message) => message.direction === "in")
		.map((message) => message.text);
	const open = openQualifiers(thread.messages);
	const verdicts: CheckVerdict[] = [
		{ id: "json", pass: true, detail: null },
		verdict("numbers", texts, (text) => {
			const stray = strayNumbers(text, guestTexts);
			return stray.length ? stray.join(", ") : null;
		}),
		verdict("open-question", texts, (text) => {
			const repeated = asksAbout(text).filter((qualifier) => open.includes(qualifier));
			return repeated.length ? `asks again: ${repeated.join(", ")}` : null;
		}),
		verdict("intro", texts, (text) => introIn(text, thread.officeNames)),
		verdict("length", texts, (text) => {
			const count = sentences(text.normalize("NFC")).length;
			return count > MAX_SENTENCES ? `${count} sentences` : null;
		}),
	];
	return { draft, verdicts, pass: verdicts.every((each) => each.pass === true) };
}
