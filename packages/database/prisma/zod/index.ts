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

// File: RateLimitScalarFieldEnum.schema.ts

export const RateLimitScalarFieldEnumSchema = z.enum(['id', 'key', 'count', 'lastRequest'])

export type RateLimitScalarFieldEnum = z.infer<typeof RateLimitScalarFieldEnumSchema>;

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

export const ConversationScalarFieldEnumSchema = z.enum(['id', 'pipe', 'guestId', 'guestName', 'officeId', 'language', 'guestLanguage', 'lastGuestInboundAt', 'sentAt', 'ownerId', 'autoReplyAt', 'updatedAt'])

export type ConversationScalarFieldEnum = z.infer<typeof ConversationScalarFieldEnumSchema>;

// File: MessageScalarFieldEnum.schema.ts

export const MessageScalarFieldEnumSchema = z.enum(['id', 'seq', 'conversationId', 'officeId', 'direction', 'source', 'text', 'at', 'vendorMessageId', 'mock', 'pipeExternalId', 'writtenBy'])

export type MessageScalarFieldEnum = z.infer<typeof MessageScalarFieldEnumSchema>;

// File: TranslationScalarFieldEnum.schema.ts

export const TranslationScalarFieldEnumSchema = z.enum(['messageId', 'officeId', 'locale', 'text'])

export type TranslationScalarFieldEnum = z.infer<typeof TranslationScalarFieldEnumSchema>;

// File: TranslationFailureScalarFieldEnum.schema.ts

export const TranslationFailureScalarFieldEnumSchema = z.enum(['messageId', 'officeId', 'locale', 'attempts', 'lastFailedAt'])

export type TranslationFailureScalarFieldEnum = z.infer<typeof TranslationFailureScalarFieldEnumSchema>;

// File: QualificationScalarFieldEnum.schema.ts

export const QualificationScalarFieldEnumSchema = z.enum(['conversationId', 'officeId', 'areaOfInterest', 'nationality', 'inVietnamNow', 'rentOrBuy', 'timeframe', 'budgetBand', 'bedsOrHousehold'])

export type QualificationScalarFieldEnum = z.infer<typeof QualificationScalarFieldEnumSchema>;

// File: DraftScalarFieldEnum.schema.ts

export const DraftScalarFieldEnumSchema = z.enum(['conversationId', 'officeId', 'reply', 'answersMessageId', 'source', 'officeReply'])

export type DraftScalarFieldEnum = z.infer<typeof DraftScalarFieldEnumSchema>;

// File: PaperworkScalarFieldEnum.schema.ts

export const PaperworkScalarFieldEnumSchema = z.enum(['conversationId', 'officeId', 'mentioned', 'flag'])

export type PaperworkScalarFieldEnum = z.infer<typeof PaperworkScalarFieldEnumSchema>;

// File: AnswerScalarFieldEnum.schema.ts

export const AnswerScalarFieldEnumSchema = z.enum(['id', 'seq', 'conversationId', 'officeId', 'inboundId', 'text', 'operatorId', 'operatorName', 'status', 'mock', 'pipe', 'pipeExternalId', 'vendorMessageId', 'approvedAt', 'sentAt', 'failedAt', 'failureReason'])

export type AnswerScalarFieldEnum = z.infer<typeof AnswerScalarFieldEnumSchema>;

// File: PipeConnectionScalarFieldEnum.schema.ts

export const PipeConnectionScalarFieldEnumSchema = z.enum(['pipe', 'externalId', 'officeId'])

export type PipeConnectionScalarFieldEnum = z.infer<typeof PipeConnectionScalarFieldEnumSchema>;

// File: PipeCredentialScalarFieldEnum.schema.ts

export const PipeCredentialScalarFieldEnumSchema = z.enum(['pipe', 'externalId', 'accessToken', 'refreshToken', 'accessTokenExpiresAt', 'disconnectedAt', 'disconnectedReason', 'updatedAt'])

export type PipeCredentialScalarFieldEnum = z.infer<typeof PipeCredentialScalarFieldEnumSchema>;

// File: WebhookDeliveryScalarFieldEnum.schema.ts

