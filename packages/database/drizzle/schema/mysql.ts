import { createId as cuid } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/mysql-core";

// Enums
export const purchaseTypeEnum = mysqlEnum("PurchaseType", ["SUBSCRIPTION", "ONE_TIME"]);

export const notificationTypeEnum = mysqlEnum("NotificationType", ["WELCOME", "APP_UPDATE"]);

export const notificationTargetEnum = mysqlEnum("NotificationTarget", ["IN_APP", "EMAIL"]);

export const pipeEnum = mysqlEnum("Pipe", ["zalo", "whatsapp"]);

export const messageSourceEnum = mysqlEnum("MessageSource", ["guest", "oa_echo", "nhip"]);

export const messageDirectionEnum = mysqlEnum("MessageDirection", ["in", "out"]);

export const rentOrBuyEnum = mysqlEnum("RentOrBuy", ["rent", "buy"]);

export const guestLanguageEnum = mysqlEnum("GuestLanguage", ["en", "vi", "ja", "ko", "ru"]);

export const cribLanguageEnum = mysqlEnum("CribLanguage", ["en", "vi"]);

// Tables
export const user = mysqlTable("user", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
	role: text("role"),
	banned: boolean("banned").default(false),
	twoFactorEnabled: boolean("twoFactorEnabled").default(false),
	banReason: text("banReason"),
	banExpires: timestamp("banExpires"),
	onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
	paymentsCustomerId: text("paymentsCustomerId"),
	locale: text("locale"),
	lastActiveOrganizationId: text("lastActiveOrganizationId"),
});

export const session = mysqlTable(
	"session",
	{
		id: varchar("id", { length: 255 })
			.$defaultFn(() => cuid())
			.primaryKey(),
		expiresAt: timestamp("expiresAt").notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text("impersonatedBy"),
		activeOrganizationId: text("activeOrganizationId"),
		token: text("token").notNull(),
		createdAt: timestamp("createdAt").notNull(),
		updatedAt: timestamp("updatedAt").notNull(),
	},
	(table) => [uniqueIndex("session_token_idx").on(table.token)],
);

export const account = mysqlTable("account", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	expiresAt: timestamp("expiresAt"),
	password: text("password"),
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
	scope: text("scope"),
	createdAt: timestamp("createdAt").notNull(),
	updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = mysqlTable("verification", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt"),
	updatedAt: timestamp("updatedAt"),
});

export const passkey = mysqlTable("passkey", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name"),
	publicKey: text("publicKey").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	credentialID: text("credentialID").notNull(),
	counter: int("counter").notNull(),
	deviceType: text("deviceType").notNull(),
	backedUp: boolean("backedUp").notNull(),
	transports: text("transports"),
	createdAt: timestamp("createdAt"),
	aaguid: text("aaguid"),
});

export const twoFactor = mysqlTable("twoFactor", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	secret: text("secret").notNull(),
	backupCodes: text("backupCodes").notNull(),
	verified: boolean("verified").default(false).notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	failedVerificationCount: int("failedVerificationCount").default(0),
	lockedUntil: timestamp("lockedUntil"),
});

export const organization = mysqlTable(
	"organization",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: timestamp("createdAt").notNull(),
		metadata: text("metadata"),
		paymentsCustomerId: text("paymentsCustomerId"),
	},
	(table) => [uniqueIndex("organization_slug_idx").on(table.slug)],
);

export const member = mysqlTable(
	"member",
	{
		id: varchar("id", { length: 255 })
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("createdAt").notNull(),
	},
	(table) => [uniqueIndex("member_user_org_idx").on(table.userId, table.organizationId)],
);

export const invitation = mysqlTable(
	"invitation",
	{
		id: varchar("id", { length: 255 })
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expiresAt").notNull(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		inviterId: text("inviterId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const purchase = mysqlTable("purchase", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => user.id, {
		onDelete: "cascade",
	}),
	type: purchaseTypeEnum.notNull(),
	customerId: text("customerId").notNull(),
	subscriptionId: text("subscriptionId").unique(),
	priceId: text("priceId").notNull(),
	status: text("status"),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	updatedAt: timestamp("updatedAt"),
});

export const notification = mysqlTable(
	"notification",
	{
		id: varchar("id", { length: 255 })
			.$defaultFn(() => cuid())
			.primaryKey(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: notificationTypeEnum.notNull(),
		data: json("data").$type<Record<string, unknown>>().notNull().default({}),
		link: text("link"),
		read: boolean("read").notNull().default(false),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
	},
	(table) => [index("notification_userId_idx").on(table.userId)],
);

export const conversation = mysqlTable(
	"Conversation",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		pipe: pipeEnum.notNull(),
		guestId: varchar("guestId", { length: 255 }).notNull(),
		guestName: text("guestName"),
		language: guestLanguageEnum,
		lastGuestInboundAt: timestamp("lastGuestInboundAt"),
		sentAt: timestamp("sentAt"),
		updatedAt: timestamp("updatedAt").notNull(),
	},
	(table) => [uniqueIndex("Conversation_pipe_guestId_key").on(table.pipe, table.guestId)],
);

