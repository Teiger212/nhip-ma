import type { Conversation, GuestLanguage, Paperwork, Qualification } from "./types";

export type CribTranslate = (key: string, values?: Record<string, string>) => string;

export function formatConversationCrib(
	conversation: Pick<Conversation, "oneShot">,
	t: CribTranslate,
): string | null {
	if (!conversation.oneShot) {
		return null;
	}

	return formatCribNotes(
		{
			language: conversation.oneShot.language,
			qualification: conversation.oneShot.qualification,
			paperwork: conversation.oneShot.paperwork,
		},
		t,
	);
}

export function formatCribNotes(
	input: {
		language: GuestLanguage;
		qualification: Qualification;
		paperwork: Paperwork | null | undefined;
	},
	t: CribTranslate,
): string {
	const facts = cribFacts(input.qualification, t);
	const paperwork = input.paperwork?.mentioned ? ` ${t("paperworkFlag")}` : "";
	return t("crib.body", {
		language: t(`guestLanguage.${input.language}`),
		facts: facts.length > 0 ? facts.join(", ") : t("crib.emptyFacts"),
		paperwork,
	});
}

function cribFacts(qualification: Qualification, t: CribTranslate): string[] {
	const facts: string[] = [];
	if (qualification.nationality) {
		facts.push(t("crib.nationality", { value: qualification.nationality }));
	}
	if (qualification.inVietnamNow === true) {
		facts.push(t("crib.inVietnamNow"));
	}
	if (qualification.inVietnamNow === false) {
		facts.push(t("crib.notInVietnam"));
	}
	if (qualification.rentOrBuy === "rent") {
		facts.push(t("intent.rent"));
	}
	if (qualification.rentOrBuy === "buy") {
		facts.push(t("intent.buy"));
	}
	if (qualification.timeframe) {
		facts.push(qualification.timeframe);
	}
	if (qualification.areaOfInterest) {
		facts.push(qualification.areaOfInterest);
	}
	if (qualification.budgetBand) {
		facts.push(qualification.budgetBand);
	}
	if (qualification.bedsOrHousehold) {
		facts.push(qualification.bedsOrHousehold);
	}
	return facts;
}
