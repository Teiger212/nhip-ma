import { DEMO_THREADS } from "../seed";
import {
	WALK_AGENT2_EMAIL,
	WALK_MANAGER_EMAIL,
	WALK_OFFICE_ID,
	WALK_USER_EMAIL,
} from "../walk-user";
import {
	assigns,
	crmMarks,
	daysAgo,
	hoursAgo,
	minutesAgo,
	replies,
	type SeedGuest,
	type SeedOffice,
	type Translations,
	writes,
} from "./story";

/**
 * The walk office's invented guests (#69): the walk's four demo threads, then about forty more
 * over the last 30 days, in every Inbox, CRM and alert state. The auto-reply is on (no settings
 * row: the default) and the CRM is the mock CRM. Nothing here is a real guest.
 */

/** The walk's demo threads (`DEMO_THREADS`), as they are, with their translations and owners. */
const DEMO_STORIES: Record<
	string,
	{ translations: Translations; owner: "agent" | "agent2" | null }
> = {
	"demo-ko-stay": {
		owner: "agent",
		translations: {
			en: "Hello. I'm Korean, currently in Hanoi. I'm torn between 3 nights and a monthly stay in Tay Ho. This Friday. 2 bedrooms.",
			vi: "Xin chào. Tôi là người Hàn, hiện đang ở Hà Nội. Tôi đang phân vân giữa ở 3 đêm hay thuê theo tháng ở Tây Hồ. Thứ Sáu này. 2 phòng ngủ.",
		},
	},
	"demo-jp-buy": {
		owner: "agent2",
		translations: {
			en: "Hello. I'm Japanese, currently in Hanoi. I'm thinking of buying in Tay Ho. Can foreigners get a pink book / sổ hồng?",
			vi: "Xin chào. Tôi là người Nhật, hiện đang ở Hà Nội. Tôi đang tính mua nhà ở Tây Hồ. Người nước ngoài có được cấp sổ hồng không?",
		},
	},
	"demo-ru-ciputra": {
		owner: null,
		translations: {
			en: "Hello. I'm Russian, in Hanoi now. Looking to rent in Ciputra, 2 bedrooms, $2000/month.",
			vi: "Xin chào. Tôi là người Nga, đang ở Hà Nội. Tôi tìm thuê ở Ciputra, 2 phòng ngủ, 2000 USD/tháng.",
		},
	},
	"demo-vi-tayho": {
		owner: null,
		translations: {
			en: "I'd like to rent a 2-bedroom in Tây Hồ from early September, budget 30 million.",
		},
	},
};

const demoGuests: SeedGuest[] = DEMO_THREADS.map((thread) => {
	const demo = DEMO_STORIES[thread.guestId];
	const ago = hoursAgo(thread.hoursAgo);
	return {
		pipe: thread.pipe,
		guestId: thread.guestId,
		name: thread.guestName,
		story: [
			writes(ago, thread.text, demo.translations),
			...(demo.owner ? [assigns(ago - minutesAgo(3), demo.owner)] : []),
		],
	};
});