export const message = mysqlTable("Message", {
	id: varchar("id", { length: 255 }).primaryKey(),
	conversationId: varchar("conversationId", { length: 255 })
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	direction: messageDirectionEnum.notNull(),
	source: messageSourceEnum.notNull(),
	text: text("text").notNull(),
	at: timestamp("at").notNull(),
	vendorMessageId: text("vendorMessageId"),
	mock: boolean("mock").notNull().default(false),
});

export const qualification = mysqlTable("Qualification", {
	conversationId: varchar("conversationId", { length: 255 })
		.primaryKey()
		.references(() => conversation.id, { onDelete: "cascade" }),
	areaOfInterest: text("areaOfInterest"),
	nationality: text("nationality"),
	inVietnamNow: boolean("inVietnamNow"),
	rentOrBuy: rentOrBuyEnum,
	timeframe: text("timeframe"),
	budgetBand: text("budgetBand"),
	bedsOrHousehold: text("bedsOrHousehold"),
});

export const draft = mysqlTable("Draft", {
	conversationId: varchar("conversationId", { length: 255 })
		.primaryKey()
		.references(() => conversation.id, { onDelete: "cascade" }),
	reply: text("reply").notNull(),
	crib: text("crib").notNull(),
	cribLanguage: cribLanguageEnum.notNull(),
});

export const paperwork = mysqlTable("Paperwork", {
	conversationId: varchar("conversationId", { length: 255 })
		.primaryKey()
		.references(() => conversation.id, { onDelete: "cascade" }),
	mentioned: boolean("mentioned").notNull(),
	flag: text("flag"),
});

export const approval = mysqlTable("Approval", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	conversationId: varchar("conversationId", { length: 255 })
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	reply: text("reply").notNull(),
	at: timestamp("at").notNull(),
});

export const send = mysqlTable("Send", {
	id: varchar("id", { length: 255 })
		.$defaultFn(() => cuid())
		.primaryKey(),
	conversationId: varchar("conversationId", { length: 255 })
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	mock: boolean("mock").notNull(),
	pipe: pipeEnum.notNull(),
	to: varchar("to", { length: 255 }).notNull(),
	text: text("text"),
	vendorMessageId: text("vendorMessageId"),
	at: timestamp("at").notNull(),
});

export const userNotificationPreference = mysqlTable(
	"user_notification_preference",
	{
		id: varchar("id", { length: 255 })
			.$defaultFn(() => cuid())
			.primaryKey(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: notificationTypeEnum.notNull(),
		target: notificationTargetEnum.notNull(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
	},
	(table) => [
		index("user_notification_preference_userId_idx").on(table.userId),
		uniqueIndex("user_notification_preference_user_type_target_uidx").on(
			table.userId,
			table.type,
			table.target,
		),
	],
);

// Relations
export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	passkeys: many(passkey),
	members: many(member),
	invitations: many(invitation),
	twoFactors: many(twoFactor),

	purchases: many(purchase),
	memberships: many(member),
	notifications: many(notification),
	notificationPreferences: many(userNotificationPreference),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
	purchases: many(purchase),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
	user: one(user, {
		fields: [passkey.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const purchaseRelations = relations(purchase, ({ one }) => ({
	organization: one(organization, {
		fields: [purchase.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [purchase.userId],
		references: [user.id],
	}),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id],
	}),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, {
		fields: [notification.userId],
		references: [user.id],
	}),
}));

export const userNotificationPreferenceRelations = relations(
	userNotificationPreference,
	({ one }) => ({
		user: one(user, {
			fields: [userNotificationPreference.userId],
			references: [user.id],
		}),
	}),
);

export const conversationRelations = relations(conversation, ({ many, one }) => ({
	messages: many(message),
	qualification: one(qualification),
	draft: one(draft),
	paperwork: one(paperwork),
	approvals: many(approval),
	sends: many(send),
}));

export const messageRelations = relations(message, ({ one }) => ({
	conversation: one(conversation, {
		fields: [message.conversationId],
		references: [conversation.id],
	}),
}));

export const qualificationRelations = relations(qualification, ({ one }) => ({
	conversation: one(conversation, {
		fields: [qualification.conversationId],
		references: [conversation.id],
	}),
}));

export const draftRelations = relations(draft, ({ one }) => ({
	conversation: one(conversation, {
		fields: [draft.conversationId],
		references: [conversation.id],
	}),
}));

export const paperworkRelations = relations(paperwork, ({ one }) => ({
	conversation: one(conversation, {
		fields: [paperwork.conversationId],
		references: [conversation.id],
	}),
}));

export const approvalRelations = relations(approval, ({ one }) => ({
	conversation: one(conversation, {
		fields: [approval.conversationId],
		references: [conversation.id],
	}),
}));

export const sendRelations = relations(send, ({ one }) => ({
	conversation: one(conversation, {
		fields: [send.conversationId],
		references: [conversation.id],
	}),
}));
