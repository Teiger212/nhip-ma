import { conversationId } from "@repo/database/inbox";

import { injectDevInbound } from "./inbox";
import { getRuntime } from "./runtime";
import type { Conversation, Pipe } from "./types";

export type DemoThread = {
	pipe: Pipe;
	guestId: string;
	guestName: string;
	text: string;
};

/** Invented walkthrough threads. Not real guests. Not Hạnh. */
export const DEMO_THREADS: DemoThread[] = [
	{
		pipe: "whatsapp",
		guestId: "demo-ko-stay",
		guestName: "Minji",
		text: "안녕하세요. 한국인입니다. currently in Hanoi. Tay Ho에서 3 nights vs monthly stay 고민이에요. this Friday. 2 bedroom.",
	},
	{
		pipe: "whatsapp",
		guestId: "demo-jp-buy",
		guestName: "Yuki",
		text: "こんにちは。日本人です。currently in Hanoi. Tay Hoで購入を考えています。Can foreigners get a pink book / sổ hồng?",
	},
	{
		pipe: "whatsapp",
		guestId: "demo-ru-ciputra",
		guestName: "Alexei",
		text: "Здравствуйте. Я русский, сейчас в Ханое. Ищу аренду в Ciputra, 2 bedroom, $2000/month.",
	},
	{
		pipe: "zalo",
		guestId: "demo-vi-tayho",
		guestName: "Thảo",
		text: "Em muốn thuê căn 2 ngủ ở Tây Hồ từ đầu tháng 9, ngân sách 30 triệu",
	},
];

/** Writes the invented threads under `officeId` (the walk office by default). */
export async function seedInbox(officeId: string): Promise<Conversation[]> {
	const { store } = getRuntime();
	const result: Conversation[] = [];
	for (const thread of DEMO_THREADS) {
		const id = conversationId(thread.pipe, thread.guestId);
		const existing = await store.getConversation(id);
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
			}),
		);
	}
	return result;
}
