import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

import { toE164 } from "./phone";
import {
	type CrmAdapter,
	CrmError,
	type CrmFailureKind,
	type CrmLead,
	type GuestIdentity,
	type LeadOutcome,
	type NewGuestLead,
} from "./types";

/**
 * The HubSpot CRM (ADR 0003, #65). A Nhịp lead is a HubSpot deal; the guest is the deal's
 * contact, found by phone or by the Zalo user id Nhịp stores on it. The contract is replayed
 * from real exchanges in `hubspot.test.ts` (recorded by `scripts/record-hubspot.ts`).
 */

const API = "https://api.hubapi.com";

/** How long one HubSpot call may take, its answer read included, before it counts as failed. */
const REQUEST_TIMEOUT_MS = 15_000;
/** HubSpot's date-versioned API; `2026-09` is supported until about March 2028. */
const VERSION = "2026-09";
const CONTACTS = `/crm/objects/${VERSION}/contacts`;
const DEALS = `/crm/objects/${VERSION}/deals`;
const PIPELINES = `/crm/pipelines/${VERSION}/deals`;
const CONTACT_PROPERTIES = `/crm/properties/${VERSION}/contacts`;
const ACCOUNT_DETAILS = `/account-info/${VERSION}/details`;

/** The contact property Nhịp creates for the Zalo user id: unique, so one Zalo guest is one contact. */
const ZALO_ID_PROPERTY = "zalo_user_id";
const ZALO_ID_PROPERTY_DEFINITION = {
	name: ZALO_ID_PROPERTY,
	label: "Zalo user ID",
	description: "The guest's Zalo user id, written by Nhịp so a returning Zalo guest is recognised.",
	groupName: "contactinformation",
	type: "string",
	fieldType: "text",
	hasUniqueValue: true,
};
/** HubSpot-defined association: deal to contact. */
const DEAL_TO_CONTACT = 3;
/** HubSpot's caps: filter groups in one search, and ids in one batch read. */
const MAX_FILTER_GROUPS = 5;
const MAX_BATCH_READ = 100;
/** Longest Retry-After waited out; beyond it the guest's next message retries the write. */
const MAX_RETRY_AFTER_S = 10;

/** How the deal's description names the guest's pipe, and the extracted fields it lists. */
const PIPE_LABELS = { zalo: "Zalo", whatsapp: "WhatsApp" };
const DESCRIPTION_FIELDS = [
	["areaOfInterest", "Area"],
	["rentOrBuy", "Rent or buy"],
	["budgetBand", "Budget"],
	["timeframe", "Timeframe"],
	["bedsOrHousehold", "Household"],
] as const;

/* The parts of HubSpot's answers the adapter reads; anything else in them is dropped. */
const Properties = z.record(z.string(), z.string().nullable());
type Properties = z.infer<typeof Properties>;
const HubSpotObject = z.object({ id: z.string(), properties: Properties });
const Results = z.object({ results: z.array(HubSpotObject) });
const AccountDetails = z.object({ portalId: z.number() });
const Pipelines = z.object({
	results: z.array(
		z.object({
			id: z.string(),
			displayOrder: z.number(),
			stages: z.array(
				z.object({
					id: z.string(),
					displayOrder: z.number(),
					metadata: z.object({ isClosed: z.string().optional() }),
				}),
			),
		}),
	),
});
/** A refusal's category, and the properties a refused write names as missing; never its message. */
const Refusal = z.object({
	category: z.string().nullish().catch(null),
	errors: z
		.array(
			z.object({
				code: z.string().optional(),
				context: z.object({ propertyName: z.array(z.string()).optional() }).optional(),
			}),
		)
		.nullish()
		.catch(null),
});

/**
 * A non-2xx answer (spec #59 story 43): which operation failed, the status and HubSpot's
 * category. Never HubSpot's message, which can echo property values, nor the token.
 */
class HubSpotError extends CrmError {
	constructor(
		readonly operation: string,
		readonly status: number,
		readonly category: string | null,
		/** Properties HubSpot says do not exist, from a refused write. */
		readonly missingProperties: string[],
	) {
		super(
			`HubSpot ${operation} answered ${status}${category ? ` ${category}` : ""}`,
			failureKindOf(status),
		);
		this.name = "HubSpotError";
	}
}

/** A refusal's kind (#211): the token, a timeout, the data refused, or HubSpot itself failing. */
function failureKindOf(status: number): CrmFailureKind {
	if (status === 401 || status === 403) return "auth";
	if (status === 408) return "timeout";
	if (status >= 400 && status < 500 && status !== 429) return "rejected";
	return "other";
}