export const WebhookDeliveryScalarFieldEnumSchema = z.enum(['id', 'pipe', 'receivedAt', 'outcome', 'endpoints', 'officeIds', 'filed', 'dropped', 'vendorMessageIds', 'errorKind'])

export type WebhookDeliveryScalarFieldEnum = z.infer<typeof WebhookDeliveryScalarFieldEnumSchema>;

// File: CrmConnectionScalarFieldEnum.schema.ts

export const CrmConnectionScalarFieldEnumSchema = z.enum(['officeId', 'kind', 'accessToken', 'accountId', 'leadUrlPrefix', 'updatedAt'])

export type CrmConnectionScalarFieldEnum = z.infer<typeof CrmConnectionScalarFieldEnumSchema>;

// File: CrmLinkScalarFieldEnum.schema.ts

export const CrmLinkScalarFieldEnumSchema = z.enum(['conversationId', 'officeId', 'leadId', 'leadName', 'method', 'claimedAt', 'linkedAt', 'outcome', 'outcomeAt', 'outcomeReason', 'outcomeObservedAt'])

export type CrmLinkScalarFieldEnum = z.infer<typeof CrmLinkScalarFieldEnumSchema>;

// File: MockCrmLeadScalarFieldEnum.schema.ts

export const MockCrmLeadScalarFieldEnumSchema = z.enum(['id', 'officeId', 'name', 'phone', 'zaloUserId', 'pipe', 'language', 'fields', 'threadUrl', 'outcome', 'outcomeAt', 'outcomeReason', 'createdAt'])

export type MockCrmLeadScalarFieldEnum = z.infer<typeof MockCrmLeadScalarFieldEnumSchema>;

// File: MockCrmOutageScalarFieldEnum.schema.ts

export const MockCrmOutageScalarFieldEnumSchema = z.enum(['officeId', 'since'])

export type MockCrmOutageScalarFieldEnum = z.infer<typeof MockCrmOutageScalarFieldEnumSchema>;

// File: CrmWriteFailureScalarFieldEnum.schema.ts

export const CrmWriteFailureScalarFieldEnumSchema = z.enum(['conversationId', 'officeId', 'attempts', 'lastFailedAt'])

export type CrmWriteFailureScalarFieldEnum = z.infer<typeof CrmWriteFailureScalarFieldEnumSchema>;

// File: InboxAlertScalarFieldEnum.schema.ts

export const InboxAlertScalarFieldEnumSchema = z.enum(['id', 'userId', 'conversationId', 'officeId', 'kind', 'sounded', 'link', 'createdAt'])

export type InboxAlertScalarFieldEnum = z.infer<typeof InboxAlertScalarFieldEnumSchema>;

// File: OfficeSettingScalarFieldEnum.schema.ts

export const OfficeSettingScalarFieldEnumSchema = z.enum(['officeId', 'autoReply', 'autoReplyOnSince', 'language'])

export type OfficeSettingScalarFieldEnum = z.infer<typeof OfficeSettingScalarFieldEnumSchema>;

// File: ModelUsageScalarFieldEnum.schema.ts

export const ModelUsageScalarFieldEnumSchema = z.enum(['officeId', 'day', 'task', 'calls'])

export type ModelUsageScalarFieldEnum = z.infer<typeof ModelUsageScalarFieldEnumSchema>;

// File: LeadTallyScalarFieldEnum.schema.ts

export const LeadTallyScalarFieldEnumSchema = z.enum(['id', 'officeId', 'pipe', 'language', 'firstInboundAt', 'firstReplyAt', 'inConversation', 'outcome'])

export type LeadTallyScalarFieldEnum = z.infer<typeof LeadTallyScalarFieldEnumSchema>;

// File: GuestDeletionScalarFieldEnum.schema.ts

export const GuestDeletionScalarFieldEnumSchema = z.enum(['id', 'officeId', 'actorId', 'actorName', 'at', 'reason', 'note', 'messages', 'answers', 'translations', 'notifications', 'crmKind', 'crmResult'])

export type GuestDeletionScalarFieldEnum = z.infer<typeof GuestDeletionScalarFieldEnumSchema>;

// File: PushSubscriptionScalarFieldEnum.schema.ts

export const PushSubscriptionScalarFieldEnumSchema = z.enum(['id', 'userId', 'sessionId', 'endpoint', 'p256dh', 'auth', 'userAgent', 'createdAt', 'lastSuccessAt'])

