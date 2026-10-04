import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "vitest";

import { hubspotCrmAdapter } from "./hubspot";
import type { GuestIdentity, NewGuestLead } from "./types";

/**
 * The HubSpot adapter's contract (#65), replayed from real HubSpot exchanges recorded on the
 * developer test account by `scripts/record-hubspot.ts`. Every request the adapter sends must be
 * the recorded one, in order, and every recorded exchange must be used: no extra call.
 */

const TOKEN = "test-token-not-real";

type Exchange = {
	request: { method: string; path: string; body: unknown };
	response: { status: number; headers?: Record<string, string>; body: unknown };
};
type Recording = {
	exchanges: Exchange[];
	input: unknown;
	expected?: unknown;
	[key: string]: unknown;
};

function recorded(name: string): Recording {
	const file = path.join(import.meta.dirname, "recordings/hubspot", `${name}.json`);
	return JSON.parse(readFileSync(file, "utf8"));
}

/** A fetch that answers with the recorded responses, each only to the request it was given for. */
function replay(exchanges: Exchange[]) {
	const sent: Exchange["request"][] = [];
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : input);
		const request = {
			method: init?.method ?? "GET",
			path: `${url.pathname}${url.search}`,
			body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
		};
		sent.push(request);
		const next = exchanges[sent.length - 1];
		if (!next) throw new Error(`unexpected request: ${request.method} ${request.path}`);
		expect(url.origin).toBe("https://api.hubapi.com");
		expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
		expect(request).toEqual(next.request);
		const { status, headers, body } = next.response;
		return new Response(body === null ? null : JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json", ...headers },
		});
	};
	return {
		adapter: hubspotCrmAdapter({ token: TOKEN, fetch: fetch as typeof globalThis.fetch }),
		sent,
		allUsed: () => expect(sent).toHaveLength(exchanges.length),
	};
}

function bodiesSent(sent: Exchange["request"][], method: string, path: string) {
	return sent.filter((r) => r.method === method && r.path === path).map((r) => r.body as any);
}

const CONTACTS = "/crm/objects/2026-09/contacts";
const DEALS = "/crm/objects/2026-09/deals";

// Spec #59 stories 13, 14, 15, 18 (#65): a new Zalo guest becomes a contact carrying the Zalo id
// and a deal carrying the pipe, language, extracted fields and thread link; never message text.
test("a new Zalo guest becomes a new contact with a new deal", async () => {
	const recording = recorded("create-new-zalo");
	const guest = recording.input as NewGuestLead;
	const { adapter, sent, allUsed } = replay(recording.exchanges);

	expect(await adapter.createLead(guest)).toEqual(recording.expected);
	allUsed();

	const [contact] = bodiesSent(sent, "POST", CONTACTS);
	expect(contact.properties).toEqual({ firstname: guest.name, zalo_user_id: guest.zaloUserId });
	const [deal] = bodiesSent(sent, "POST", DEALS);
	expect(deal.properties.dealname).toBe(guest.name);
	expect(deal.properties.description).toContain(guest.threadUrl);
	expect(deal.properties.description).toContain("Pipe: Zalo");
	expect(deal.properties.description).toContain("Language: vi");
	expect(deal.properties.description).toContain("Area: Thảo Điền");
	expect(deal.properties.description).toContain("Budget: 1,000–1,500 USD");
	const newContact = recording.exchanges.find((e) => e.request.path === CONTACTS)!;
	expect(deal.associations[0].to.id).toBe((newContact.response.body as any).id);
	expect(JSON.stringify(sent)).not.toMatch(/"message"/);
});

// Spec #59 stories 13, 14 (#65): a new WhatsApp guest's contact carries the phone.
test("a new WhatsApp guest becomes a new contact with the phone and a new deal", async () => {
	const recording = recorded("create-new-phone");
	const guest = recording.input as NewGuestLead;
	const { adapter, sent, allUsed } = replay(recording.exchanges);

	expect(await adapter.createLead(guest)).toEqual(recording.expected);
	allUsed();
	const [contact] = bodiesSent(sent, "POST", CONTACTS);
	expect(contact.properties).toEqual({ firstname: guest.name, phone: guest.phone });
	expect(bodiesSent(sent, "POST", DEALS)[0].properties.description).toContain("Pipe: WhatsApp");
});

