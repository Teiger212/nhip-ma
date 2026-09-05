import type { GuestLanguage, Paperwork, Qualification } from "./types";

export type CribTranslate = (key: string, values?: Record<string, string>) => string;

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
	return t("body", {
		language: t(`guestLanguage.${input.language}`),
		facts: facts.length > 0 ? facts.join(", ") : t("emptyFacts"),
		paperwork,
	});
}

function cribFacts(qualification: Qualification, t: CribTranslate): string[] {
	const facts: string[] = [];
	if (qualification.nationality) {
		facts.push(t("nationality", { value: qualification.nationality }));
	}
	if (qualification.inVietnamNow === true) {
		facts.push(t("inVietnamNow"));
	}
	if (qualification.inVietnamNow === false) {
		facts.push(t("notInVietnam"));
	}
	if (qualification.rentOrBuy === "rent") {
		facts.push(t("rent"));
	}
	if (qualification.rentOrBuy === "buy") {
		facts.push(t("buy"));
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
