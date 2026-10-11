/**
 * The river office's model drafts (#302, ADR 0024): written once by the real draft model, from
 * the same prompt and thread context the app builds, kept only when the post-check passed them.
 * `pnpm seed` plays these as the model's drafts and calls no model. Generated, not hand-written:
 * `pnpm seed:drafts` (see `scripts/generate-demo-drafts.ts`) rewrites this file.
 */
export type AiDraftFixture = {
	/** The reply, in the guest's language (English for one Nhịp doesn't support). */
	reply: string;
	/** The same reply in the office language, the operator line. */
	officeReply: string;
};

export type AiDraftFixtures = {
	/** The model that wrote the drafts: always the draft default (ADR 0024), never a local override. */
	model: string;
	/** The day they were generated, YYYY-MM-DD. */
	generatedAt: string;
	drafts: Record<string, AiDraftFixture>;
};

export const RIVER_AI_DRAFTS: AiDraftFixtures = {
	model: "anthropic/claude-haiku-5.5",
	generatedAt: "2026-10-11",
	drafts: {
		mai: {
			reply:
				"Dạ, em sẽ gửi ảnh căn 1 phòng ngủ ở Hoàn Kiếm cho chị ngay ạ. Về ban công, em sẽ kiểm tra lại với chủ nhà rồi báo chị sớm nhất. Nếu chị muốn, em cũng có thể tìm thêm vài căn có ban công ở Hoàn Kiếm để chị so sánh.",
			officeReply:
				"Sure, I'll send the photos of the 1-bedroom in Hoàn Kiếm right away. I'll check with the landlord about the balcony and get back to her as soon as I have an answer. If she wants, I can also pull together a few other Hoàn Kiếm places with balconies for her to compare.",
		},
		emma: {
			reply:
				"Thanks, Emma. I'll look for 2-bedrooms in Tây Hồ with a balcony and a lift, and check which ones allow cats. I'll confirm whether any can be viewed this weekend and send you the options.",
			officeReply:
				"Thanks, Emma. I'll look for 2-bedrooms in Tây Hồ with a balcony and a lift, and check which ones allow cats. I'll confirm whether any can be viewed this weekend and send you the options.",
		},
		quang: {
			reply:
				"Dạ, em ghi nhận anh cần căn gần trường tiểu học và có chỗ đỗ ô tô ạ. Em sẽ lọc các căn 2 phòng ngủ ở Cầu Giấy quanh 12 triệu đáp ứng cả hai điều kiện này rồi gửi anh. Về lịch xem nhà cuối tuần này, em sẽ kiểm tra và xác nhận lại với anh ạ.",
			officeReply:
				"Noted: the client needs a place near a primary school with car parking. I'll shortlist 2-bedroom units in Cầu Giấy around 12 million VND/month that meet both and send them over. I'll check whether a viewing this weekend is possible and confirm back with him.",
		},
		harper: {
			reply:
				"Thanks Harper, noted on the garden and garage. I'll look for 3-bedroom houses with both and check the usual lease length for Long Bien, then send it over with the options. I'll also confirm whether we can arrange a couple of viewings next Tuesday and get back to you on timing.",
			officeReply:
				"Thanks Harper, noted on the garden and garage. I'll look for 3-bedroom houses with both and check the usual lease length for Long Bien, then send it over with the options. I'll also confirm whether we can arrange a couple of viewings next Tuesday and get back to you on timing.",
		},
		rowan: {
			reply:
				"Thanks, Rowan. I'll check which international schools are near Ciputra and send you the options. I'll also see whether video tours of the 3-bedroom places can be arranged before you fly in, and confirm the details with you.",
			officeReply:
				"Thanks, Rowan. I'll check which international schools are near Ciputra and send you the options. I'll also see whether video tours of the 3-bedroom places can be arranged before you fly in, and confirm the details with you.",
		},
		"emma-2": {
			reply:
				"Noted, Emma, a weekend afternoon works. I'll check which Tây Hồ 2-bedrooms with a balcony, a lift and cat-friendly rules can be viewed this weekend in the afternoon, and confirm the times with you. If none fit, I'll look at the following weekend instead.",
			officeReply:
				"Noted, Emma, a weekend afternoon works. I'll check which Tây Hồ 2-bedrooms with a balcony, a lift and cat-friendly rules can be viewed this weekend in the afternoon, and confirm the times with you. If none fit, I'll look at the following weekend instead.",
		},
		"quang-2": {
			reply:
				"Dạ vâng anh, em sẽ lọc và gửi ảnh các căn 2 phòng ngủ ở Cầu Giấy gần trường tiểu học, có chỗ đỗ ô tô, quanh mức 12 triệu cho anh sớm nhất có thể ạ. Lịch xem nhà cuối tuần em cũng sẽ kiểm tra và xác nhận lại với anh.",
			officeReply:
				"Noted, I'll filter and send photos of 2-bedroom places in Cầu Giấy near a primary school with car parking, around 12 million, as soon as possible. I'll also check the weekend viewing schedule and confirm back with him.",
		},
		"harper-2": {
			reply:
				"Thanks Harper, I'll send photos of 3-bedroom houses in Long Bien with a garden and garage, within your $2,000 monthly budget. I'll confirm the Tuesday viewings and the usual lease length once I've checked, and let you know.",
			officeReply:
				"Thanks Harper, I'll send photos of 3-bedroom houses in Long Bien with a garden and garage, within your $2,000 monthly budget. I'll confirm the Tuesday viewings and the usual lease length once I've checked, and let you know.",
		},
		minjun: {
			reply:
				"Thanks, Min-jun. I'll look for 1-bedroom places in Hai Ba Trung with a gym in the building, and I'll check with the landlords whether they accept dogs. I'll also confirm whether a viewing this Saturday is possible once I've checked with the owners.",
			officeReply:
				"Thanks, Min-jun. I'll look for 1-bedroom places in Hai Ba Trung with a gym in the building, and I'll check with the landlords whether they accept dogs. I'll also confirm whether a viewing this Saturday is possible once I've checked with the owners.",
		},
		"minjun-2": {
			reply:
				"Sure, Min-jun. I'll pull together photos of 1-bedroom places in Hai Ba Trung with a gym in the building and send them over. I'll confirm the dog question with each landlord before I send, so you know which ones are pet-friendly.",
			officeReply:
				"Sure, Min-jun. I'll pull together photos of 1-bedroom places in Hai Ba Trung with a gym in the building and send them over. I'll confirm the dog question with each landlord before I send, so you know which ones are pet-friendly.",
		},
		yuna: {
			reply:
				"Thanks, Yuna. I'll look for 1-bedroom rentals in Ba Dinh near a station with an elevator, within your $1,100/month budget. I'll check whether a viewing on Wednesday next week is possible and confirm the time with you.",
			officeReply:
				"Thanks, Yuna. I'll look for 1-bedroom rentals in Ba Dinh near a station with an elevator, within your $1,100/month budget. I'll check whether a viewing on Wednesday next week is possible and confirm the time with you.",
		},
	},
};