// Spec #59 story 16 (#65): a phone an agent typed into the CRM as `090 …` is the guest's +84 phone.
test("a guest whose phone is in the CRM reuses that contact for a new deal", async () => {
	const find = recorded("find-phone-no-deal");
	const found = replay(find.exchanges);
	expect(await found.adapter.findLeads(find.input as GuestIdentity)).toEqual([]);
	found.allUsed();

	const create = recorded("create-reuse-phone");
	const { adapter, sent, allUsed } = replay(create.exchanges);
	expect(await adapter.createLead(create.input as NewGuestLead)).toEqual(create.expected);
	allUsed();
	expect(bodiesSent(sent, "POST", CONTACTS)).toEqual([]);
	expect(bodiesSent(sent, "POST", DEALS)[0].associations[0].to.id).toBe(create.contactId);
});

// ADR 0003 "Matching never guesses" (#65): HubSpot matches phones on their national digits only.
test("a contact whose phone only shares the national digits is not the guest", async () => {
	const find = recorded("find-phone-no-deal");
	const search = structuredClone(find.exchanges[0]);
	(search.response.body as any).results[0].properties.phone = "+1 906 536 454";
	const { adapter, allUsed } = replay([search]);

	expect(await adapter.findLeads(find.input as GuestIdentity)).toEqual([]);
	allUsed();
});

// Spec #59 story 18 (#65): a contact carrying the guest's Zalo id is reused.
test("a Zalo guest whose Zalo id is in the CRM reuses that contact for a new deal", async () => {
	const find = recorded("find-zalo-no-deal");
	const found = replay(find.exchanges);
	expect(await found.adapter.findLeads(find.input as GuestIdentity)).toEqual([]);
	found.allUsed();

	const create = recorded("create-reuse-zalo");
	const { adapter, sent, allUsed } = replay(create.exchanges);
	expect(await adapter.createLead(create.input as NewGuestLead)).toEqual(create.expected);
	allUsed();
	expect(bodiesSent(sent, "POST", CONTACTS)).toEqual([]);
	expect(bodiesSent(sent, "POST", DEALS)[0].associations[0].to.id).toBe(create.contactId);
});

// Spec #59 story 17 (#65): a returning contact with an open deal is linked to that deal.
test("a returning guest whose contact has an open deal finds that deal", async () => {
	const find = recorded("find-open-deal");
	const { adapter, allUsed } = replay(find.exchanges);

	const leads = await adapter.findLeads(find.input as GuestIdentity);
	expect(leads).toEqual(find.expected);
	expect(leads).toHaveLength(1);
	allUsed();
});

// Spec #59 story 17 (#65): a closed deal is not reused; the contact gets a new deal.
test("a returning guest whose deal is closed gets a new deal on the same contact", async () => {
	const find = recorded("find-closed-deal");
	const found = replay(find.exchanges);
	expect(await found.adapter.findLeads(find.input as GuestIdentity)).toEqual([]);
	found.allUsed();

	const create = recorded("create-after-closed");
	const { adapter, sent, allUsed } = replay(create.exchanges);
	expect(await adapter.createLead(create.input as NewGuestLead)).toEqual(create.expected);
	allUsed();
	expect(bodiesSent(sent, "POST", CONTACTS)).toEqual([]);
	expect(bodiesSent(sent, "POST", DEALS)[0].associations[0].to.id).toBe(create.contactId);
});

// Spec #59 story 20 (#65): Nhịp never sets an owner, and HubSpot assigns none.
test("new deals are created unassigned", async () => {
	for (const name of [
		"create-new-zalo",
		"create-new-phone",
		"create-reuse-phone",
		"create-reuse-zalo",
	]) {
		const recording = recorded(name);
		const { adapter, sent } = replay(recording.exchanges);
		await adapter.createLead(recording.input as NewGuestLead);
		const [deal] = bodiesSent(sent, "POST", DEALS);
		expect(deal.properties).not.toHaveProperty("hubspot_owner_id");
	}
	const readBack = recorded("deal-unassigned").exchanges[0].response.body as any;
	expect(readBack.properties.hubspot_owner_id).toBeNull();
});

// ADR 0003 (#65): the CRM's outcome, from HubSpot's own closed and won flags, date and reason.
test("outcomes map won, lost with its reason, and open; an unknown deal is absent", async () => {
	const recording = recorded("outcomes");
	const { adapter, allUsed } = replay(recording.exchanges);
	const deals = (recording.exchanges[0].response.body as any).results as {
		id: string;
		properties: Record<string, string | null>;
	}[];
	const closedate = (id: string) =>
		new Date(deals.find((d) => d.id === id)!.properties.closedate!).toISOString();

	const outcomes = await adapter.outcomesFor(recording.input as string[]);
	allUsed();
	expect(outcomes).toEqual({
		[recording.won as string]: {
			status: "won",
			at: closedate(recording.won as string),
			reason: null,
		},
		[recording.lost as string]: {
			status: "lost",
			at: closedate(recording.lost as string),
			reason: "Nhịp test: rented elsewhere",
		},
		[recording.open as string]: { status: "open", at: null, reason: null },
	});
});