export function hubspotCrmAdapter(deps: { token: string; fetch?: typeof fetch }): CrmAdapter {
	const send = deps.fetch ?? fetch;

	/** One call to HubSpot, its answer read through `schema`; `operation` names it in an error. */
	async function request<T>(
		operation: string,
		schema: z.ZodType<T>,
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			const response = await send(`${API}${path}`, {
				method,
				headers: { authorization: `Bearer ${deps.token}`, "content-type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
				// A hung call would hold the thread's claim on writing its lead (#211); one that
				// gives up is a `timeout`, retried when the thread is next opened.
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			const wait = response.status === 429 && attempt === 0 ? retryDelay(response) : null;
			if (wait !== null) {
				await new Promise((resolve) => setTimeout(resolve, wait));
				continue;
			}
			const parsed = parse(await response.text());
			if (response.ok) {
				const read = schema.safeParse(parsed);
				if (!read.success) {
					throw new Error(
						`HubSpot ${operation} answered ${response.status} in an unexpected shape`,
					);
				}
				return read.data;
			}
			const refusal = Refusal.safeParse(parsed);
			const { category, errors } = refusal.success ? refusal.data : {};
			throw new HubSpotError(
				operation,
				response.status,
				category ?? null,
				(errors ?? [])
					.filter((error) => error.code === "PROPERTY_DOESNT_EXIST")
					.flatMap((error) => error.context?.propertyName ?? []),
			);
		}
	}

	/**
	 * Runs a call that names the Zalo property; when HubSpot refuses it because the property does
	 * not exist yet, creates the property and runs it once more. The normal path makes no extra call.
	 */
	async function withZaloProperty<T>(
		run: () => Promise<T>,
		isMissing: (error: HubSpotError) => boolean,
	): Promise<T> {
		try {
			return await run();
		} catch (error) {
			if (!(error instanceof HubSpotError) || !isMissing(error)) throw error;
			if (!(await createZaloProperty())) throw error;
			return run();
		}
	}

	/** True when HubSpot created the property; false when it already existed. */
	async function createZaloProperty(): Promise<boolean> {
		try {
			await request(
				"create the Zalo id property",
				z.unknown(),
				"POST",
				CONTACT_PROPERTIES,
				ZALO_ID_PROPERTY_DEFINITION,
			);
			return true;
		} catch (error) {
			if (error instanceof HubSpotError && error.status === 409) return false;
			throw error;
		}
	}

	/**
	 * The ids of the guest's contacts. HubSpot matches a phone on its national digits only, so
	 * each contact's own numbers are read back as E.164 and compared: never a guess.
	 */
	async function findContacts(identity: GuestIdentity): Promise<string[]> {
		const national = identity.phone
			? parsePhoneNumberFromString(identity.phone)?.nationalNumber
			: undefined;
		const filterGroups = [
			...(national
				? ["hs_searchable_calculated_phone_number", "hs_searchable_calculated_mobile_number"].map(
						(propertyName) => ({ filters: [{ propertyName, operator: "EQ", value: national }] }),
					)
				: []),
			...(identity.zaloUserId
				? [
						{
							filters: [
								{ propertyName: ZALO_ID_PROPERTY, operator: "EQ", value: identity.zaloUserId },
							],
						},
					]
				: []),
		];
		if (filterGroups.length === 0) return [];
		const search = {
			filterGroups,
			properties: ["phone", "mobilephone", ...(identity.zaloUserId ? [ZALO_ID_PROPERTY] : [])],
			limit: 100,
		};
		// A search on a property that does not exist is a bare 400, with no category.
		const found = await withZaloProperty(
			() => request("search contacts", Results, "POST", `${CONTACTS}/search`, search),
			(error) => Boolean(identity.zaloUserId) && error.status === 400 && !error.category,
		);
		return found.results
			.filter(({ properties }) => isGuest(properties, identity))
			.map((contact) => contact.id);
	}

	/** The open deals of these contacts, by HubSpot's own closed flag. */
	async function openDeals(contactIds: string[]): Promise<CrmLead[]> {
		const leads = new Map<string, CrmLead>();
		for (const ids of chunks(contactIds, MAX_FILTER_GROUPS)) {
			const found = await request("search deals", Results, "POST", `${DEALS}/search`, {
				filterGroups: ids.map((id) => ({
					filters: [
						{ propertyName: "associations.contact", operator: "EQ", value: id },
						{ propertyName: "hs_is_closed", operator: "EQ", value: "false" },
					],
				})),
				properties: ["dealname"],
				limit: 100,
			});
			for (const deal of found.results) {
				leads.set(deal.id, { id: deal.id, name: deal.properties.dealname ?? "" });
			}
		}
		return [...leads.values()];
	}

	/** Where a new deal starts: the first open stage of the office's first pipeline. */
	async function startingStage(): Promise<{ pipeline: string; dealstage: string }> {
		const { results } = await request("read deal pipelines", Pipelines, "GET", PIPELINES);
		const pipeline = [...results].sort((a, b) => a.displayOrder - b.displayOrder)[0];
		const stage = [...(pipeline?.stages ?? [])]
			.sort((a, b) => a.displayOrder - b.displayOrder)
			.find((candidate) => candidate.metadata.isClosed !== "true");
		if (!pipeline || !stage) throw new Error("HubSpot has no deal pipeline with an open stage");
		return { pipeline: pipeline.id, dealstage: stage.id };
	}

	async function createContact(guest: NewGuestLead): Promise<string> {
		const properties = {
			firstname: guest.name,
			...(guest.phone ? { phone: guest.phone } : {}),
			...(guest.zaloUserId ? { [ZALO_ID_PROPERTY]: guest.zaloUserId } : {}),
		};
		const contact = await withZaloProperty(
			() => request("create contact", HubSpotObject, "POST", CONTACTS, { properties }),
			(error) => error.missingProperties.includes(ZALO_ID_PROPERTY),
		);
		return contact.id;
	}

	return {
		async findLeads(identity) {
			const contactIds = await findContacts(identity);
			return contactIds.length === 0 ? [] : openDeals(contactIds);
		},

		/**
		 * Called when the guest has no open deal: a new deal, unassigned (no owner is sent), on the
		 * guest's contact, or on a new contact when HubSpot has none.
		 */
		async createLead(guest) {
			const contactIds = await findContacts(guest);
			// Deferred (#65): several contacts for one guest, none with an open deal. Nhịp does not
			// pick one nor add another copy of the person; a manager links the thread by hand.
			if (contactIds.length > 1) {
				throw new Error(
					`HubSpot has ${contactIds.length} contacts for this guest and none has an open deal; no deal was created`,
				);
			}
			const { pipeline, dealstage } = await startingStage();
			const contactId = contactIds[0] ?? (await createContact(guest));
			const deal = await request("create deal", HubSpotObject, "POST", DEALS, {
				properties: { dealname: guest.name, pipeline, dealstage, description: description(guest) },
				associations: [
					{
						to: { id: contactId },
						types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }],
					},
				],
			});
			return { id: deal.id, name: deal.properties.dealname ?? guest.name };
		},

		async outcomesFor(leadIds) {
			const outcomes: Record<string, LeadOutcome> = {};
			for (const ids of chunks(leadIds, MAX_BATCH_READ)) {
				// A 207 lists the deals HubSpot does not know under `errors`; they stay absent.
				const read = await request("read deals", Results, "POST", `${DEALS}/batch/read`, {
					inputs: ids.map((id) => ({ id })),
					properties: ["hs_is_closed", "hs_is_closed_won", "closedate", "closed_lost_reason"],
				});
				for (const deal of read.results) outcomes[deal.id] = outcome(deal.properties);
			}
			return outcomes;
		},

		/** The portal the token was installed on, which HubSpot's webhooks name (#66). */
		async accountId() {
			const details = await request("read account details", AccountDetails, "GET", ACCOUNT_DETAILS);
			return String(details.portalId);
		},
	};
}