export type PushSubscriptionScalarFieldEnum = z.infer<typeof PushSubscriptionScalarFieldEnumSchema>;

// File: SortOrder.schema.ts

export const SortOrderSchema = z.enum(['asc', 'desc'])

export type SortOrder = z.infer<typeof SortOrderSchema>;

// File: JsonNullValueInput.schema.ts

export const JsonNullValueInputSchema = z.enum(['JsonNull'])

export type JsonNullValueInput = z.infer<typeof JsonNullValueInputSchema>;

// File: NullableJsonNullValueInput.schema.ts

export const NullableJsonNullValueInputSchema = z.enum(['DbNull', 'JsonNull'])

export type NullableJsonNullValueInput = z.infer<typeof NullableJsonNullValueInputSchema>;

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

export const NotificationTypeSchema = z.enum(['WELCOME', 'APP_UPDATE', 'PIPE_DISCONNECTED', 'THREAD_ASSIGNED', 'THREAD_MOVED'])

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

// File: NotificationTarget.schema.ts

export const NotificationTargetSchema = z.enum(['IN_APP', 'EMAIL'])

export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

// File: Pipe.schema.ts

export const PipeSchema = z.enum(['zalo', 'whatsapp'])

export type Pipe = z.infer<typeof PipeSchema>;

// File: MessageDirection.schema.ts

export const MessageDirectionSchema = z.enum(['in', 'out'])

export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

// File: MessageSource.schema.ts

export const MessageSourceSchema = z.enum(['guest', 'oa_echo', 'nhip', 'auto_reply'])

export type MessageSource = z.infer<typeof MessageSourceSchema>;

// File: DraftSource.schema.ts

export const DraftSourceSchema = z.enum(['template', 'model'])

export type DraftSource = z.infer<typeof DraftSourceSchema>;

// File: AnswerStatus.schema.ts

export const AnswerStatusSchema = z.enum(['sending', 'sent', 'failed', 'unknown'])

export type AnswerStatus = z.infer<typeof AnswerStatusSchema>;

// File: CrmKind.schema.ts

export const CrmKindSchema = z.enum(['mock', 'hubspot'])

export type CrmKind = z.infer<typeof CrmKindSchema>;

// File: CrmLinkMethod.schema.ts

export const CrmLinkMethodSchema = z.enum(['created', 'phone', 'zaloId'])

export type CrmLinkMethod = z.infer<typeof CrmLinkMethodSchema>;

// File: CrmOutcomeStatus.schema.ts

export const CrmOutcomeStatusSchema = z.enum(['open', 'won', 'lost'])

export type CrmOutcomeStatus = z.infer<typeof CrmOutcomeStatusSchema>;

// File: AlertKind.schema.ts

export const AlertKindSchema = z.enum(['guest', 'returned', 'assigned', 'test'])

export type AlertKind = z.infer<typeof AlertKindSchema>;

// File: GuestDeletionReason.schema.ts

export const GuestDeletionReasonSchema = z.enum(['guest_request', 'duplicate_or_spam', 'test_data', 'other'])

export type GuestDeletionReason = z.infer<typeof GuestDeletionReasonSchema>;

// File: GuestDeletionCrmResult.schema.ts

export const GuestDeletionCrmResultSchema = z.enum(['deleted', 'unlinked', 'pending', 'failed'])

export type GuestDeletionCrmResult = z.infer<typeof GuestDeletionCrmResultSchema>;

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


// File: RateLimit.schema.ts

export const RateLimitSchema = z.object({
  id: z.string(),
  key: z.string(),
  count: z.number().int(),
  lastRequest: z.bigint(),
});

export type RateLimitType = z.infer<typeof RateLimitSchema>;


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
  officeId: z.string(),
  language: z.string().nullish(),
  guestLanguage: z.string().nullish(),
  lastGuestInboundAt: z.date().nullish(),
  sentAt: z.date().nullish(),
  ownerId: z.string().nullish(),
  autoReplyAt: z.date().nullish(),
  updatedAt: z.date(),
});

export type ConversationType = z.infer<typeof ConversationSchema>;


// File: Message.schema.ts

