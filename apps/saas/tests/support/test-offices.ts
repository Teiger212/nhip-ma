/**
 * Offices of a test's own, set up in one go (#278): the platform admin creates the office, then
 * its CRM, its pipes and its operators' joins run at once, since none waits on another (each
 * writes a row of its own: the office's CRM connection, the OA's or the number's pipe connection,
 * a membership). Every guest writes after this returns, so connecting the mock CRM, which drops
 * the office's links to leads, still comes before any lead.
 *
 * The office itself is deleted by the `admin` fixture; `cleanUp` closes the operators' browsers
 * and releases the OAs, all at once, even when the test failed.
 */
import type { Browser } from "@playwright/test";

import { connectMockCrm } from "./crm";
import type { Admin } from "./fixtures";
import type { Joined } from "./operators";
import { joinOffice } from "./operators";
import { connectWhatsAppNumber, connectZaloOa, releaseZaloOa } from "./pipes";

type Office = Awaited<ReturnType<Admin["createOffice"]>>;

/** One operator to join the office: an agent (the kit's `member`) or a manager (`admin`). */
export type OfficeJoin = { role: "member" | "admin"; tag: string };

export type OfficeSetup = {
	/** The office's CRM: the mock CRM, or none (a new office has none). */
	crm: "mock" | "none";
	/** A Zalo OA id of the test's own for the office to hold, released afterwards. */
	zaloOa?: string;
	/** A WhatsApp number (phone_number_id) of the test's own for the office to hold. */
	whatsAppNumber?: string;
	/** Who joins the office, in this order. */
	joins?: readonly OfficeJoin[];
};

/** The office, and its operators in the order `joins` named them. */
export type SetUpOffice = Office & { joined: Joined[] };

export function testOffices(admin: Admin, browser: Browser) {
	const operators: Joined[] = [];
	const oaIds: string[] = [];
	return {
		async create(label: string, setup: OfficeSetup): Promise<SetUpOffice> {
			const office = await admin.createOffice(label);
			// Held before it is claimed, so a failed claim is still released.
			if (setup.zaloOa) oaIds.push(setup.zaloOa);
			const [joined] = await Promise.all([
				Promise.all(
					(setup.joins ?? []).map(async ({ role, tag }) => {
						const operator = await joinOffice(admin, browser, office.id, role, tag);
						operators.push(operator);
						return operator;
					}),
				),
				setup.crm === "mock" ? connectMockCrm(office.id) : undefined,
				setup.zaloOa ? connectZaloOa(office.id, setup.zaloOa) : undefined,
				setup.whatsAppNumber ? connectWhatsAppNumber(office.id, setup.whatsAppNumber) : undefined,
			]);
			return { ...office, joined };
		},
		/** Closes every operator's browser and releases every OA; fails after all were tried. */
		async cleanUp(): Promise<void> {
			const results = await Promise.allSettled([
				...operators.map((operator) => operator.close()),
				...oaIds.map((oaId) => releaseZaloOa(oaId)),
			]);
			const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
			if (failed) throw failed.reason;
		},
	};
}
