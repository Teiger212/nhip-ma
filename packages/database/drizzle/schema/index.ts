export * from "./postgres";

export const NotificationTarget = {
	IN_APP: "IN_APP",
	EMAIL: "EMAIL",
} as const;

export type NotificationTarget = (typeof NotificationTarget)[keyof typeof NotificationTarget];

export const NotificationType = {
	WELCOME: "WELCOME",
	APP_UPDATE: "APP_UPDATE",
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const Pipe = {
	zalo: "zalo",
	whatsapp: "whatsapp",
} as const;

export type Pipe = (typeof Pipe)[keyof typeof Pipe];

export const MessageSource = {
	guest: "guest",
	oa_echo: "oa_echo",
	nhip: "nhip",
} as const;

export type MessageSource = (typeof MessageSource)[keyof typeof MessageSource];

export const MessageDirection = {
	in: "in",
	out: "out",
} as const;

export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const RentOrBuy = {
	rent: "rent",
	buy: "buy",
} as const;

export type RentOrBuy = (typeof RentOrBuy)[keyof typeof RentOrBuy];

export const GuestLanguage = {
	en: "en",
	vi: "vi",
	ja: "ja",
	ko: "ko",
	ru: "ru",
} as const;

export type GuestLanguage = (typeof GuestLanguage)[keyof typeof GuestLanguage];

export const CribLanguage = {
	en: "en",
	vi: "vi",
} as const;

export type CribLanguage = (typeof CribLanguage)[keyof typeof CribLanguage];