export const MessageSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  conversationId: z.string(),
  officeId: z.string(),
  direction: MessageDirectionSchema,
  source: MessageSourceSchema,
  text: z.string(),
  at: z.date(),
  vendorMessageId: z.string().nullish(),
  mock: z.boolean(),
  pipeExternalId: z.string().nullish(),
  writtenBy: DraftSourceSchema.nullish(),
});

export type MessageType = z.infer<typeof MessageSchema>;


// File: Translation.schema.ts

export const TranslationSchema = z.object({
  messageId: z.string(),
  officeId: z.string(),
  locale: z.string(),
  text: z.string(),
});

export type TranslationType = z.infer<typeof TranslationSchema>;


// File: TranslationFailure.schema.ts

export const TranslationFailureSchema = z.object({
  messageId: z.string(),
  officeId: z.string(),
  locale: z.string(),
  attempts: z.number().int(),
  lastFailedAt: z.date(),
});

export type TranslationFailureType = z.infer<typeof TranslationFailureSchema>;


// File: Qualification.schema.ts

export const QualificationSchema = z.object({
  conversationId: z.string(),
  officeId: z.string(),
  areaOfInterest: z.string().nullish(),
  nationality: z.string().nullish(),
  inVietnamNow: z.boolean().nullish(),
  rentOrBuy: z.string().nullish(),
  timeframe: z.string().nullish(),
  budgetBand: z.string().nullish(),
  bedsOrHousehold: z.string().nullish(),
});

export type QualificationType = z.infer<typeof QualificationSchema>;


// File: Draft.schema.ts

export const DraftSchema = z.object({
  conversationId: z.string(),
  officeId: z.string(),
  reply: z.string(),
  answersMessageId: z.string().nullish(),
  source: DraftSourceSchema.default("template"),
  officeReply: z.string().nullish(),
});

export type DraftType = z.infer<typeof DraftSchema>;


// File: Paperwork.schema.ts

export const PaperworkSchema = z.object({
  conversationId: z.string(),
  officeId: z.string(),
  mentioned: z.boolean(),
  flag: z.string().nullish(),
});

export type PaperworkType = z.infer<typeof PaperworkSchema>;


// File: Answer.schema.ts

export const AnswerSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  conversationId: z.string(),
  officeId: z.string(),
  inboundId: z.string(),
  text: z.string(),
  operatorId: z.string().nullish(),
  operatorName: z.string().nullish(),
  status: AnswerStatusSchema,
  mock: z.boolean(),
  pipe: PipeSchema,
  pipeExternalId: z.string().nullish(),
  vendorMessageId: z.string().nullish(),
  approvedAt: z.date(),
  sentAt: z.date().nullish(),
  failedAt: z.date().nullish(),
  failureReason: z.string().nullish(),
});

export type AnswerType = z.infer<typeof AnswerSchema>;


// File: PipeConnection.schema.ts

export const PipeConnectionSchema = z.object({
  pipe: PipeSchema,
  externalId: z.string(),
  officeId: z.string(),
});

export type PipeConnectionType = z.infer<typeof PipeConnectionSchema>;


// File: PipeCredential.schema.ts

export const PipeCredentialSchema = z.object({
  pipe: PipeSchema,
  externalId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.date(),
  disconnectedAt: z.date().nullish(),
  disconnectedReason: z.string().nullish(),
  updatedAt: z.date(),
});

export type PipeCredentialType = z.infer<typeof PipeCredentialSchema>;


// File: WebhookDelivery.schema.ts

export const WebhookDeliverySchema = z.object({
  id: z.string(),
  pipe: PipeSchema,
  receivedAt: z.date(),
  outcome: z.string(),
  endpoints: z.array(z.string()),
  officeIds: z.array(z.string()),
  filed: z.number().int(),
  dropped: z.number().int(),
  vendorMessageIds: z.array(z.string()),
  errorKind: z.string().nullish(),
});

export type WebhookDeliveryType = z.infer<typeof WebhookDeliverySchema>;


// File: CrmConnection.schema.ts

export const CrmConnectionSchema = z.object({
  officeId: z.string(),
  kind: CrmKindSchema,
  accessToken: z.string().nullish(),
  accountId: z.string().nullish(),
  leadUrlPrefix: z.string().nullish(),
  updatedAt: z.date(),
});