/** Waiting on a manager to give them to someone (ADR 0022): fresh, greeted, quiet, returned. */
const unassigned: SeedGuest[] = [
	{
		pipe: "zalo",
		guestId: "zalo-demo-quang",
		name: "Quang H.",
		greeted: true,
		story: [
			writes(
				hoursAgo(1.5),
				"Chào anh chị, em cần thuê căn hộ 3 phòng ngủ ở Ciputra, ngân sách khoảng 45 triệu/tháng, dọn vào đầu tháng 11.",
				{
					en: "Hello, I need to rent a 3-bedroom apartment in Ciputra, budget about 45 million a month, moving in early November.",
				},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550102",
		name: "Sophie",
		greeted: true,
		story: [
			writes(
				hoursAgo(3),
				"Bonjour ! Je suis française, currently in Hanoi. Je cherche un 2 bedroom to rent à Tay Ho, budget $1800/month, à partir de next month.",
				{},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550103",
		name: "Wei",
		greeted: true,
		story: [
			writes(
				hoursAgo(18),
				"你好！我是 Chinese，想在 Times City rent 一套 3 bedroom 公寓，预算 $2200/month，next week 可以看房吗？",
				{},
			),
		],
	},
	{
		// His number is on two leads in the CRM: matched to neither, "Not in CRM yet" (CONTEXT).
		pipe: "whatsapp",
		guestId: "12025550104",
		name: "Daniel",
		greeted: true,
		story: [
			writes(
				hoursAgo(27),
				"Hi there, Australian here, moving to Hanoi in 3 weeks with my partner. Looking to rent a 2 bedroom in Ba Dinh, around $1500/month.",
				{
					vi: "Chào bạn, tôi là người Úc, sẽ chuyển đến Hà Nội sau 3 tuần cùng bạn đời. Tôi tìm thuê căn 2 phòng ngủ ở Ba Đình, khoảng 1500 USD/tháng.",
				},
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-huong",
		name: "Hương",
		greeted: true,
		crmDown: true,
		story: [
			writes(
				hoursAgo(26),
				"Mình muốn mua căn hộ 2 phòng ngủ ở Vinhomes, cho mình hỏi giấy tờ sổ hồng thế nào ạ?",
				{
					en: "I'd like to buy a 2-bedroom apartment in Vinhomes. Could you tell me about the paperwork, the pink book?",
				},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550106",
		name: "Takeshi",
		greeted: true,
		story: [
			writes(
				hoursAgo(30),
				"はじめまして。日本人です。来月からハノイに赴任します。Cau Giayで3 bedroomの賃貸を探しています。予算は$2500/monthです。",
				{
					en: "Nice to meet you. I'm Japanese, posted to Hanoi from next month. I'm looking to rent a 3-bedroom in Cau Giay. My budget is $2500/month.",
					vi: "Rất vui được làm quen. Tôi là người Nhật, từ tháng sau sẽ chuyển công tác sang Hà Nội. Tôi tìm thuê căn 3 phòng ngủ ở Cầu Giấy. Ngân sách 2500 USD/tháng.",
				},
			),
		],
	},
	{
		// No profile name on WhatsApp: the Inbox shows the number.
		pipe: "whatsapp",
		guestId: "12025550107",
		name: null,
		story: [
			writes(
				daysAgo(4),
				"hello, do you have serviced apartments in the Old Quarter? studio or 1 bedroom, monthly rent",
				{
					vi: "xin chào, bên bạn có căn hộ dịch vụ ở Phố Cổ không? studio hoặc 1 phòng ngủ, thuê theo tháng",
				},
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-minhanh",
		name: "Minh Anh",
		story: [
			writes(
				daysAgo(6),
				"Bên mình còn căn studio nào ở Đống Đa không ạ? Em thuê dài hạn, tầm 12 triệu.",
				{
					en: "Do you still have any studios in Đống Đa? I'd rent long term, around 12 million.",
				},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550109",
		name: "Olga",
		story: [
			writes(
				daysAgo(9),
				"Добрый день! Мы семья из России, family of 4, ищем аренду в Ecopark, 3 bedroom, на этой неделе хотим посмотреть.",
				{
					en: "Good afternoon! We're a family from Russia, a family of 4, looking to rent in Ecopark, 3 bedrooms; we'd like to view this week.",
					vi: "Chào buổi chiều! Chúng tôi là gia đình người Nga, 4 người, tìm thuê ở Ecopark, 3 phòng ngủ, muốn đi xem trong tuần này.",
				},
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550110",
		name: "Jae-won",
		greeted: true,
		story: [
			writes(
				minutesAgo(40),
				"안녕하세요, 한국인입니다. Long Bien에서 2 bedroom 월세 찾고 있어요. 예산 $1200/month, 다음 주 입주 희망합니다.",
				{
					en: "Hello, I'm Korean. I'm looking for a monthly rental, 2 bedrooms, in Long Bien. Budget $1200/month; I'd like to move in next week.",
					vi: "Xin chào, tôi là người Hàn. Tôi tìm thuê theo tháng căn 2 phòng ngủ ở Long Biên. Ngân sách 1200 USD/tháng, muốn dọn vào tuần sau.",
				},
			),
		],
	},
	{
		// Given to the second agent, then back to Unassigned: they get the "moved" bell row.
		pipe: "whatsapp",
		guestId: "12025550111",
		name: "Priya",
		story: [
			writes(
				hoursAgo(40),
				"Hello! Moving from Singapore for work. Need a 2 bedroom near Landmark 72, lease from 1 Dec, budget up to $2000.",
				{
					vi: "Xin chào! Tôi chuyển từ Singapore sang vì công việc. Cần căn 2 phòng ngủ gần Landmark 72, thuê từ 1/12, ngân sách tối đa 2000 USD.",
				},
			),
			assigns(hoursAgo(39.8), "agent2"),
			assigns(hoursAgo(20), null),
		],
	},
];

/** The first agent's (walk@nhip.local): Your turn, Quiet, Sent, written back, won. */
const firstAgent: SeedGuest[] = [
	{
		pipe: "whatsapp",
		guestId: "12025550112",
		name: "Ji-ho",
		greeted: true,
		story: [
			writes(
				hoursAgo(2),
				"안녕하세요! 한국 회사 주재원입니다. Tay Ho에서 3 bedroom 임대 찾고 있어요, family of 3, 예산 $2800/month.",
				{
					en: "Hello! I'm posted here by a Korean company. I'm looking to rent a 3-bedroom in Tay Ho, family of 3, budget $2800/month.",
					vi: "Xin chào! Tôi được công ty Hàn Quốc cử sang. Tôi tìm thuê căn 3 phòng ngủ ở Tây Hồ, gia đình 3 người, ngân sách 2800 USD/tháng.",
				},
			),
			assigns(hoursAgo(1.9), "agent"),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-bao",
		name: "Bảo",
		story: [
			writes(
				hoursAgo(31),
				"Anh ơi, em cần thuê căn 1 phòng ngủ ở Hoàn Kiếm, ngân sách 15 triệu, tuần sau em dọn vào được không?",
				{
					en: "Hi, I need to rent a 1-bedroom in Hoàn Kiếm, budget 15 million. Could I move in next week?",
				},
			),
			assigns(hoursAgo(30.5), "agent"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550114",
		name: "Hannah",
		story: [
			writes(
				daysAgo(3.5),
				"Hi, I'm British, relocating with my 2 kids. We need a 3 bedroom to rent near the international schools in Tay Ho, from early January.",
				{
					vi: "Chào bạn, tôi là người Anh, chuyển đến cùng 2 con. Chúng tôi cần thuê căn 3 phòng ngủ gần các trường quốc tế ở Tây Hồ, từ đầu tháng 1.",
				},
			),
			assigns(daysAgo(3.4), "agent"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550115",
		name: "Kenji",
		story: [
			writes(
				daysAgo(5),
				"こんにちは。日本人です。Vinhomesのマンション購入を考えています。外国人でもピンクブック (sổ hồng) はもらえますか？",
				{
					en: "Hello. I'm Japanese. I'm thinking of buying a flat in Vinhomes. Can a foreigner get a pink book (sổ hồng)?",
					vi: "Xin chào. Tôi là người Nhật. Tôi đang tính mua căn hộ ở Vinhomes. Người nước ngoài có được cấp sổ hồng không?",
				},
			),
			assigns(daysAgo(4.9), "agent"),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-tuan",
		name: "Tuấn",
		story: [
			writes(
				daysAgo(3),
				"Chào chị, em muốn thuê căn 2 phòng ngủ ở Cầu Giấy, khoảng 18 triệu, cuối tháng này em chuyển.",
				{
					en: "Hello, I'd like to rent a 2-bedroom in Cầu Giấy, around 18 million, moving at the end of this month.",
				},
			),
			assigns(daysAgo(3) - minutesAgo(3), "agent"),
			replies(
				daysAgo(3) - minutesAgo(6),
				"agent",
				"Chào anh Tuấn, bên em có hai căn 2 phòng ngủ ở Cầu Giấy trong tầm 18 triệu. Anh muốn xem vào ngày nào ạ?",
			),
		],
	},
	{
		// Her number is on a lead already in the CRM: linked to it, not a new one.
		pipe: "whatsapp",
		guestId: "12025550117",
		name: "Emily",
		story: [
			writes(
				daysAgo(6),
				"Hello again! We spoke last year. I'm back in Hanoi and want to rent a 2 bedroom in Ciputra, $1600/month, next month.",
				{
					vi: "Chào lại bạn! Chúng ta đã nói chuyện năm ngoái. Tôi đã quay lại Hà Nội và muốn thuê căn 2 phòng ngủ ở Ciputra, 1600 USD/tháng, từ tháng sau.",
				},
			),
			assigns(daysAgo(6) - minutesAgo(4), "agent"),
			replies(
				daysAgo(6) - minutesAgo(12),
				"agent",
				"Welcome back, Emily! We have two 2-bedroom flats in Ciputra around $1600/month. Would Saturday morning suit you for a viewing?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550118",
		name: "Seo-yeon",
		story: [
			writes(
				daysAgo(11),
				"안녕하세요. 한국인 부부입니다. couple, Times City 근처 1 bedroom 월세 원해요. 예산 $900/month.",
				{
					en: "Hello. We're a Korean couple. We'd like a monthly rental, 1 bedroom, near Times City. Budget $900/month.",
					vi: "Xin chào. Chúng tôi là cặp vợ chồng người Hàn. Muốn thuê theo tháng căn 1 phòng ngủ gần Times City. Ngân sách 900 USD/tháng.",
				},
			),
			assigns(daysAgo(11) - minutesAgo(10), "agent"),
			replies(
				daysAgo(11) - minutesAgo(35),
				"agent",
				"안녕하세요! Times City 근처에 $900 안팎의 1 bedroom이 두 곳 있습니다. 이번 주에 보러 오시겠어요?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550119",
		name: "Mikhail",
		story: [
			writes(
				daysAgo(15),
				"Здравствуйте! Ищу квартиру в аренду, Hai Ba Trung, 1 bedroom, до $1000/month. Я в Ханое.",
				{
					en: "Hello! I'm looking for a flat to rent in Hai Ba Trung, 1 bedroom, up to $1000/month. I'm in Hanoi.",
					vi: "Xin chào! Tôi tìm thuê căn hộ ở Hai Bà Trưng, 1 phòng ngủ, tối đa 1000 USD/tháng. Tôi đang ở Hà Nội.",
				},
			),
			assigns(daysAgo(15) - minutesAgo(20), "agent"),
			replies(
				daysAgo(15) - hoursAgo(2),
				"agent",
				"Здравствуйте, Михаил! В Hai Ba Trung есть две квартиры с 1 спальней до $1000 в месяц. Когда вам удобно посмотреть?",
			),
		],
	},
	{
		// Answered, then wrote back: Your turn again, with the reply above.
		pipe: "whatsapp",
		guestId: "12025550120",
		name: "Claire",
		story: [
			writes(
				hoursAgo(50),
				"Bonjour, je suis française. Je cherche un 3 bedroom to rent à Ba Dinh, budget $3000/month.",
				{},
			),
			assigns(hoursAgo(49.9), "agent"),
			replies(
				hoursAgo(49.8),
				"agent",
				"Bonjour Claire! We have a 3-bedroom in Ba Dinh at $2900/month, newly renovated. Would you like photos first?",
			),
			writes(
				hoursAgo(3),
				"Oui, merci ! Photos please, and is a viewing possible this Saturday?",
				{},
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-linh",
		name: "Linh",
		story: [
			writes(daysAgo(20), "Chào bạn, mình tìm căn hộ 2 phòng ngủ ở Long Biên để mua, tầm 3 tỷ.", {
				en: "Hi, I'm looking to buy a 2-bedroom apartment in Long Biên, around 3 billion.",
			}),
			assigns(daysAgo(20) - minutesAgo(3), "agent"),
			replies(
				daysAgo(20) - minutesAgo(8),
				"agent",
				"Chào chị Linh, bên em có ba căn 2 phòng ngủ ở Long Biên quanh 3 tỷ. Chị muốn xem căn nào trước ạ?",
			),
			writes(
				daysAgo(20) - hoursAgo(1),
				"Cho mình xem căn ở tầng cao nhé, cuối tuần này được không?",
				{
					en: "Let me see the one on a high floor, please. Is this weekend OK?",
				},
			),
			replies(
				daysAgo(20) - hoursAgo(1.2),
				"agent",
				"Dạ được ạ, em hẹn chị sáng thứ Bảy lúc 9 giờ nhé.",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550122",
		name: "Haruto",
		story: [
			writes(
				daysAgo(18),
				"こんにちは。日本人です。Ciputraで3 bedroomの賃貸を探しています。来月入居希望、予算は$2400/monthです。",
				{
					en: "Hello. I'm Japanese. I'm looking to rent a 3-bedroom in Ciputra. I'd like to move in next month; budget $2400/month.",
					vi: "Xin chào. Tôi là người Nhật. Tôi tìm thuê căn 3 phòng ngủ ở Ciputra. Muốn dọn vào tháng sau, ngân sách 2400 USD/tháng.",
				},
			),
			assigns(daysAgo(18) - minutesAgo(5), "agent"),
			replies(
				daysAgo(18) - minutesAgo(20),
				"agent",
				"こんにちは！Ciputraに$2400前後の3 bedroomが2件ございます。今週ご内見はいかがでしょうか。",
			),
			crmMarks(daysAgo(6), "won"),
		],
	},
];

/** The second agent's (walk2@nhip.local): one moved from the first, lost, lost and back. */
const secondAgent: SeedGuest[] = [
	{
		// The first agent had it, then the manager moved it: the first agent's "moved" bell row.
		pipe: "whatsapp",
		guestId: "12025550123",
		name: "Isabelle",
		story: [
			writes(
				daysAgo(4),
				"Hi! Canadian couple looking for a furnished 1 bedroom in Tay Ho, lease from mid November, budget $1300/month.",
				{
					vi: "Chào bạn! Chúng tôi là cặp đôi người Canada, tìm căn 1 phòng ngủ có nội thất ở Tây Hồ, thuê từ giữa tháng 11, ngân sách 1300 USD/tháng.",
				},
			),
			assigns(daysAgo(4) - minutesAgo(5), "agent"),
			assigns(daysAgo(3), "agent2"),
			replies(
				daysAgo(3) - minutesAgo(15),
				"agent2",
				"Hi Isabelle, I'm taking over from my colleague. We have a furnished 1-bedroom by the lake at $1250/month. Shall I send photos?",
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-phuong",
		name: "Phương",
		greeted: true,
		story: [
			writes(
				hoursAgo(1),
				"Chào em, chị cần thuê nhà 3 phòng ngủ ở Tây Hồ cho gia đình 5 người, ngân sách 40 triệu.",
				{
					en: "Hi, I need to rent a 3-bedroom place in Tây Hồ for a family of five, budget 40 million.",
				},
			),
			assigns(minutesAgo(50), "agent2"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550125",
		name: "Dmitri",
		story: [
			writes(
				hoursAgo(38),
				"Привет! Ищу квартиру в аренду в Vinhomes, 2 bedroom, в следующем месяце, бюджет $1400/month.",
				{
					en: "Hi! I'm looking for a flat to rent in Vinhomes, 2 bedrooms, next month, budget $1400/month.",
					vi: "Chào bạn! Tôi tìm thuê căn hộ ở Vinhomes, 2 phòng ngủ, tháng sau, ngân sách 1400 USD/tháng.",
				},
			),
			assigns(hoursAgo(37.5), "agent2"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550126",
		name: "Yuna",
		story: [
			writes(
				hoursAgo(60),
				"안녕하세요. 하노이에 있는 한국인 학생입니다. Cau Giay 근처 studio 월세 있을까요? 예산 $500/month.",
				{
					en: "Hello. I'm a Korean student in Hanoi. Is there a studio for monthly rent near Cau Giay? Budget $500/month.",
					vi: "Xin chào. Tôi là sinh viên người Hàn ở Hà Nội. Gần Cầu Giấy có studio cho thuê theo tháng không? Ngân sách 500 USD/tháng.",
				},
			),
			assigns(hoursAgo(59.5), "agent2"),
		],
	},
	{
		// His Zalo id is on a lead already in the CRM: linked to it.
		pipe: "zalo",
		guestId: "zalo-demo-khanh",
		name: "Khánh",
		story: [
			writes(
				daysAgo(4),
				"Chào anh, em là khách cũ bên mình, giờ em muốn thuê thêm một căn studio ở Ba Đình, khoảng 10 triệu.",
				{
					en: "Hi, I'm a returning client. Now I'd like to rent another studio in Ba Đình, around 10 million.",
				},
			),
			assigns(daysAgo(4) - minutesAgo(2), "agent2"),
			replies(
				daysAgo(4) - minutesAgo(3),
				"agent2",
				"Chào anh Khánh, cảm ơn anh đã quay lại! Bên em có một studio ở Ba Đình giá 9,5 triệu, anh xem ảnh nhé?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550128",
		name: "Lucas",
		story: [
			writes(
				daysAgo(7),
				"Salut ! Je suis français, je cherche un studio to rent dans le Old Quarter, budget $700/month, à partir de next week.",
				{},
			),
			assigns(daysAgo(7) - minutesAgo(5), "agent2"),
			replies(
				daysAgo(7) - minutesAgo(50),
				"agent2",
				"Hi Lucas! We have a bright studio in the Old Quarter at $680/month, free from next week. Would Thursday suit you for a viewing?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550129",
		name: "Mei",
		story: [
			writes(
				daysAgo(10),
				"您好！我从 Singapore 来，想在 Ecopark buy 一套 2 bedroom 公寓，预算 $250,000 左右。Can foreigners buy here?",
				{},
			),
			assigns(daysAgo(10) - minutesAgo(10), "agent2"),
			replies(
				daysAgo(10) - hoursAgo(1.5),
				"agent2",
				"Hello Mei! There are 2-bedroom flats in Ecopark around $250,000. On what a foreign buyer can own, our legal partner will explain in a call. Shall I set one up?",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550130",
		name: "Aiko",
		story: [
			writes(
				daysAgo(22),
				"はじめまして。日本人です。Tay Hoで2 bedroomの賃貸を探しています。来週から内見できますか？",
				{
					en: "Nice to meet you. I'm Japanese. I'm looking to rent a 2-bedroom in Tay Ho. Could I view from next week?",
					vi: "Rất vui được làm quen. Tôi là người Nhật. Tôi tìm thuê căn 2 phòng ngủ ở Tây Hồ. Từ tuần sau có thể xem nhà không?",
				},
			),
			assigns(daysAgo(22) - minutesAgo(4), "agent2"),
			replies(
				daysAgo(22) - minutesAgo(9),
				"agent2",
				"はじめまして！Tay Hoに2 bedroomが3件ございます。来週火曜日はいかがでしょうか。",
			),
			writes(daysAgo(21), "火曜日の午後で大丈夫です。よろしくお願いします。", {
				en: "Tuesday afternoon works. Thank you.",
				vi: "Chiều thứ Ba được ạ. Cảm ơn bạn.",
			}),
			replies(
				daysAgo(21) - minutesAgo(30),
				"agent2",
				"承知しました。火曜日の午後2時にお待ちしております。",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550131",
		name: "Nikolai",
		story: [
			writes(
				daysAgo(25),
				"Добрый вечер. Рассматриваю покупку квартиры в Landmark, 3 bedroom. Какие цены?",
				{
					en: "Good evening. I'm considering buying a flat in Landmark, 3 bedrooms. What are the prices?",
					vi: "Chào buổi tối. Tôi đang cân nhắc mua căn hộ ở Landmark, 3 phòng ngủ. Giá thế nào?",
				},
			),
			assigns(daysAgo(25) - minutesAgo(6), "agent2"),
			replies(
				daysAgo(25) - minutesAgo(25),
				"agent2",
				"Добрый вечер, Николай! Сегодня пришлю подборку квартир с 3 спальнями в Landmark.",
			),
			crmMarks(daysAgo(12), "lost", "Chose a cheaper flat with another agency"),
		],
	},
	{
		// Lost in the CRM, then wrote again: back in the queue (ADR 0003).
		pipe: "whatsapp",
		guestId: "12025550132",
		name: "Grace",
		story: [
			writes(
				daysAgo(16),
				"Hi, American teacher here. Looking to rent a 1 bedroom in Tay Ho under $600/month from next month.",
				{
					vi: "Chào bạn, tôi là giáo viên người Mỹ. Tôi tìm thuê căn 1 phòng ngủ ở Tây Hồ dưới 600 USD/tháng từ tháng sau.",
				},
			),
			assigns(daysAgo(16) - minutesAgo(3), "agent2"),
			replies(
				daysAgo(16) - minutesAgo(14),
				"agent2",
				"Hi Grace! Tay Ho 1-bedrooms usually start around $750/month. Would you consider Long Bien, where $600 goes further?",
			),
			crmMarks(daysAgo(9), "lost", "Budget below the area's range"),
			writes(
				hoursAgo(20),
				"I've thought about it, Long Bien works for me now. Do you still have something around $600?",
				{
					vi: "Tôi đã suy nghĩ rồi, giờ Long Biên cũng được. Bên bạn còn căn nào khoảng 600 USD không?",
				},
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-hai",
		name: "Hải",
		story: [
			writes(
				daysAgo(12),
				"Chào bạn, mình cần thuê một căn vừa ở vừa làm việc, 2 phòng ngủ, khu Đống Đa, khoảng 20 triệu.",
				{
					en: "Hi, I need to rent a place to live and work in, 2 bedrooms, in Đống Đa, around 20 million.",
				},
			),
			assigns(daysAgo(12) - minutesAgo(5), "agent2"),
			replies(
				daysAgo(12) - minutesAgo(40),
				"agent2",
				"Chào anh Hải, bên em có một căn 2 phòng ngủ ở Đống Đa giá 19 triệu, hợp để làm việc tại nhà. Anh xem ảnh nhé?",
			),
			writes(hoursAgo(2), "Ảnh đẹp đấy. Tuần sau mình qua xem được không?", {
				en: "The photos look good. Can I come and see it next week?",
			}),
		],
	},
	{
		// Answered by the manager, then deleted on the guest's request: only a receipt and a lead
		// tally stay.
		pipe: "whatsapp",
		guestId: "12025550199",
		name: "Tom",
		deleted: "guest_request",
		story: [
			writes(
				daysAgo(9),
				"Hi, quick question: do you have 2 bedroom rentals in Ciputra for next month? Budget $1700.",
				{
					vi: "Chào bạn, cho hỏi nhanh: bên bạn có căn 2 phòng ngủ cho thuê ở Ciputra từ tháng sau không? Ngân sách 1700 USD.",
				},
			),
			// Never assigned, so no "assigned" bell row outlives the thread (`removeSeeded`).
			replies(
				daysAgo(9) - minutesAgo(10),
				"manager",
				"Hi Tom, yes: two 2-bedroom flats in Ciputra fit $1700. Shall I send them?",
			),
		],
	},
];

/** The manager's own: replies that claimed Unassigned threads (ADR 0022), and one they kept. */
const managerOwn: SeedGuest[] = [
	{
		pipe: "whatsapp",
		guestId: "12025550133",
		name: "Arjun",
		story: [
			writes(
				hoursAgo(24),
				"Hello, I'm moving to Hanoi with my family of 4 in December. Need a 3 bedroom house to rent in Tay Ho, budget $3500.",
				{
					vi: "Xin chào, tôi sẽ chuyển đến Hà Nội cùng gia đình 4 người vào tháng 12. Cần thuê nhà 3 phòng ngủ ở Tây Hồ, ngân sách 3500 USD.",
				},
			),
			replies(
				hoursAgo(24) - minutesAgo(5),
				"manager",
				"Hello Arjun, welcome! We have three family homes in Tay Ho within $3500. I'll send you a short list today.",
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-thu",
		name: "Thu",
		story: [
			writes(
				daysAgo(2),
				"Chị ơi, công ty em cần thuê 4 căn hộ 1 phòng ngủ cho nhân viên nước ngoài ở Cầu Giấy, từ tháng sau.",
				{
					en: "Hi, my company needs to rent four 1-bedroom apartments for foreign staff in Cầu Giấy, from next month.",
				},
			),
			replies(
				daysAgo(2) - minutesAgo(18),
				"manager",
				"Chào em Thu, chị gửi em danh sách 6 căn 1 phòng ngủ ở Cầu Giấy trong hôm nay nhé.",
			),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550135",
		name: "Sakura",
		story: [
			writes(
				daysAgo(14),
				"こんにちは。日本人です。Ba Dinhで1 bedroomの賃貸、今月中に入居したいです。予算$1100/month。",
				{
					en: "Hello. I'm Japanese. A 1-bedroom to rent in Ba Dinh; I'd like to move in this month. Budget $1100/month.",
					vi: "Xin chào. Tôi là người Nhật. Tìm thuê căn 1 phòng ngủ ở Ba Đình, muốn dọn vào trong tháng này. Ngân sách 1100 USD/tháng.",
				},
			),
			replies(
				daysAgo(14) - minutesAgo(55),
				"manager",
				"こんにちは！Ba Dinhに$1100の1 bedroomがございます。明日ご内見いただけます。",
			),
			crmMarks(daysAgo(4), "won"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550136",
		name: "Hyun-woo",
		story: [
			writes(
				hoursAgo(23),
				"안녕하세요, 한국인입니다. Vinhomes 2 bedroom 구매 상담 받고 싶어요. 소유권 관련도 궁금합니다.",
				{
					en: "Hello, I'm Korean. I'd like advice on buying a 2-bedroom in Vinhomes. I'm also curious about ownership.",
					vi: "Xin chào, tôi là người Hàn. Tôi muốn được tư vấn mua căn 2 phòng ngủ ở Vinhomes. Tôi cũng muốn hỏi về quyền sở hữu.",
				},
			),
			assigns(hoursAgo(22.8), "manager"),
		],
	},
	{
		pipe: "whatsapp",
		guestId: "12025550137",
		name: "Elena",
		story: [
			writes(
				daysAgo(27),
				"Здравствуйте! Нужна квартира в аренду в Times City, 2 bedroom, $1300/month. Сейчас в Ханое.",
				{
					en: "Hello! I need a flat to rent in Times City, 2 bedrooms, $1300/month. I'm in Hanoi now.",
					vi: "Xin chào! Tôi cần thuê căn hộ ở Times City, 2 phòng ngủ, 1300 USD/tháng. Hiện tôi đang ở Hà Nội.",
				},
			),
			replies(
				daysAgo(27) - hoursAgo(3),
				"manager",
				"Здравствуйте, Елена! В Times City есть квартира с 2 спальнями за $1300. Могу показать в субботу.",
			),
		],
	},
	{
		pipe: "zalo",
		guestId: "zalo-demo-vy",
		name: "Vy",
		story: [
			writes(
				daysAgo(28),
				"Em chào chị, em muốn thuê căn studio ở Hai Bà Trưng, tầm 9 triệu, đầu tháng sau ạ.",
				{
					en: "Hello, I'd like to rent a studio in Hai Bà Trưng, around 9 million, early next month.",
				},
			),
			replies(
				daysAgo(28) - minutesAgo(7),
				"manager",
				"Chào em Vy, chị có hai studio ở Hai Bà Trưng giá 8,5 và 9 triệu. Em muốn xem căn nào?",
			),
			writes(daysAgo(27), "Em xem căn 9 triệu nhé chị, chiều mai được không ạ?", {
				en: "I'll see the 9 million one, please. Is tomorrow afternoon OK?",
			}),
			replies(daysAgo(27) - minutesAgo(25), "manager", "Được em, chị hẹn em 3 giờ chiều mai nhé."),
		],
	},
];

export const WALK_SEED_OFFICE: SeedOffice = {
	officeId: WALK_OFFICE_ID,
	operators: { agent: WALK_USER_EMAIL, agent2: WALK_AGENT2_EMAIL, manager: WALK_MANAGER_EMAIL },
	mockCrm: true,
	autoReply: true,
	crmLeads: [
		{ name: "Emily (enquiry from last year)", pipe: "whatsapp", phone: "+12025550117" },
		{ name: "Khánh (client since 2025)", pipe: "zalo", zaloUserId: "zalo-demo-khanh" },
		// Two leads with Daniel's number: he matches both, so neither is linked.
		{ name: "Daniel (2025 enquiry)", pipe: "whatsapp", phone: "+12025550104" },
		{ name: "Daniel (lease renewal)", pipe: "whatsapp", phone: "+12025550104" },
		// A lead no guest's thread matches: entered in the CRM by hand after a walk-in.
		{ name: "Marguerite (walk-in)", pipe: "whatsapp", phone: "+12025550188" },
	],
	guests: [...demoGuests, ...unassigned, ...firstAgent, ...secondAgent, ...managerOwn],
};
