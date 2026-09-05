/**
 * Prisma Zod Generator - Single File (inlined)
 * Auto-generated. Do not edit.
 */

import * as z from 'zod';
// File: TransactionIsolationLevel.schema.ts

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted', 'ReadCommitted', 'RepeatableRead', 'Serializable'])

export type TransactionIsolationLevel = z.infer<typeof TransactionIsolationLevelSchema>;

// File: UserScalarFieldEnum.schema.ts

export const UserScalarFieldEnumSchema = z.enum(['id', 'name', 'email', 'emailVerified', 'image', 'createdAt', 'updatedAt', 'role', 'banned', 'banReason', 'banExpires', 'onboardingComplete', 'paymentsCustomerId', 'locale', 'twoFactorEnabled', 'lastActiveOrganizationId'])

export type UserScalarFieldEnum = z.infer<typeof UserScalarFieldEnumSchema>;

// File: SessionScalarFieldEnum.schema.ts

export const SessionScalarFieldEnumSchema = z.enum(['id', 'expiresAt', 'ipAddress', 'userAgent', 'userId', 'impersonatedBy', 'activeOrganizationId', 'token', 'createdAt', 'updatedAt'])

export type SessionScalarFieldEnum = z.infer<typeof SessionScalarFieldEnumSchema>;

// File: AccountScalarFieldEnum.schema.ts

export const AccountScalarFieldEnumSchema = z.enum(['id', 'accountId', 'providerId', 'userId', 'accessToken', 'refreshToken', 'idToken', 'expiresAt', 'password', 'accessTokenExpiresAt', 'refreshTokenExpiresAt', 'scope', 'createdAt', 'updatedAt'])

export type AccountScalarFieldEnum = z.infer<typeof AccountScalarFieldEnumSchema>;

// File: VerificationScalarFieldEnum.schema.ts

export const VerificationScalarFieldEnumSchema = z.enum(['id', 'identifier', 'value', 'expiresAt', 'createdAt', 'updatedAt'])

export type VerificationScalarFieldEnum = z.infer<typeof VerificationScalarFieldEnumSchema>;

// File: PasskeyScalarFieldEnum.schema.ts

export const PasskeyScalarFieldEnumSchema = z.enum(['id', 'name', 'publicKey', 'userId', 'credentialID', 'counter', 'deviceType', 'backedUp', 'transports', 'aaguid', 'createdAt'])

export type PasskeyScalarFieldEnum = z.infer<typeof PasskeyScalarFieldEnumSchema>;

// File: TwoFactorScalarFieldEnum.schema.ts

export const TwoFactorScalarFieldEnumSchema = z.enum(['id', 'secret', 'backupCodes', 'verified', 'userId', 'failedVerificationCount', 'lockedUntil'])

export type TwoFactorScalarFieldEnum = z.infer<typeof TwoFactorScalarFieldEnumSchema>;

// File: OrganizationScalarFieldEnum.schema.ts

export const OrganizationScalarFieldEnumSchema = z.enum(['id', 'name', 'slug', 'logo', 'createdAt', 'metadata', 'paymentsCustomerId'])

export type OrganizationScalarFieldEnum = z.infer<typeof OrganizationScalarFieldEnumSchema>;

// File: MemberScalarFieldEnum.schema.ts

export const MemberScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'userId', 'role', 'createdAt'])

export type MemberScalarFieldEnum = z.infer<typeof MemberScalarFieldEnumSchema>;

// File: InvitationScalarFieldEnum.schema.ts

export const InvitationScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'email', 'role', 'status', 'expiresAt', 'inviterId', 'createdAt'])

export type InvitationScalarFieldEnum = z.infer<typeof InvitationScalarFieldEnumSchema>;

// File: PurchaseScalarFieldEnum.schema.ts

export const PurchaseScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'userId', 'type', 'customerId', 'subscriptionId', 'priceId', 'status', 'createdAt', 'updatedAt'])

