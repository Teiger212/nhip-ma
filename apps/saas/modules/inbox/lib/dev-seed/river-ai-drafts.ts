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
	generatedAt: "2026-10-10",
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
		minjun: {
			reply:
				"헬스장이 있는 건물 위주로 Hai Bà Trưng 지역 1 bedroom 후보를 찾아 보내드리겠습니다. 반려견 허용 여부는 건물마다 달라서 후보별로 확인해서 알려드리겠습니다. 토요일 방문은 제 일정을 확인한 뒤 가능한 시간을 확인해서 바로 알려드리겠습니다.",
			officeReply:
				"I'll pull together 1-bedroom options in Hai Bà Trưng, prioritizing buildings with a gym. I'll check with each building whether pets are allowed, since it varies, and report back per option. I'll check my schedule for Saturday and confirm a viewing time once I have it.",
		},
		harper: {
			reply:
				"Thanks Harper, noted on the garden and garage. I'll look for 3-bedroom houses with both and check the usual lease length for Long Bien, then send it over with the options. I'll also confirm whether we can arrange a couple of viewings next Tuesday and get back to you on timing.",
			officeReply:
				"Thanks Harper, noted on the garden and garage. I'll look for 3-bedroom houses with both and check the usual lease length for Long Bien, then send it over with the options. I'll also confirm whether we can arrange a couple of viewings next Tuesday and get back to you on timing.",
		},
		yuna: {
			reply:
				"ありがとうございます。駅に近く、エレベーター付きのBa Dinhの1ベッドルームを中心に探して、候補をご案内します。来週水曜日の内見は、物件と日程を確認してから改めてご連絡いたします。",
			officeReply:
				"Thank you. I'll look for 1-bedroom places in Ba Đình near a station with an elevator and send you options. I'll check whether a viewing next Wednesday works and confirm with you.",
		},
		rowan: {
			reply:
				"Thanks, Rowan. I'll check which international schools are near Ciputra and send you the options. I'll also see whether video tours of the 3-bedroom places can be arranged before you fly in, and confirm the details with you.",
			officeReply:
				"Thanks, Rowan. I'll check which international schools are near Ciputra and send you the options. I'll also see whether video tours of the 3-bedroom places can be arranged before you fly in, and confirm the details with you.",
		},
	},
};
