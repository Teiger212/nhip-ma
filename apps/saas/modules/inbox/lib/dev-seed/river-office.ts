import {
	RIVER_AGENT2_EMAIL,
	RIVER_AGENT_EMAIL,
	RIVER_MANAGER_EMAIL,
	RIVER_OFFICE_ID,
} from "../walk-user";
import {
	assigns,
	daysAgo,
	hoursAgo,
	minutesAgo,
	replies,
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