export type PurchaseScalarFieldEnum = z.infer<typeof PurchaseScalarFieldEnumSchema>;

// File: NotificationScalarFieldEnum.schema.ts

export const NotificationScalarFieldEnumSchema = z.enum(['id', 'userId', 'type', 'data', 'link', 'read', 'createdAt', 'updatedAt'])

export type NotificationScalarFieldEnum = z.infer<typeof NotificationScalarFieldEnumSchema>;

// File: UserNotificationPreferenceScalarFieldEnum.schema.ts

export const UserNotificationPreferenceScalarFieldEnumSchema = z.enum(['id', 'userId', 'type', 'target', 'createdAt'])

export type UserNotificationPreferenceScalarFieldEnum = z.infer<typeof UserNotificationPreferenceScalarFieldEnumSchema>;

// File: ConversationScalarFieldEnum.schema.ts

export const ConversationScalarFieldEnumSchema = z.enum(['id', 'pipe', 'guestId', 'guestName', 'language', 'lastGuestInboundAt', 'sentAt', 'updatedAt'])

export type ConversationScalarFieldEnum = z.infer<typeof ConversationScalarFieldEnumSchema>;

// File: MessageScalarFieldEnum.schema.ts

export const MessageScalarFieldEnumSchema = z.enum(['id', 'conversationId', 'direction', 'source', 'text', 'at', 'vendorMessageId', 'mock'])

export type MessageScalarFieldEnum = z.infer<typeof MessageScalarFieldEnumSchema>;

// File: QualificationScalarFieldEnum.schema.ts

export const QualificationScalarFieldEnumSchema = z.enum(['conversationId', 'areaOfInterest', 'nationality', 'inVietnamNow', 'rentOrBuy', 'timeframe', 'budgetBand', 'bedsOrHousehold'])

export type QualificationScalarFieldEnum = z.infer<typeof QualificationScalarFieldEnumSchema>;

// File: DraftScalarFieldEnum.schema.ts

export const DraftScalarFieldEnumSchema = z.enum(['conversationId', 'reply', 'crib', 'cribLanguage'])

export type DraftScalarFieldEnum = z.infer<typeof DraftScalarFieldEnumSchema>;

// File: PaperworkScalarFieldEnum.schema.ts

export const PaperworkScalarFieldEnumSchema = z.enum(['conversationId', 'mentioned', 'flag'])

export type PaperworkScalarFieldEnum = z.infer<typeof PaperworkScalarFieldEnumSchema>;

// File: ApprovalScalarFieldEnum.schema.ts

export const ApprovalScalarFieldEnumSchema = z.enum(['id', 'conversationId', 'reply', 'at'])

export type ApprovalScalarFieldEnum = z.infer<typeof ApprovalScalarFieldEnumSchema>;

// File: SendScalarFieldEnum.schema.ts

export const SendScalarFieldEnumSchema = z.enum(['id', 'conversationId', 'mock', 'pipe', 'to', 'text', 'vendorMessageId', 'at'])

export type SendScalarFieldEnum = z.infer<typeof SendScalarFieldEnumSchema>;

// File: SortOrder.schema.ts

export const SortOrderSchema = z.enum(['asc', 'desc'])

export type SortOrder = z.infer<typeof SortOrderSchema>;

// File: JsonNullValueInput.schema.ts

export const JsonNullValueInputSchema = z.enum(['JsonNull'])

export type JsonNullValueInput = z.infer<typeof JsonNullValueInputSchema>;

// File: QueryMode.schema.ts

export const QueryModeSchema = z.enum(['default', 'insensitive'])

export type QueryMode = z.infer<typeof QueryModeSchema>;

// File: NullsOrder.schema.ts

export const NullsOrderSchema = z.enum(['first', 'last'])

export type NullsOrder = z.infer<typeof NullsOrderSchema>;

// File: JsonNullValueFilter.schema.ts

export const JsonNullValueFilterSchema = z.enum(['DbNull', 'JsonNull', 'AnyNull'])

