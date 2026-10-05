import { mockAlertTransport } from "./guest-alerts/transport";
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
 * thread that exists (by office, pipe, guest) is left alone unless `reset` rewrites it. Its
 * alerts are decided and logged, and never pushed, whatever SEND_MODE says (#134, Q3): a seed
 * run must not reach a real device.
 */
export async function seedInbox(
	officeId: string,
	{ reset = false, now = Date.now() }: { reset?: boolean; now?: number } = {},
): Promise<Conversation[]> {
	const { store } = getRuntime();
	const viewer = { userId: "seed", officeId, role: "manager" } as const;
	// A demo thread is found by (office, pipe, guest), as inbound finds it: its id is opaque.
	const demoThreadOf = (owned: Conversation[], thread: DemoThread) =>
		owned.find(
			(conversation) =>
				conversation.pipe === thread.pipe && conversation.guestId === thread.guestId,
		);
	if (reset) {
		// Rewrite the demo threads as of `now`, so the fresh pair is back in Your turn.
		const owned = await store.listConversations(viewer);
		await store.deleteConversations(
			officeId,
			DEMO_THREADS.flatMap((thread) => demoThreadOf(owned, thread)?.id ?? []),
		);
	}
	const owned = await store.listConversations(viewer);
	const result: Conversation[] = [];
	for (const thread of DEMO_THREADS) {
		const existing = demoThreadOf(owned, thread);
		if (existing) {
			result.push(existing);
			continue;
		}
		result.push(
			await injectDevInbound(
				{
					pipe: thread.pipe,
					guestId: thread.guestId,
					guestName: thread.guestName,
					text: thread.text,
					officeId,
					at: now - thread.hoursAgo * 60 * 60 * 1000,
				},
				{ alerts: mockAlertTransport },
			),
		);
	}
	return result;
}
