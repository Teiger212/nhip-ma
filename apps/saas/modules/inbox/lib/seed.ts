import { conversationId } from "@repo/database/inbox";

import { injectDevInbound } from "./inbox";
import { getRuntime } from "./runtime";
import type { Conversation, Pipe } from "./types";

export type DemoThread = {
	pipe: Pipe;
	guestId: string;
	guestName: string;
	text: string;
	/** How long before seeding the guest wrote. Past 48 hours the thread is Quiet. */
	hoursAgo: number;
};

/** Invented walkthrough threads. Not real guests. Not Hạnh. */
export const DEMO_THREADS: DemoThread[] = [
	{
		pipe: "whatsapp",
		guestId: "demo-ko-stay",
		guestName: "Minji",
		text: "안녕하세요. 한국인입니다. currently in Hanoi. Tay Ho에서 3 nights vs monthly stay 고민이에요. this Friday. 2 bedroom.",
		hoursAgo: 0.25,
	},
	{
		pipe: "whatsapp",
		guestId: "demo-jp-buy",
		guestName: "Yuki",
		text: "こんにちは。日本人です。currently in Hanoi. Tay Hoで購入を考えています。Can foreigners get a pink book / sổ hồng?",
		hoursAgo: 72,
	},
	{
		pipe: "whatsapp",
		guestId: "demo-ru-ciputra",
		guestName: "Alexei",
		text: "Здравствуйте. Я русский, сейчас в Ханое. Ищу аренду в Ciputra, 2 bedroom, $2000/month.",
		hoursAgo: 80,
	},
	{
		pipe: "zalo",
		guestId: "demo-vi-tayho",
		guestName: "Thảo",
		text: "Em muốn thuê căn 2 ngủ ở Tây Hồ từ đầu tháng 9, ngân sách 30 triệu",
		hoursAgo: 0.5,
	},
];

/**
 * Writes the invented threads under `officeId` (the walk office by default), each stamped
 * `hoursAgo` before `now`: Minji and Thảo land in Your turn, Yuki and Alexei in Quiet. A
 * thread that exists (by office, pipe, guest) is left alone unless `reset` rewrites it.
 */
export async function seedInbox(
	officeId: string,
	{ reset = false, now = Date.now() }: { reset?: boolean; now?: number } = {},
): Promise<Conversation[]> {
	const { store } = getRuntime();
	if (reset) {
		// Rewrite the demo threads as of `now`, so the fresh pair is back in Your turn.
		await store.deleteConversations(
			officeId,
			DEMO_THREADS.map((thread) => conversationId(officeId, thread.pipe, thread.guestId)),
		);
	}
	const owned = await store.listConversations({ userId: "seed", officeId });
	const result: Conversation[] = [];
	for (const thread of DEMO_THREADS) {
		const existing = owned.find(
			(conversation) =>
				conversation.pipe === thread.pipe && conversation.guestId === thread.guestId,
		);
		if (existing) {
			result.push(existing);
			continue;
		}
		result.push(
			await injectDevInbound({
				pipe: thread.pipe,
				guestId: thread.guestId,
				guestName: thread.guestName,
				text: thread.text,
				officeId,
				at: now - thread.hoursAgo * 60 * 60 * 1000,
			}),
		);
	}
	return result;
}

type DemoCrmLead = {
	id: string;
	name: string;
	phone: string | null;
	outcome: "open" | "won" | "lost";
	reason: string | null;
	/** The demo thread (guest id) an agent already linked it to; null leaves it to link by hand. */
	link: string | null;
};

/**
 * The demo's mock CRM (ADR 0003). Thảo is linked and open; Alexei is linked and lost, so he
 * leaves the queue. Minji and Yuki stay unlinked so the walk shows "Link to CRM lead".
 */
export const DEMO_CRM_LEADS: DemoCrmLead[] = [
	{
		id: "demo-lead-minji",
		name: "Minji Park",
		phone: "+84901234567",
		outcome: "open",
		reason: null,
		link: null,
	},
	{
		id: "demo-lead-yuki",
		name: "Yuki Tanaka",
		phone: null,
		outcome: "open",
		reason: null,
		link: null,
	},
	{
		id: "demo-lead-alexei",
		name: "Alexei Volkov",
		phone: "+84907654321",
		outcome: "lost",
		reason: "Chose a Ciputra villa from another agency",
		link: "demo-ru-ciputra",
	},
	{
		id: "demo-lead-thao",
		name: "Nguyễn Thị Thảo",
		phone: null,
		outcome: "open",
		reason: null,
		link: "demo-vi-tayho",
	},
];

/** Connects `officeId` to the mock CRM with the demo leads and links. Safe to re-run. */
export async function seedCrm(officeId: string): Promise<void> {
	const { store } = getRuntime();
	await store.setCrmConnection(officeId, "mock");
	const now = new Date();
	for (const lead of DEMO_CRM_LEADS) {
		const outcomeAt = lead.outcome === "open" ? null : now;
		await store.upsertMockCrmLead({
			id: lead.id,
			officeId,
			name: lead.name,
			phone: lead.phone,
			outcome: lead.outcome,
			outcomeAt: outcomeAt?.toISOString() ?? null,
			outcomeReason: lead.reason,
		});
		const thread = lead.link ? DEMO_THREADS.find((t) => t.guestId === lead.link) : undefined;
		if (!thread) continue;
		const id = conversationId(officeId, thread.pipe, thread.guestId);
		await store.saveCrmLink(id, {
			kind: "mock",
			leadId: lead.id,
			leadName: lead.name,
			method: "manual",
			checkedAt: now,
		});
		await store.saveCrmOutcomes(
			[{ conversationId: id, outcome: lead.outcome, outcomeAt, outcomeReason: lead.reason }],
			now,
		);
	}
}
