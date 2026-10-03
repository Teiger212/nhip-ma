import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Records the HubSpot adapter's contract (#65): runs each scenario against the developer test
 * account nhip-crm-dev, and only that account, then writes the request and response pairs that
 * `lib/crm/hubspot.test.ts` replays. The requests are the ones the adapter must make; the
 * responses are HubSpot's. No request header is recorded, so the token never is.
 *
 *   cd apps/saas && pnpm exec dotenv -e ../../.env.local -- tsx --tsconfig tsconfig.json modules/inbox/scripts/record-hubspot.ts
 *
 * Test records stay in the account, named "Nhịp Test …" with a run suffix; delete them in
 * HubSpot under Contacts and Deals (search "Nhịp Test"). The Zalo user id property is created
 * on the first run, which is the only run that can record its self-heal.
 */

const API = "https://api.hubapi.com";
const VERSION = "2026-09";
const TEST_PORTAL = 149475500;
const ZALO = "zalo_user_id";
const OUT = path.resolve(import.meta.dirname, "../lib/crm/recordings/hubspot");

const TOKEN = process.env.HUBSPOT_TEST_TOKEN ?? "";
if (!TOKEN) {
	console.error("HUBSPOT_TEST_TOKEN is not set (it lives in the worktree's .env.local)");
	process.exit(2);
}

type Exchange = {
	request: { method: string; path: string; body: unknown };
	response: { status: number; headers?: Record<string, string>; body: unknown };
};
type Identity = { phone: string | null; zaloUserId: string | null };
type Guest = Identity & {
	name: string;
	pipe: "zalo" | "whatsapp";
	language: string | null;
	fields: Record<string, string | boolean | null> | null;
	threadUrl: string;
};