export type JsonNullValueFilter = z.infer<typeof JsonNullValueFilterSchema>;

// File: PurchaseType.schema.ts

export const PurchaseTypeSchema = z.enum(['SUBSCRIPTION', 'ONE_TIME'])

export type PurchaseType = z.infer<typeof PurchaseTypeSchema>;

// File: NotificationType.schema.ts

export const NotificationTypeSchema = z.enum(['WELCOME', 'APP_UPDATE'])

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

// File: NotificationTarget.schema.ts

export const NotificationTargetSchema = z.enum(['IN_APP', 'EMAIL'])

export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

// File: Pipe.schema.ts

export const PipeSchema = z.enum(['zalo', 'whatsapp'])

export type Pipe = z.infer<typeof PipeSchema>;

// File: GuestLanguage.schema.ts

export const GuestLanguageSchema = z.enum(['en', 'vi', 'ja', 'ko', 'ru'])

export type GuestLanguage = z.infer<typeof GuestLanguageSchema>;

// File: MessageDirection.schema.ts

export const MessageDirectionSchema = z.enum(['in', 'out'])

export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

// File: MessageSource.schema.ts

export const MessageSourceSchema = z.enum(['guest', 'oa_echo', 'nhip'])

export type MessageSource = z.infer<typeof MessageSourceSchema>;

// File: RentOrBuy.schema.ts

export const RentOrBuySchema = z.enum(['rent', 'buy'])

export type RentOrBuy = z.infer<typeof RentOrBuySchema>;

// File: CribLanguage.schema.ts

export const CribLanguageSchema = z.enum(['en', 'vi'])

export type CribLanguage = z.infer<typeof CribLanguageSchema>;

// File: User.schema.ts

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
  role: z.string().nullish(),
  banned: z.boolean().nullish(),
  banReason: z.string().nullish(),
  banExpires: z.date().nullish(),
  onboardingComplete: z.boolean(),
  paymentsCustomerId: z.string().nullish(),
  locale: z.string().nullish(),
  twoFactorEnabled: z.boolean().nullish(),
  lastActiveOrganizationId: z.string().nullish(),
});

export type UserType = z.infer<typeof UserSchema>;


// File: Session.schema.ts

export const SessionSchema = z.object({
  id: z.string(),
  expiresAt: z.date(),
  ipAddress: z.string().nullish(),
  userAgent: z.string().nullish(),
  userId: z.string(),
  impersonatedBy: z.string().nullish(),
  activeOrganizationId: z.string().nullish(),
  token: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SessionType = z.infer<typeof SessionSchema>;


// File: Account.schema.ts

export const AccountSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  providerId: z.string(),
  userId: z.string(),
  accessToken: z.string().nullish(),
  refreshToken: z.string().nullish(),
  idToken: z.string().nullish(),
  expiresAt: z.date().nullish(),
  password: z.string().nullish(),
  accessTokenExpiresAt: z.date().nullish(),
  refreshTokenExpiresAt: z.date().nullish(),
  scope: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AccountType = z.infer<typeof AccountSchema>;


// File: Verification.schema.ts

export const VerificationSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  value: z.string(),
  expiresAt: z.date(),
  createdAt: z.date().nullish(),
  updatedAt: z.date().nullish(),
});

export type VerificationType = z.infer<typeof VerificationSchema>;


// File: Passkey.schema.ts

export const PasskeySchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  publicKey: z.string(),
  userId: z.string(),
  credentialID: z.string(),
  counter: z.number().int(),
  deviceType: z.string(),
  backedUp: z.boolean(),
  transports: z.string().nullish(),
  aaguid: z.string().nullish(),
  createdAt: z.date().nullish(),
});

export type PasskeyType = z.infer<typeof PasskeySchema>;


// File: TwoFactor.schema.ts

