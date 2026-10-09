import {
	RIVER_AGENT2_EMAIL,
	RIVER_AGENT_EMAIL,
	RIVER_MANAGER_EMAIL,
	RIVER_OFFICE_ID,
} from "../demo-user";
import {
	assigns,
	daysAgo,
	draftWaits,
	hoursAgo,
	minutesAgo,
	replies,
	repliesAi,
	type SeedGuest,
	type SeedOffice,
	writes,
} from "./story";

/**
 * The second office's invented guests (#69): its own manager and agents, its own queue, with the
 * auto-reply off (so nobody here is greeted) and no CRM. Its operators see none of the walk
 * office's threads, and the walk office's none of these. Nothing here is a real guest.
 */
const guests: SeedGuest[] = [
	// Unassigned
	{
		pipe: "zalo",
		guestId: "zalo-demo-nga",
		name: "Nga",
		story: [
			writes(
				minutesAgo(20),
				"Chào bạn, mình cần thuê căn 2 phòng ngủ ở Times City, khoảng 14 triệu, tuần sau.",
				{ en: "Hi, I need to rent a 2-bedroom in Times City, around 14 million, next week." },
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550102",
		name: "Oliver",
		story: [
			writes(
				hoursAgo(4),
				"Hi! British engineer here, contract in Hanoi from next month. 1 bedroom to rent near Hoan Kiem, $900/month.",
				{
					vi: "Chào bạn! Tôi là kỹ sư người Anh, có hợp đồng ở Hà Nội từ tháng sau. Cần thuê căn 1 phòng ngủ gần Hoàn Kiếm, 900 USD/tháng.",
				},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550103",
		name: "Soo-ah",
		story: [
			writes(
				daysAgo(3),
				"안녕하세요. 한국인 가족입니다, family of 3. Ciputra에서 3 bedroom 임대 원합니다. 다음 달 입주.",
				{
					en: "Hello. We're a Korean family, a family of 3. We'd like to rent a 3-bedroom in Ciputra. Moving in next month.",
					vi: "Xin chào. Chúng tôi là gia đình người Hàn, 3 người. Muốn thuê căn 3 phòng ngủ ở Ciputra. Dọn vào tháng sau.",
				},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550104",
		name: "Anastasia",
		story: [
			writes(
				hoursAgo(2),
				"Здравствуйте! Ищу аренду в Tay Ho, studio, на этой неделе, до $650/month.",
				{
					en: "Hello! I'm looking for a rental in Tay Ho, a studio, this week, up to $650/month.",
					vi: "Xin chào! Tôi tìm thuê ở Tây Hồ, một studio, trong tuần này, tối đa 650 USD/tháng.",
				},
			),
		],
	},
	// The first agent's
	{
		pipe: "whatsapp",
		guestId: "14155550105",
		name: "Ryo",
		story: [
			writes(
				hoursAgo(1),
				"こんにちは。日本人です。Long Bienで2 bedroomの賃貸を探しています。来週内見希望です。",
				{
					en: "Hello. I'm Japanese. I'm looking to rent a 2-bedroom in Long Bien. I'd like to view next week.",
					vi: "Xin chào. Tôi là người Nhật. Tôi tìm thuê căn 2 phòng ngủ ở Long Biên. Muốn xem nhà vào tuần sau.",
				},
			),
			assigns(minutesAgo(55), "agent"),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-duc",
		name: "Đức",
		story: [
			writes(
				hoursAgo(40),
				"Anh ơi, em muốn mua căn hộ 3 phòng ngủ ở Ecopark, cần hỏi về pháp lý trước.",
				{
					en: "Hi, I'd like to buy a 3-bedroom apartment in Ecopark; I need to ask about the legal side first.",
				},
			),
			assigns(hoursAgo(39), "agent"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550107",
		name: "Chloé",
		story: [
			writes(
				daysAgo(5),
				"Bonjour ! Je suis française, je cherche un 2 bedroom to rent à Ba Dinh, budget $1400/month, next month.",
				{},
			),
			assigns(daysAgo(5) - minutesAgo(4), "agent"),
			replies(
				daysAgo(5) - minutesAgo(6),
				"agent",
				"Bonjour Chloé! We have a 2-bedroom in Ba Dinh at $1350/month. Would Friday suit you for a viewing?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550108",
		name: "Jun",
		story: [
			writes(
				daysAgo(9),
				"你好，我是 Chinese，想在 Cau Giay rent 一套 studio，预算 $600/month，this week 能看吗？",
				{},
			),
			assigns(daysAgo(9) - minutesAgo(10), "agent"),
			replies(
				daysAgo(9) - minutesAgo(30),
				"agent",
				"Hello Jun! There is a studio in Cau Giay at $580/month. Would Thursday at 5 pm suit you for a viewing?",
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-mai",
		name: "Mai",
		story: [
			writes(
				daysAgo(3),
				"Chào bạn, mình cần thuê căn 1 phòng ngủ ở Hoàn Kiếm, khoảng 13 triệu, đầu tháng sau.",
				{ en: "Hi, I need to rent a 1-bedroom in Hoàn Kiếm, around 13 million, early next month." },
			),
			assigns(daysAgo(3) - minutesAgo(5), "agent"),
			replies(
				daysAgo(3) - minutesAgo(11),
				"agent",
				"Chào chị Mai, bên em có căn 1 phòng ngủ ở Hoàn Kiếm giá 12,5 triệu. Chị muốn xem ảnh không ạ?",
			),
			writes(hoursAgo(5), "Gửi mình ảnh nhé, căn đó có ban công không bạn?", {
				en: "Send me the photos, please. Does that one have a balcony?",
			}),
			// The office has replied by hand, so the model drafts this one (ADR 0024): it waits.
			draftWaits(hoursAgo(5) - minutesAgo(1), "mai"),
		],
	},
	// The second agent's
	{
		pipe: "whatsapp",
		guestId: "14155550110",
		name: "Ben",
		story: [
			writes(
				hoursAgo(6),
				"Hey, Australian couple, moving next month. Looking to rent a 2 bedroom in Tay Ho around $1200/month.",
				{
					vi: "Chào bạn, chúng tôi là cặp đôi người Úc, chuyển đến vào tháng sau. Tìm thuê căn 2 phòng ngủ ở Tây Hồ khoảng 1200 USD/tháng.",
				},
			),
			assigns(hoursAgo(5.5), "agent2"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550111",
		name: "Haeun",
		story: [
			writes(
				daysAgo(6),
				"안녕하세요! 한국인입니다. Hai Ba Trung에서 1 bedroom 월세 있나요? 예산 $800/month.",
				{
					en: "Hello! I'm Korean. Is there a 1-bedroom for monthly rent in Hai Ba Trung? Budget $800/month.",
					vi: "Xin chào! Tôi là người Hàn. Ở Hai Bà Trưng có căn 1 phòng ngủ cho thuê theo tháng không? Ngân sách 800 USD/tháng.",
				},
			),
			assigns(daysAgo(6) - minutesAgo(1), "agent2"),
			replies(
				daysAgo(6) - minutesAgo(2),
				"agent2",
				"안녕하세요! Hai Ba Trung에 $780 1 bedroom이 있습니다. 사진 보내드릴까요?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550112",
		name: "Ivan",
		story: [
			writes(
				daysAgo(17),
				"Добрый день. Ищу квартиру в аренду в Ciputra, 3 bedroom, $2500/month, в следующем месяце.",
				{
					en: "Good afternoon. I'm looking for a flat to rent in Ciputra, 3 bedrooms, $2500/month, next month.",
					vi: "Chào buổi chiều. Tôi tìm thuê căn hộ ở Ciputra, 3 phòng ngủ, 2500 USD/tháng, vào tháng sau.",
				},
			),
			assigns(daysAgo(17) - minutesAgo(10), "agent2"),
			replies(
				daysAgo(17) - minutesAgo(70),
				"agent2",
				"Добрый день, Иван! В Ciputra есть квартира с 3 спальнями за $2400. Отправить фото?",
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-trang",
		name: "Trang",
		story: [
			writes(
				daysAgo(4),
				"Chào em, chị muốn thuê nhà nguyên căn ở Long Biên cho gia đình 4 người, khoảng 25 triệu.",
				{
					en: "Hi, I'd like to rent a whole house in Long Biên for a family of four, around 25 million.",
				},
			),
			assigns(daysAgo(4) - minutesAgo(30), "agent2"),
		],
	},
	// The manager's own
	{
		pipe: "whatsapp",
		guestId: "14155550114",
		name: "Noah",
		story: [
			writes(
				daysAgo(1),
				"Hi there, Canadian student, need a studio to rent near Cau Giay for 6 months from mid November, $450/month.",
				{
					vi: "Chào bạn, tôi là sinh viên người Canada, cần thuê một studio gần Cầu Giấy trong 6 tháng từ giữa tháng 11, 450 USD/tháng.",
				},
			),
			replies(
				daysAgo(1) - minutesAgo(16),
				"manager",
				"Hi Noah! We have two studios near Cau Giay around $450/month on a 6-month lease. Shall I send them over?",
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-hoa",
		name: "Hoa",
		story: [
			writes(
				daysAgo(21),
				"Chào bạn, mình muốn mua căn 2 phòng ngủ ở Times City để đầu tư, khoảng 4 tỷ.",
				{ en: "Hi, I'd like to buy a 2-bedroom in Times City as an investment, around 4 billion." },
			),
			replies(
				daysAgo(21) - minutesAgo(4),
				"manager",
				"Chào chị Hoa, bên em có ba căn 2 phòng ngủ ở Times City quanh 4 tỷ. Em gửi chị thông tin nhé.",
			),
		],
	},
	// The model's drafts (#302, ADR 0024). The office's first reply on each is typed by hand
	// (the auto-reply is off here, and a first reply is never a model's); the later turns are
	// the model's, written once by the real model (`river-ai-drafts.ts`, `pnpm seed:drafts`).
	// A model draft, approved and sent as it stood; the guest has written back since.
	{
		pipe: "whatsapp",
		guestId: "14155550116",
		name: "Emma",
		story: [
			writes(
				daysAgo(4),
				"Hi, I'm relocating to Hanoi for work in January. Looking to rent a 2-bedroom in Tay Ho, budget around $1,500 a month.",
				{
					vi: "Chào bạn, tôi chuyển đến Hà Nội làm việc vào tháng 1. Tôi tìm thuê căn 2 phòng ngủ ở Tây Hồ, ngân sách khoảng 1.500 USD/tháng.",
				},
			),
			assigns(daysAgo(4) - minutesAgo(8), "agent"),
			replies(
				daysAgo(4) - minutesAgo(20),
				"agent",
				"Hi Emma, River Agent here from River Office. I'll look for 2-bedrooms in Tay Ho around your budget and send you a few options.",
			),
			writes(
				daysAgo(3),
				"Thanks! Ideally a place with a balcony and a lift, and my cat is coming with me. Could we view something this weekend?",
				{
					vi: "Cảm ơn bạn! Tốt nhất là căn có ban công và thang máy, và con mèo của tôi sẽ đi cùng. Cuối tuần này mình có thể xem nhà không?",
				},
			),
			repliesAi(daysAgo(3) - minutesAgo(15), "agent", "emma"),
			writes(hoursAgo(20), "Great, thank you. A weekend afternoon would work best for us.", {
				vi: "Tuyệt, cảm ơn bạn. Chiều cuối tuần là hợp nhất với chúng tôi.",
			}),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-quang",
		name: "Quang",
		story: [
			writes(
				daysAgo(6),
				"Chào em, anh cần thuê căn hộ 2 phòng ngủ ở Cầu Giấy, khoảng 12 triệu một tháng, cho gia đình 3 người.",
				{
					en: "Hi, I need to rent a 2-bedroom apartment in Cầu Giấy, around 12 million a month, for a family of three.",
				},
			),
			assigns(daysAgo(6) - minutesAgo(6), "agent2"),
			replies(
				daysAgo(6) - minutesAgo(18),
				"agent2",
				"Chào anh Quang, em là River Agent Two bên River Office. Em sẽ tìm vài căn 2 phòng ngủ ở Cầu Giấy quanh mức anh nói rồi gửi anh ạ.",
			),
			writes(
				daysAgo(5),
				"Cảm ơn em. Anh muốn căn gần trường tiểu học và có chỗ để ô tô. Cuối tuần này anh đi xem nhà được không em?",
				{
					en: "Thank you. I'd like a place near a primary school with room to park a car. Can I go and view one this weekend?",
				},
			),
			repliesAi(daysAgo(5) - minutesAgo(14), "agent2", "quang"),
			writes(hoursAgo(30), "Ok em, anh chờ ảnh nhé.", { en: "Ok, I'll wait for the photos." }),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550117",
		name: "Min-jun",
		story: [
			writes(
				daysAgo(8),
				"안녕하세요. 한국인 회사원입니다. Hai Ba Trung 지역에서 1 bedroom 월세를 찾고 있습니다. 예산은 $900/month입니다.",
				{
					en: "Hello. I'm a Korean office worker. I'm looking for a 1-bedroom to rent in Hai Bà Trưng. My budget is $900/month.",
					vi: "Xin chào. Tôi là nhân viên văn phòng người Hàn. Tôi tìm thuê căn 1 phòng ngủ ở Hai Bà Trưng. Ngân sách của tôi là 900 USD/tháng.",
				},
			),
			assigns(daysAgo(8) - minutesAgo(7), "agent"),
			replies(
				daysAgo(8) - minutesAgo(25),
				"agent",
				"안녕하세요 Min-jun님! River Office의 River Agent입니다. Hai Ba Trung 지역 1 bedroom 후보를 찾아서 보내드리겠습니다.",
			),
			writes(
				daysAgo(7),
				"감사합니다. 헬스장이 있는 건물이면 좋겠어요. 반려견도 괜찮을까요? 이번 주 토요일에 볼 수 있을까요?",
				{
					en: "Thank you. A building with a gym would be nice. Would a dog be ok? Could I see one this Saturday?",
					vi: "Cảm ơn bạn. Tốt nhất là tòa nhà có phòng gym. Nuôi chó có được không? Thứ Bảy này tôi có thể xem nhà không?",
				},
			),
			repliesAi(daysAgo(7) - minutesAgo(13), "agent", "minjun"),
			writes(hoursAgo(26), "네, 사진 먼저 보내주세요.", {
				en: "Yes, please send the photos first.",
				vi: "Vâng, hãy gửi ảnh trước cho tôi.",
			}),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550118",
		name: "Harper",
		story: [
			writes(
				daysAgo(10),
				"Hello! My partner and I are looking to rent a 3-bedroom house in Long Bien, budget about $2,000 a month, from December.",
				{
					vi: "Xin chào! Tôi và bạn đời đang tìm thuê một căn nhà 3 phòng ngủ ở Long Biên, ngân sách khoảng 2.000 USD/tháng, từ tháng 12.",
				},
			),
			assigns(daysAgo(10) - minutesAgo(9), "agent2"),
			replies(
				daysAgo(10) - minutesAgo(22),
				"agent2",
				"Hi Harper, River Agent Two from River Office here. I'll put together a few 3-bedroom houses in Long Bien and send them over.",
			),
			writes(
				daysAgo(9),
				"Thank you! A garden and a garage would be great. What is the usual lease length, and could we see a couple of places next Tuesday?",
				{
					vi: "Cảm ơn bạn! Có vườn và gara thì tuyệt. Thời hạn thuê thông thường là bao lâu, và thứ Ba tuần sau chúng tôi có thể xem vài căn không?",
				},
			),
			repliesAi(daysAgo(9) - minutesAgo(16), "agent2", "harper"),
			writes(hoursAgo(50), "Perfect, looking forward to the photos.", {
				vi: "Tuyệt vời, tôi mong chờ những bức ảnh.",
			}),
		],
	},
	// A model draft waits in the reply box for the guest's latest message.
	{
		pipe: "whatsapp",
		guestId: "14155550119",
		name: "Yuna",
		story: [
			writes(
				daysAgo(2),
				"こんにちは。日本人です。Ba Dinhで1 bedroomの賃貸を探しています。予算は$1,100/monthです。",
				{
					en: "Hello. I'm Japanese. I'm looking to rent a 1-bedroom in Ba Dinh. My budget is $1,100/month.",
					vi: "Xin chào. Tôi là người Nhật. Tôi tìm thuê căn 1 phòng ngủ ở Ba Đình. Ngân sách của tôi là 1.100 USD/tháng.",
				},
			),
			assigns(daysAgo(2) - minutesAgo(5), "agent"),
			replies(
				daysAgo(2) - minutesAgo(17),
				"agent",
				"Yunaさん、こんにちは。River OfficeのRiver Agentです。Ba Dinhで1 bedroomの候補を探して、ご連絡します。",
			),
			writes(
				hoursAgo(3),
				"ありがとうございます。駅から近くて、エレベーターがある物件が希望です。来週の水曜日に内見できますか？",
				{
					en: "Thank you. I'd like a place close to a station, with a lift. Could I view one next Wednesday?",
					vi: "Cảm ơn bạn. Tôi muốn căn gần ga và có thang máy. Thứ Tư tuần sau tôi có thể xem nhà không?",
				},
			),
			draftWaits(hoursAgo(3) - minutesAgo(1), "yuna"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "14155550120",
		name: "Rowan",
		story: [
			writes(
				daysAgo(1),
				"Hi, Rowan here. Moving from Singapore with a toddler. Looking to rent a 3-bedroom in Ciputra, up to $2,300 a month, from January.",
				{
					vi: "Chào bạn, tôi là Rowan. Tôi chuyển từ Singapore đến cùng một bé nhỏ. Tôi tìm thuê căn 3 phòng ngủ ở Ciputra, tối đa 2.300 USD/tháng, từ tháng 1.",
				},
			),
			assigns(daysAgo(1) - minutesAgo(11), "agent2"),
			replies(
				daysAgo(1) - minutesAgo(24),
				"agent2",
				"Hi Rowan, River Agent Two from River Office. I'll look for 3-bedrooms in Ciputra within your budget and send you a few.",
			),
			writes(
				hoursAgo(2),
				"Thanks. Is there a good international school nearby, and could we do a video tour before we fly in?",
				{
					vi: "Cảm ơn bạn. Gần đó có trường quốc tế tốt không, và chúng tôi có thể xem nhà qua video trước khi bay sang không?",
				},
			),
			draftWaits(hoursAgo(2) - minutesAgo(1), "rowan"),
		],
	},
];

export const RIVER_SEED_OFFICE: SeedOffice = {
	officeId: RIVER_OFFICE_ID,
	operators: {
		agent: RIVER_AGENT_EMAIL,
		agent2: RIVER_AGENT2_EMAIL,
		manager: RIVER_MANAGER_EMAIL,
	},
	mockCrm: false,
	autoReply: false,
	crmLeads: [],
	guests,
};
