import { createId as cuid } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
// Tables
export const user = sqliteTable("user", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer("updatedAt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	role: text("role"),
	banned: integer("banned", { mode: "boolean" }),
	twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).default(false),
	banReason: text("banReason"),
	banExpires: integer("banExpires", { mode: "timestamp" }),
	onboardingComplete: integer("onboardingComplete", { mode: "boolean" }).notNull().default(false),
	paymentsCustomerId: text("paymentsCustomerId"),
	locale: text("locale"),
	lastActiveOrganizationId: text("lastActiveOrganizationId"),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text("impersonatedBy"),
		activeOrganizationId: text("activeOrganizationId"),
		token: text("token").notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
	},
	(table) => [uniqueIndex("session_token_idx").on(table.token)],
);

export const account = sqliteTable("account", {
	id: text("id")
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
	expiresAt: integer("expiresAt", { mode: "timestamp" }),
	password: text("password"),
	accessTokenExpiresAt: integer("accessTokenExpiresAt", {
		mode: "timestamp",
	}),
	refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

export const passkey = sqliteTable("passkey", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name"),
	publicKey: text("publicKey").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	credentialID: text("credentialID").notNull(),
	counter: integer("counter").notNull(),
	deviceType: text("deviceType").notNull(),
	backedUp: integer("backedUp", { mode: "boolean" }).notNull(),
	transports: text("transports"),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	aaguid: text("aaguid"),
});

export const twoFactor = sqliteTable("twoFactor", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	secret: text("secret").notNull(),
	backupCodes: text("backupCodes").notNull(),
	verified: integer("verified", { mode: "boolean" }).default(false).notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	failedVerificationCount: integer("failedVerificationCount").default(0),
	lockedUntil: integer("lockedUntil", { mode: "timestamp" }),
});

export const organization = sqliteTable(
	"organization",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
		metadata: text("metadata"),
		paymentsCustomerId: text("paymentsCustomerId"),
	},
	(table) => [uniqueIndex("organization_slug_idx").on(table.slug)],
);

export const member = sqliteTable(
	"member",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	},
	(table) => [uniqueIndex("member_user_org_idx").on(table.userId, table.organizationId)],
);

export const invitation = sqliteTable(
	"invitation",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		inviterId: text("inviterId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const purchase = sqliteTable("purchase", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => user.id, {
		onDelete: "cascade",
	}),
	type: text({ enum: ["SUBSCRIPTION", "ONE_TIME"] }).notNull(),
	customerId: text("customerId").notNull(),
	subscriptionId: text("subscriptionId").unique(),
	priceId: text("priceId").notNull(),
	status: text("status"),
	createdAt: integer("createdAt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const notification = sqliteTable(
	"notification",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text({ enum: ["WELCOME", "APP_UPDATE"] }).notNull(),
		data: text("data", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull()
			.$default(() => ({})),
		link: text("link"),
		read: integer("read", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updatedAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
			.$onUpdate(() => new Date()),
	},
	(table) => [index("notification_userId_idx").on(table.userId)],
);

export const conversation = sqliteTable(
	"Conversation",
	{
		id: text("id").primaryKey(),
		pipe: text("pipe", { enum: ["zalo", "whatsapp"] }).notNull(),
		guestId: text("guestId").notNull(),
		guestName: text("guestName"),
		language: text("language", { enum: ["en", "vi", "ja", "ko", "ru"] }),
		lastGuestInboundAt: integer("lastGuestInboundAt", { mode: "timestamp" }),
		sentAt: integer("sentAt", { mode: "timestamp" }),
		updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
	},
	(table) => [uniqueIndex("Conversation_pipe_guestId_key").on(table.pipe, table.guestId)],
);

export const message = sqliteTable("Message", {
	id: text("id").primaryKey(),
	conversationId: text("conversationId")
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	direction: text("direction", { enum: ["in", "out"] }).notNull(),
	source: text("source", { enum: ["guest", "oa_echo", "nhip"] }).notNull(),
	text: text("text").notNull(),
	at: integer("at", { mode: "timestamp" }).notNull(),
	vendorMessageId: text("vendorMessageId"),
	mock: integer("mock", { mode: "boolean" }).notNull().default(false),
});

export const qualification = sqliteTable("Qualification", {
	conversationId: text("conversationId")
		.primaryKey()
		.references(() => conversation.id, { onDelete: "cascade" }),
	areaOfInterest: text("areaOfInterest"),
	nationality: text("nationality"),
	inVietnamNow: integer("inVietnamNow", { mode: "boolean" }),
	rentOrBuy: text("rentOrBuy", { enum: ["rent", "buy"] }),
	timeframe: text("timeframe"),
	budgetBand: text("budgetBand"),
	bedsOrHousehold: text("bedsOrHousehold"),
});

export const draft = sqliteTable("Draft", {
	conversationId: text("conversationId")
		.primaryKey()
		.references(() => conversation.id, { onDelete: "cascade" }),
	reply: text("reply").notNull(),
	crib: text("crib").notNull(),
	cribLanguage: text("cribLanguage", { enum: ["en", "vi"] }).notNull(),
});

export const paperwork = sqliteTable("Paperwork", {
	conversationId: text("conversationId")
		.primaryKey()
		.references(() => conversation.id, { onDelete: "cascade" }),
	mentioned: integer("mentioned", { mode: "boolean" }).notNull(),
	flag: text("flag"),
});

export const approval = sqliteTable("Approval", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	conversationId: text("conversationId")
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	reply: text("reply").notNull(),
	at: integer("at", { mode: "timestamp" }).notNull(),
});

export const send = sqliteTable("Send", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	conversationId: text("conversationId")
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	mock: integer("mock", { mode: "boolean" }).notNull(),
	pipe: text("pipe", { enum: ["zalo", "whatsapp"] }).notNull(),
	to: text("to").notNull(),
	text: text("text"),
	vendorMessageId: text("vendorMessageId"),
	at: integer("at", { mode: "timestamp" }).notNull(),
});

export const userNotificationPreference = sqliteTable(
	"user_notification_preference",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text({ enum: ["WELCOME", "APP_UPDATE"] }).notNull(),
		target: text({ enum: ["IN_APP", "EMAIL"] }).notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
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