/** A deal's outcome from HubSpot's calculated flags, which come back as the strings "true"/"false". */
function outcome(properties: Properties): LeadOutcome {
	if (properties.hs_is_closed !== "true") return { status: "open", at: null, reason: null };
	const won = properties.hs_is_closed_won === "true";
	return {
		status: won ? "won" : "lost",
		at: properties.closedate ? new Date(properties.closedate).toISOString() : null,
		reason: won ? null : properties.closed_lost_reason || null,
	};
}

function isGuest(properties: Properties, { phone, zaloUserId }: GuestIdentity): boolean {
	if (zaloUserId && properties[ZALO_ID_PROPERTY] === zaloUserId) return true;
	return Boolean(
		phone &&
		[properties.phone, properties.mobilephone].some((number) => number && toE164(number) === phone),
	);
}

/** What the deal carries for the office (spec #59, story 14): never message text. */
function description(guest: NewGuestLead): string {
	return [
		`Nhịp thread: ${guest.threadUrl}`,
		`Pipe: ${PIPE_LABELS[guest.pipe]}`,
		...(guest.language ? [`Language: ${guest.language}`] : []),
		...DESCRIPTION_FIELDS.flatMap(([key, label]) =>
			guest.fields?.[key] ? [`${label}: ${guest.fields[key]}`] : [],
		),
	].join("\n");
}

/** An answer's body as JSON; null when empty or not JSON. */
function parse(text: string): unknown {
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

/** How long a 429 asks to wait, in ms (a second when it does not say); null when too long. */
function retryDelay(response: Response): number | null {
	const header = response.headers.get("retry-after");
	const seconds = header === null ? 1 : Number(header);
	return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_RETRY_AFTER_S
		? seconds * 1000
		: null;
}

function chunks<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
	return result;
}