// Spec #59 story 12 (#65): the CRM is not called for nothing; the seam's `outcomesFor` contract.
test("no deals to ask about makes no call", async () => {
	const { adapter, allUsed } = replay([]);
	expect(await adapter.outcomesFor([])).toEqual({});
	allUsed();
});

// #65: on an account without the Zalo property, the first search creates it and searches again.
test("a search for a Zalo id creates the missing Zalo property, once", async () => {
	const recording = recorded("create-property-missing");
	const { adapter, sent, allUsed } = replay(recording.exchanges);

	expect(await adapter.createLead(recording.input as NewGuestLead)).toEqual(recording.expected);
	allUsed();
	const [property] = bodiesSent(sent, "POST", "/crm/properties/2026-09/contacts");
	expect(property).toMatchObject({ name: "zalo_user_id", hasUniqueValue: true, type: "string" });
	expect(property.groupName).toBeTruthy();
});

// #65: a contact write that names the missing property creates it and writes again. HubSpot's
// real refusal (`contact-property-missing`) and property creation, around a normal new guest.
test("a contact write refused for the missing Zalo property creates it and writes again", async () => {
	const normal = recorded("create-new-zalo").exchanges;
	const refusal = recorded("contact-property-missing").exchanges[0].response;
	const created = recorded("create-property-missing").exchanges[1];
	const [search, pipelines, contact, deal] = normal;
	const recording = recorded("create-new-zalo");
	const { adapter, allUsed } = replay([
		search,
		pipelines,
		{ request: contact.request, response: refusal },
		created,
		contact,
		deal,
	]);

	expect(await adapter.createLead(recording.input as NewGuestLead)).toEqual(recording.expected);
	allUsed();
});

// #65: HubSpot answers a search on a missing property with a bare 400; when the property exists,
// that 400 is something else, and it is thrown rather than retried.
test("a failed search is not retried when the Zalo property already exists", async () => {
	const failed = recorded("create-property-missing").exchanges[0];
	const exists = recorded("property-exists").exchanges[0];
	const { adapter, allUsed } = replay([failed, exists]);

	await expect(
		adapter.findLeads({
			phone: null,
			zaloUserId: (recorded("create-property-missing").input as NewGuestLead).zaloUserId,
		}),
	).rejects.toThrow(/400/);
	allUsed();
});

// ADR 0003 "Matching never guesses" (#65, deferred): two contacts and no open deal stop the write.
test("two contacts for the guest and no open deal: no contact or deal is written", async () => {
	const recording = recorded("create-ambiguous");
	const { adapter, allUsed } = replay(recording.exchanges);

	await expect(adapter.createLead(recording.input as NewGuestLead)).rejects.toThrow(/2 contacts/);
	allUsed();
});

// Spec #59 story 43 (#65): an error names the status and HubSpot's category, never the token.
test("a refused token throws with HubSpot's status and category, not the token", async () => {
	const recording = recorded("unauthorized");
	const { adapter } = replay(recording.exchanges);

	const error = await adapter.findLeads(recording.input as GuestIdentity).catch((e: Error) => e);
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toMatch(/401/);
	expect((error as Error).message).toMatch(/INVALID_AUTHENTICATION/);
	expect(JSON.stringify(error)).not.toContain(TOKEN);
	expect((error as Error).message).not.toContain(TOKEN);
});

// #65: HubSpot's rate limit is waited out once, as its Retry-After says.
test("a rate-limited request is retried once after Retry-After", async () => {
	const recording = recorded("find-zalo-no-deal");
	const [search, ...rest] = recording.exchanges;
	const limited: Exchange = {
		request: search.request,
		response: {
			status: 429,
			headers: { "retry-after": "0" },
			body: {
				status: "error",
				message: "You have reached your ten secondly limit.",
				category: "RATE_LIMITS",
			},
		},
	};
	const { adapter, allUsed } = replay([limited, search, ...rest]);

	expect(await adapter.findLeads(recording.input as GuestIdentity)).toEqual(recording.expected);
	allUsed();
});

// #66: HubSpot's webhooks name the portal; the token says which portal it was installed on.
test("the account a token reaches is its portal id", async () => {
	const recording = recorded("account-details");
	const { adapter, allUsed } = replay(recording.exchanges);

	expect(await adapter.accountId()).toBe(recording.expected);
	allUsed();
});