async function send(method: string, apiPath: string, body?: unknown, token = TOKEN) {
	const response = await fetch(`${API}${apiPath}`, {
		method,
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	const retryAfter = response.headers.get("retry-after");
	const exchange: Exchange = {
		request: { method, path: apiPath, body: body ?? null },
		response: {
			status: response.status,
			...(retryAfter ? { headers: { "retry-after": retryAfter } } : {}),
			body: text ? JSON.parse(text) : null,
		},
	};
	return exchange;
}

/** One adapter call's exchanges, in order, saved as one recording. */
function recording() {
	const exchanges: Exchange[] = [];
	return {
		exchanges,
		async call(method: string, apiPath: string, body?: unknown, token?: string) {
			const exchange = await send(method, apiPath, body, token);
			exchanges.push(exchange);
			return exchange.response as { status: number; body: any };
		},
	};
}

function save(name: string, content: Record<string, unknown>) {
	const json = `${JSON.stringify(content, null, "\t")}\n`;
	// Any HubSpot token's prefix, spelled so that a grep for tokens never matches this file.
	if (json.includes(TOKEN) || /pat\x2d/.test(json)) throw new Error(`${name} would carry a token`);
	writeFileSync(path.join(OUT, `${name}.json`), json);
	console.info(`  recorded ${name}.json`);
}

function must(response: { status: number; body: any }, what: string) {
	if (response.status >= 300) {
		throw new Error(`${what}: ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`);
	}
	return response.body;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** HubSpot's search lags its writes; poll (unrecorded, under 5 searches a second) until it caught up. */
async function until(what: string, search: () => Promise<boolean>) {
	for (let attempt = 0; attempt < 90; attempt++) {
		if (await search()) return;
		await sleep(2000);
	}
	throw new Error(`search never showed ${what}`);
}

// The adapter's requests: the contract `hubspot.ts` must match.

function contactSearch({ phone, zaloUserId }: Identity) {
	const national = phone ? parsePhoneNumberFromString(phone)?.nationalNumber : undefined;
	return {
		filterGroups: [
			...(national
				? ["hs_searchable_calculated_phone_number", "hs_searchable_calculated_mobile_number"].map(
						(propertyName) => ({ filters: [{ propertyName, operator: "EQ", value: national }] }),
					)
				: []),
			...(zaloUserId
				? [{ filters: [{ propertyName: ZALO, operator: "EQ", value: zaloUserId }] }]
				: []),
		],
		properties: ["phone", "mobilephone", ...(zaloUserId ? [ZALO] : [])],
		limit: 100,
	};
}

function openDealSearch(contactIds: string[]) {
	return {
		filterGroups: contactIds.map((id) => ({
			filters: [
				{ propertyName: "associations.contact", operator: "EQ", value: id },
				{ propertyName: "hs_is_closed", operator: "EQ", value: "false" },
			],
		})),
		properties: ["dealname"],
		limit: 100,
	};
}

const zaloProperty = {
	name: ZALO,
	label: "Zalo user ID",
	description: "The guest's Zalo user id, written by Nhịp so a returning Zalo guest is recognised.",
	groupName: "contactinformation",
	type: "string",
	fieldType: "text",
	hasUniqueValue: true,
};

function newContact(guest: Guest) {
	return {
		properties: {
			firstname: guest.name,
			...(guest.phone ? { phone: guest.phone } : {}),
			...(guest.zaloUserId ? { [ZALO]: guest.zaloUserId } : {}),
		},
	};
}

const PIPES = { zalo: "Zalo", whatsapp: "WhatsApp" };
const FIELDS = [
	["areaOfInterest", "Area"],
	["rentOrBuy", "Rent or buy"],
	["budgetBand", "Budget"],
	["timeframe", "Timeframe"],
	["bedsOrHousehold", "Household"],
] as const;

function description(guest: Guest) {
	return [
		`Nhịp thread: ${guest.threadUrl}`,
		`Pipe: ${PIPES[guest.pipe]}`,
		...(guest.language ? [`Language: ${guest.language}`] : []),
		...FIELDS.flatMap(([key, label]) =>
			guest.fields?.[key] ? [`${label}: ${guest.fields[key]}`] : [],
		),
	].join("\n");
}

function newDeal(guest: Guest, contactId: string, pipeline: string, dealstage: string) {
	return {
		properties: { dealname: guest.name, pipeline, dealstage, description: description(guest) },
		associations: [
			{
				to: { id: contactId },
				types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
			},
		],
	};
}

const OUTCOME_PROPERTIES = ["hs_is_closed", "hs_is_closed_won", "closedate", "closed_lost_reason"];

const contacts = `/crm/objects/${VERSION}/contacts`;
const deals = `/crm/objects/${VERSION}/deals`;
const pipelines = `/crm/pipelines/${VERSION}/deals`;
const properties = `/crm/properties/${VERSION}/contacts`;

type Pipeline = {
	displayOrder: number;
	id: string;
	stages: {
		id: string;
		displayOrder: number;
		metadata: { isClosed: string; probability: string };
	}[];
};

/** The first pipeline's first open stage, where a new deal starts. */
function firstOpenStage(results: Pipeline[]) {
	const pipeline = [...results].sort((a, b) => a.displayOrder - b.displayOrder)[0];
	const stage = [...pipeline.stages]
		.sort((a, b) => a.displayOrder - b.displayOrder)
		.find((s) => s.metadata.isClosed !== "true");
	if (!stage) throw new Error("no open stage");
	return { pipeline: pipeline.id, dealstage: stage.id };
}

/** createLead, as the adapter does it: a new deal on the guest's one contact, or on a new one. */
async function createLead(rec: ReturnType<typeof recording>, guest: Guest) {
	const found = must(await rec.call("POST", `${contacts}/search`, contactSearch(guest)), "search");
	if (found.results.length > 1) throw new Error(`${guest.name} matched several contacts`);
	const start = firstOpenStage(must(await rec.call("GET", pipelines), "pipelines").results);
	const contactId: string =
		found.results[0]?.id ?? must(await rec.call("POST", contacts, newContact(guest)), "contact").id;
	const deal = must(
		await rec.call("POST", deals, newDeal(guest, contactId, start.pipeline, start.dealstage)),
		"deal",
	);
	return { contactId, lead: { id: deal.id as string, name: deal.properties.dealname as string } };
}

/** findLeads, as the adapter does it. */
async function findLeads(rec: ReturnType<typeof recording>, identity: Identity) {
	const found = must(
		await rec.call("POST", `${contacts}/search`, contactSearch(identity)),
		"search",
	);
	if (found.results.length === 0) return [];
	const open = must(
		await rec.call(
			"POST",
			`${deals}/search`,
			openDealSearch(found.results.map((c: { id: string }) => c.id)),
		),
		"deal search",
	);
	return open.results.map((d: any) => ({
		id: d.id as string,
		name: d.properties.dealname as string,
	}));
}

async function contactsFound(identity: Identity, count: number) {
	const response = await send("POST", `${contacts}/search`, contactSearch(identity));
	return response.response.status === 200 && (response.response.body as any).total >= count;
}

async function openDeals(contactId: string) {
	const response = await send("POST", `${deals}/search`, openDealSearch([contactId]));
	return ((response.response.body as any).results ?? []).map(
		(d: { id: string }) => d.id,
	) as string[];
}

async function main() {
	const account = await send("GET", `/account-info/${VERSION}/details`);
	const portalId = (account.response.body as { portalId?: number } | null)?.portalId;
	if (portalId !== TEST_PORTAL) {
		console.error(`refusing to record: the token reaches portal ${portalId}, not ${TEST_PORTAL}`);
		process.exit(2);
	}
	mkdirSync(OUT, { recursive: true });

	const run = String(Date.now()).slice(-6);
	const phone = (k: number) => `+8490${run}${k}`;
	const zalo = (k: number) => `nhip-test-zalo-${run}-${k}`;
	const guest = (k: number, identity: Identity, name: string): Guest => ({
		...identity,
		name: `Nhịp Test ${name} ${run}`,
		pipe: identity.zaloUserId ? "zalo" : "whatsapp",
		language: "vi",
		fields: {
			areaOfInterest: "Thảo Điền",
			nationality: null,
			inVietnamNow: true,
			rentOrBuy: "rent",
			timeframe: "next month",
			budgetBand: "1,000–1,500 USD",
			bedsOrHousehold: "2 bedrooms",
		},
		threadUrl: `https://nhip.test/vi/inbox?thread=nhip-test-${run}-${k}`,
	});
	const recordedAt = new Date().toISOString();
	const meta = (call: string, scenario: string, extra: Record<string, unknown>) => ({
		call,
		scenario,
		recordedAt,
		...extra,
	});
	console.info(`Recording against portal ${portalId}, run ${run}`);

	// The Zalo user id property: only a run on an account without it can record its self-heal.
	const property = await send("GET", `${properties}/${ZALO}`);
	if (property.response.status === 404) {
		const write = recording();
		const contact = newContact(guest(0, { phone: null, zaloUserId: zalo(0) }, "Property"));
		const refused = await write.call("POST", contacts, contact);
		if (refused.status !== 400) throw new Error(`expected a 400, got ${refused.status}`);
		save("contact-property-missing", {
			...meta("createLead", "A contact write names the Zalo property before it exists", {}),
			exchanges: write.exchanges,
		});

		const rec = recording();
		const g = guest(0, { phone: null, zaloUserId: zalo(0) }, "Minh");
		const failed = await rec.call("POST", `${contacts}/search`, contactSearch(g));
		if (failed.status !== 400) throw new Error(`expected a 400, got ${failed.status}`);
		must(await rec.call("POST", properties, zaloProperty), "property");
		const retried = await rec.call("POST", `${contacts}/search`, contactSearch(g));
		if (retried.status !== 200) {
			// Keep what HubSpot did: a new property it cannot search yet is a finding, not a crash.
			save("create-property-missing", {
				...meta("createLead", "The search right after creating the Zalo property", { input: g }),
				exchanges: rec.exchanges,
			});
			throw new Error(`the retried search answered ${retried.status}`);
		}
		const found = retried.body;
		const start = firstOpenStage(must(await rec.call("GET", pipelines), "pipelines").results);
		const contactId = must(await rec.call("POST", contacts, newContact(g)), "contact").id;
		const deal = must(
			await rec.call("POST", deals, newDeal(g, contactId, start.pipeline, start.dealstage)),
			"deal",
		);
		if (found.total !== 0) throw new Error("a fresh Zalo id matched a contact");
		save("create-property-missing", {
			...meta("createLead", "A new Zalo guest on an account without the Zalo property", {
				input: g,
				expected: { id: deal.id, name: deal.properties.dealname },
			}),
			exchanges: rec.exchanges,
		});
	}
	const exists = recording();
	await exists.call("POST", properties, zaloProperty);
	save("property-exists", {
		...meta("createZaloProperty", "Creating the Zalo property again", {}),
		exchanges: exists.exchanges,
	});

	// Stories 13, 14, 18, 20: a new Zalo guest becomes a contact and an unassigned deal.
	const minh = guest(2, { phone: null, zaloUserId: zalo(2) }, "Minh");
	const created = recording();
	const minhLead = await createLead(created, minh);
	save("create-new-zalo", {
		...meta("createLead", "A new Zalo guest: a new contact and a new deal", {
			input: minh,
			expected: minhLead.lead,
		}),
		exchanges: created.exchanges,
	});

	const thao = guest(3, { phone: phone(3), zaloUserId: null }, "Thảo");
	const createdByPhone = recording();
	const thaoLead = await createLead(createdByPhone, thao);
	save("create-new-phone", {
		...meta("createLead", "A new WhatsApp guest: a new contact with the phone and a new deal", {
			input: thao,
			expected: thaoLead.lead,
		}),
		exchanges: createdByPhone.exchanges,
	});

	await sleep(5000);
	const owner = recording();
	await owner.call(
		"GET",
		`${deals}/${minhLead.lead.id}?properties=hubspot_owner_id,dealstage,pipeline,hs_is_closed,description`,
	);
	save("deal-unassigned", {
		...meta("evidence", "A deal Nhịp created, read back: HubSpot assigned no owner", {}),
		exchanges: owner.exchanges,
	});

	// Story 16: a phone an agent typed in the CRM, in national format, reuses that contact.
	const lanPhone = phone(4);
	const typed = `0${lanPhone.slice(3, 5)} ${lanPhone.slice(5, 8)} ${lanPhone.slice(8)}`;
	const lan = must(
		await send("POST", contacts, {
			properties: { firstname: `Nhịp Test Lan ${run}`, phone: typed },
		}).then((e) => e.response as any),
		"setup contact",
	);
	await until("Lan by phone", () => contactsFound({ phone: lanPhone, zaloUserId: null }, 1));
	const lanFind = recording();
	const lanLeads = await findLeads(lanFind, { phone: lanPhone, zaloUserId: null });
	save("find-phone-no-deal", {
		...meta("findLeads", "A phone typed as 0xx xxx xxxx in the CRM, contact without deals", {
			input: { phone: lanPhone, zaloUserId: null },
			storedPhone: typed,
			expected: lanLeads,
		}),
		exchanges: lanFind.exchanges,
	});
	const lanGuest = guest(4, { phone: lanPhone, zaloUserId: null }, "Lan");
	const lanCreate = recording();
	const lanLead = await createLead(lanCreate, lanGuest);
	if (lanLead.contactId !== lan.id) throw new Error("Lan's contact was not reused");
	save("create-reuse-phone", {
		...meta("createLead", "A guest whose phone is in the CRM: a new deal on that contact", {
			input: lanGuest,
			contactId: lan.id,
			expected: lanLead.lead,
		}),
		exchanges: lanCreate.exchanges,
	});

	// Story 18: a contact carrying the Zalo id is reused.
	const hoa = must(
		await send("POST", contacts, {
			properties: { firstname: `Nhịp Test Hoa ${run}`, [ZALO]: zalo(6) },
		}).then((e) => e.response as any),
		"setup contact",
	);
	await until("Hoa by Zalo id", () => contactsFound({ phone: null, zaloUserId: zalo(6) }, 1));
	const hoaFind = recording();
	const hoaLeads = await findLeads(hoaFind, { phone: null, zaloUserId: zalo(6) });
	save("find-zalo-no-deal", {
		...meta("findLeads", "A Zalo id on a CRM contact without deals", {
			input: { phone: null, zaloUserId: zalo(6) },
			expected: hoaLeads,
		}),
		exchanges: hoaFind.exchanges,
	});
	const hoaGuest = guest(6, { phone: null, zaloUserId: zalo(6) }, "Hoa");
	const hoaCreate = recording();
	const hoaLead = await createLead(hoaCreate, hoaGuest);
	if (hoaLead.contactId !== hoa.id) throw new Error("Hoa's contact was not reused");
	save("create-reuse-zalo", {
		...meta("createLead", "A guest whose Zalo id is in the CRM: a new deal on that contact", {
			input: hoaGuest,
			contactId: hoa.id,
			expected: hoaLead.lead,
		}),
		exchanges: hoaCreate.exchanges,
	});

	// Story 17: a returning contact with an open deal is linked to that deal.
	await until("Minh's open deal", async () =>
		(await openDeals(minhLead.contactId)).includes(minhLead.lead.id),
	);
	await until("Minh by Zalo id", () => contactsFound(minh, 1));
	const minhFind = recording();
	const minhLeads = await findLeads(minhFind, minh);
	save("find-open-deal", {
		...meta("findLeads", "A returning Zalo guest whose contact has an open deal", {
			input: { phone: null, zaloUserId: minh.zaloUserId },
			expected: minhLeads,
		}),
		exchanges: minhFind.exchanges,
	});

	// Story 17: a returning contact whose deal is closed gets a new deal on the same contact.
	const stages = must((await send("GET", pipelines)).response as any, "pipelines")
		.results as Pipeline[];
	const closed = (probability: string) =>
		stages[0].stages.find(
			(s) => s.metadata.isClosed === "true" && s.metadata.probability === probability,
		)!.id;
	await until("Lan's open deal", async () => (await openDeals(lan.id)).includes(lanLead.lead.id));
	must(
		(
			await send("PATCH", `${deals}/${lanLead.lead.id}`, {
				properties: { dealstage: closed("0.0"), closed_lost_reason: "Nhịp test: rented elsewhere" },
			})
		).response as any,
		"close lost",
	);
	await until("Lan's deal closed", async () => (await openDeals(lan.id)).length === 0);
	const lanAgain = recording();
	const lanAgainLeads = await findLeads(lanAgain, { phone: lanPhone, zaloUserId: null });
	save("find-closed-deal", {
		...meta("findLeads", "A returning guest whose only deal is closed (lost)", {
			input: { phone: lanPhone, zaloUserId: null },
			expected: lanAgainLeads,
		}),
		exchanges: lanAgain.exchanges,
	});
	const lanReturns = {
		...lanGuest,
		threadUrl: `https://nhip.test/vi/inbox?thread=nhip-test-${run}-5`,
	};
	const lanAgainCreate = recording();
	const lanSecond = await createLead(lanAgainCreate, lanReturns);
	if (lanSecond.contactId !== lan.id) throw new Error("Lan's contact was not reused");
	save("create-after-closed", {
		...meta("createLead", "A returning guest whose deal is closed: a new deal, same contact", {
			input: lanReturns,
			contactId: lan.id,
			expected: lanSecond.lead,
		}),
		exchanges: lanAgainCreate.exchanges,
	});

	// Outcomes: Hoa's deal won, Lan's first deal lost, Lan's second open, and an unknown id.
	must(
		(
			await send("PATCH", `${deals}/${hoaLead.lead.id}`, {
				properties: { dealstage: closed("1.0") },
			})
		).response as any,
		"close won",
	);
	const outcomes = recording();
	const ids = [hoaLead.lead.id, lanLead.lead.id, lanSecond.lead.id, "1"];
	await outcomes.call("POST", `${deals}/batch/read`, {
		inputs: ids.map((id) => ({ id })),
		properties: OUTCOME_PROPERTIES,
	});
	save("outcomes", {
		...meta(
			"outcomesFor",
			"A won deal, a lost deal with a reason, an open deal and an unknown id",
			{
				input: ids,
				won: hoaLead.lead.id,
				lost: lanLead.lead.id,
				open: lanSecond.lead.id,
				unknown: "1",
			},
		),
		exchanges: outcomes.exchanges,
	});

	// Never guess: two contacts share a phone and neither has an open deal.
	const twinPhone = phone(7);
	for (const name of ["Twin A", "Twin B"]) {
		must(
			(
				await send("POST", contacts, {
					properties: { firstname: `Nhịp Test ${name} ${run}`, phone: twinPhone },
				})
			).response as any,
			"setup twin",
		);
	}
	await until("both twins", () => contactsFound({ phone: twinPhone, zaloUserId: null }, 2));
	const twins = recording();
	const twinGuest = guest(7, { phone: twinPhone, zaloUserId: null }, "Twin");
	await twins.call("POST", `${contacts}/search`, contactSearch(twinGuest));
	save("create-ambiguous", {
		...meta("createLead", "Two contacts share the guest's phone and neither has an open deal", {
			input: twinGuest,
		}),
		exchanges: twins.exchanges,
	});

	// A refused token: what HubSpot says, so the adapter's error is checked against the real body.
	const refused = recording();
	await refused.call("POST", `${contacts}/search`, contactSearch(twinGuest), "not-a-real-token");
	save("unauthorized", {
		...meta("findLeads", "HubSpot refuses the token", {
			input: { phone: twinPhone, zaloUserId: null },
		}),
		exchanges: refused.exchanges,
	});

	if (!existsSync(path.join(OUT, "create-property-missing.json"))) {
		console.warn("No self-heal recording: the property already existed before the first run.");
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message.replaceAll(TOKEN, "[token]") : "failed");
	process.exit(1);
});