export type CrmConnectionType = z.infer<typeof CrmConnectionSchema>;


// File: CrmLink.schema.ts

export const CrmLinkSchema = z.object({
  conversationId: z.string(),
  officeId: z.string(),
  leadId: z.string().nullish(),
  leadName: z.string().nullish(),
  method: CrmLinkMethodSchema.nullish(),
  claimedAt: z.date(),
  linkedAt: z.date().nullish(),
  outcome: CrmOutcomeStatusSchema.nullish(),
  outcomeAt: z.date().nullish(),
  outcomeReason: z.string().nullish(),
  outcomeObservedAt: z.date().nullish(),
});

export type CrmLinkType = z.infer<typeof CrmLinkSchema>;


// File: MockCrmLead.schema.ts

export const MockCrmLeadSchema = z.object({
  id: z.string(),
  officeId: z.string(),
  name: z.string(),
  phone: z.string().nullish(),
  zaloUserId: z.string().nullish(),
  pipe: PipeSchema,
  language: z.string().nullish(),
  fields: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").nullish(),
  threadUrl: z.string(),
  outcome: CrmOutcomeStatusSchema.default("open"),
  outcomeAt: z.date().nullish(),
  outcomeReason: z.string().nullish(),
  createdAt: z.date(),
});

export type MockCrmLeadType = z.infer<typeof MockCrmLeadSchema>;


// File: MockCrmOutage.schema.ts

export const MockCrmOutageSchema = z.object({
  officeId: z.string(),
  since: z.date(),
});

export type MockCrmOutageType = z.infer<typeof MockCrmOutageSchema>;


// File: CrmWriteFailure.schema.ts

export const CrmWriteFailureSchema = z.object({
  conversationId: z.string(),
  officeId: z.string(),
  attempts: z.number().int(),
  lastFailedAt: z.date(),
});

export type CrmWriteFailureType = z.infer<typeof CrmWriteFailureSchema>;


// File: InboxAlert.schema.ts

export const InboxAlertSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conversationId: z.string().nullish(),
  officeId: z.string(),
  kind: AlertKindSchema,
  sounded: z.boolean(),
  link: z.string(),
  createdAt: z.date(),
});

export type InboxAlertType = z.infer<typeof InboxAlertSchema>;


// File: OfficeSetting.schema.ts

export const OfficeSettingSchema = z.object({
  officeId: z.string(),
  autoReply: z.boolean().default(true),
  autoReplyOnSince: z.date().nullish(),
  language: z.string().nullish(),
});

export type OfficeSettingType = z.infer<typeof OfficeSettingSchema>;


// File: ModelUsage.schema.ts

export const ModelUsageSchema = z.object({
  officeId: z.string(),
  day: z.date(),
  task: z.string(),
  calls: z.number().int(),
});

export type ModelUsageType = z.infer<typeof ModelUsageSchema>;


// File: LeadTally.schema.ts

export const LeadTallySchema = z.object({
  id: z.string(),
  officeId: z.string(),
  pipe: PipeSchema,
  language: z.string().nullish(),
  firstInboundAt: z.date(),
  firstReplyAt: z.date().nullish(),
  inConversation: z.boolean(),
  outcome: CrmOutcomeStatusSchema.nullish(),
});

export type LeadTallyType = z.infer<typeof LeadTallySchema>;


// File: GuestDeletion.schema.ts

export const GuestDeletionSchema = z.object({
  id: z.string(),
  officeId: z.string(),
  actorId: z.string().nullish(),
  actorName: z.string(),
  at: z.date(),
  reason: GuestDeletionReasonSchema.default("other"),
  note: z.string().nullish(),
  messages: z.number().int(),
  answers: z.number().int(),
  translations: z.number().int(),
  notifications: z.number().int(),
  crmKind: CrmKindSchema.nullish(),
  crmResult: GuestDeletionCrmResultSchema.nullish(),
});

export type GuestDeletionType = z.infer<typeof GuestDeletionSchema>;


// File: PushSubscription.schema.ts

export const PushSubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  userAgent: z.string().nullish(),
  createdAt: z.date(),
  lastSuccessAt: z.date().nullish(),
});

export type PushSubscriptionType = z.infer<typeof PushSubscriptionSchema>;