export const TwoFactorSchema = z.object({
  id: z.string(),
  secret: z.string(),
  backupCodes: z.string(),
  verified: z.boolean(),
  userId: z.string(),
  failedVerificationCount: z.number().int().nullish(),
  lockedUntil: z.date().nullish(),
});

export type TwoFactorType = z.infer<typeof TwoFactorSchema>;


// File: Organization.schema.ts

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: z.string().nullish(),
  createdAt: z.date(),
  metadata: z.string().nullish(),
  paymentsCustomerId: z.string().nullish(),
});

export type OrganizationType = z.infer<typeof OrganizationSchema>;


// File: Member.schema.ts

export const MemberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  role: z.string(),
  createdAt: z.date(),
});

export type MemberType = z.infer<typeof MemberSchema>;


// File: Invitation.schema.ts

export const InvitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: z.string().nullish(),
  status: z.string(),
  expiresAt: z.date(),
  inviterId: z.string(),
  createdAt: z.date(),
});

export type InvitationType = z.infer<typeof InvitationSchema>;


// File: Purchase.schema.ts

export const PurchaseSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullish(),
  userId: z.string().nullish(),
  type: PurchaseTypeSchema,
  customerId: z.string(),
  subscriptionId: z.string().nullish(),
  priceId: z.string(),
  status: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PurchaseModel = z.infer<typeof PurchaseSchema>;

// File: Notification.schema.ts

export const NotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  data: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default({}),
  link: z.string().nullish(),
  read: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationModel = z.infer<typeof NotificationSchema>;

// File: UserNotificationPreference.schema.ts

export const UserNotificationPreferenceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  target: NotificationTargetSchema,
  createdAt: z.date(),
});

export type UserNotificationPreferenceType = z.infer<typeof UserNotificationPreferenceSchema>;


// File: Conversation.schema.ts

export const ConversationSchema = z.object({
  id: z.string(),
  pipe: PipeSchema,
  guestId: z.string(),
  guestName: z.string().nullish(),
  language: GuestLanguageSchema.nullish(),
  lastGuestInboundAt: z.date().nullish(),
  sentAt: z.date().nullish(),
  updatedAt: z.date(),
});

export type ConversationType = z.infer<typeof ConversationSchema>;


// File: Message.schema.ts

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: MessageDirectionSchema,
  source: MessageSourceSchema,
  text: z.string(),
  at: z.date(),
  vendorMessageId: z.string().nullish(),
  mock: z.boolean(),
});

export type MessageType = z.infer<typeof MessageSchema>;


// File: Qualification.schema.ts

export const QualificationSchema = z.object({
  conversationId: z.string(),
  areaOfInterest: z.string().nullish(),
  nationality: z.string().nullish(),
  inVietnamNow: z.boolean().nullish(),
  rentOrBuy: RentOrBuySchema.nullish(),
  timeframe: z.string().nullish(),
  budgetBand: z.string().nullish(),
  bedsOrHousehold: z.string().nullish(),
});

export type QualificationType = z.infer<typeof QualificationSchema>;


// File: Draft.schema.ts

export const DraftSchema = z.object({
  conversationId: z.string(),
  reply: z.string(),
  crib: z.string(),
  cribLanguage: CribLanguageSchema,
});

export type DraftType = z.infer<typeof DraftSchema>;


// File: Paperwork.schema.ts

export const PaperworkSchema = z.object({
  conversationId: z.string(),
  mentioned: z.boolean(),
  flag: z.string().nullish(),
});

export type PaperworkType = z.infer<typeof PaperworkSchema>;


// File: Approval.schema.ts

export const ApprovalSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  reply: z.string(),
  at: z.date(),
});

export type ApprovalType = z.infer<typeof ApprovalSchema>;


// File: Send.schema.ts

export const SendSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  mock: z.boolean(),
  pipe: PipeSchema,
  to: z.string(),
  text: z.string().nullish(),
  vendorMessageId: z.string().nullish(),
  at: z.date(),
});

export type SendType = z.infer<typeof SendSchema>;

