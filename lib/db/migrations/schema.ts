import { pgTable, index, foreignKey, unique, uuid, varchar, timestamp, text, boolean, integer, real, numeric, jsonb, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const practices = pgTable("practices", {
	practiceId: uuid("practice_id").defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	domain: varchar({ length: 255 }).notNull(),
	templateId: uuid("template_id"),
	status: varchar({ length: 20 }).default('pending'),
	ownerUserId: uuid("owner_user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_practices_domain").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("idx_practices_owner").using("btree", table.ownerUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_practices_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_practices_template_id").using("btree", table.templateId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.userId],
			name: "practices_owner_user_id_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [templates.templateId],
			name: "practices_template_id_templates_template_id_fk"
		}),
	unique("practices_domain_unique").on(table.domain),
]);

export const templates = pgTable("templates", {
	templateId: uuid("template_id").defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 100 }).notNull(),
	description: text(),
	previewImageUrl: varchar("preview_image_url", { length: 500 }),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_templates_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_templates_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("templates_slug_unique").on(table.slug),
]);

export const staffMembers = pgTable("staff_members", {
	staffId: uuid("staff_id").defaultRandom().primaryKey().notNull(),
	practiceId: uuid("practice_id"),
	name: varchar({ length: 255 }).notNull(),
	title: varchar({ length: 255 }),
	credentials: varchar({ length: 255 }),
	bio: text(),
	photoUrl: varchar("photo_url", { length: 500 }),
	specialties: text(),
	education: text(),
	displayOrder: integer("display_order").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_staff_members_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_staff_members_display_order").using("btree", table.practiceId.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("int4_ops")),
	index("idx_staff_members_practice_id").using("btree", table.practiceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.practiceId],
			foreignColumns: [practices.practiceId],
			name: "staff_members_practice_id_practices_practice_id_fk"
		}).onDelete("cascade"),
]);

export const practiceAttributes = pgTable("practice_attributes", {
	practiceAttributeId: uuid("practice_attribute_id").defaultRandom().primaryKey().notNull(),
	practiceId: uuid("practice_id"),
	phone: varchar({ length: 20 }),
	email: varchar({ length: 255 }),
	addressLine1: varchar("address_line1", { length: 255 }),
	addressLine2: varchar("address_line2", { length: 255 }),
	city: varchar({ length: 100 }),
	state: varchar({ length: 50 }),
	zipCode: varchar("zip_code", { length: 20 }),
	businessHours: text("business_hours"),
	services: text(),
	insuranceAccepted: text("insurance_accepted"),
	conditionsTreated: text("conditions_treated"),
	aboutText: text("about_text"),
	missionStatement: text("mission_statement"),
	welcomeMessage: text("welcome_message"),
	logoUrl: varchar("logo_url", { length: 500 }),
	heroImageUrl: varchar("hero_image_url", { length: 500 }),
	galleryImages: text("gallery_images"),
	metaTitle: varchar("meta_title", { length: 255 }),
	metaDescription: varchar("meta_description", { length: 500 }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	primaryColor: varchar("primary_color", { length: 7 }),
	secondaryColor: varchar("secondary_color", { length: 7 }),
	accentColor: varchar("accent_color", { length: 7 }),
	heroOverlayOpacity: real("hero_overlay_opacity").default(0.1),
}, (table) => [
	index("idx_practice_attributes_practice_id").using("btree", table.practiceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.practiceId],
			foreignColumns: [practices.practiceId],
			name: "practice_attributes_practice_id_practices_practice_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	userId: uuid("user_id").defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 100 }).notNull(),
	lastName: varchar("last_name", { length: 100 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	emailVerified: boolean("email_verified").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	providerUid: integer("provider_uid"),
}, (table) => [
	index("idx_users_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_users_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_users_provider_uid").using("btree", table.providerUid.asc().nullsLast().op("int4_ops")).where(sql`(provider_uid IS NOT NULL)`),
	unique("users_email_unique").on(table.email),
]);

export const oidcStates = pgTable("oidc_states", {
	state: varchar({ length: 255 }).primaryKey().notNull(),
	nonce: varchar({ length: 255 }).notNull(),
	userFingerprint: varchar("user_fingerprint", { length: 64 }),
	isUsed: boolean("is_used").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_oidc_states_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_oidc_states_is_used").using("btree", table.isUsed.asc().nullsLast().op("bool_ops")),
]);

export const oidcNonces = pgTable("oidc_nonces", {
	nonce: varchar({ length: 255 }).primaryKey().notNull(),
	state: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_oidc_nonces_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_oidc_nonces_state").using("btree", table.state.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.state],
			foreignColumns: [oidcStates.state],
			name: "oidc_nonces_state_oidc_states_state_fk"
		}).onDelete("cascade"),
]);

export const auditLogs = pgTable("audit_logs", {
	auditLogId: varchar("audit_log_id", { length: 255 }).primaryKey().notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	action: varchar({ length: 100 }).notNull(),
	userId: varchar("user_id", { length: 255 }),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	resourceType: varchar("resource_type", { length: 50 }),
	resourceId: varchar("resource_id", { length: 255 }),
	oldValues: text("old_values"),
	newValues: text("new_values"),
	metadata: text(),
	severity: varchar({ length: 20 }).default('low').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_audit_logs_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_audit_logs_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_audit_logs_resource").using("btree", table.resourceType.asc().nullsLast().op("text_ops"), table.resourceId.asc().nullsLast().op("text_ops")),
	index("idx_audit_logs_severity").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("idx_audit_logs_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const loginAttempts = pgTable("login_attempts", {
	attemptId: varchar("attempt_id", { length: 255 }).primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	userId: uuid("user_id"),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	userAgent: text("user_agent"),
	deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
	success: boolean().notNull(),
	failureReason: varchar("failure_reason", { length: 100 }),
	rememberMeRequested: boolean("remember_me_requested").default(false).notNull(),
	sessionId: varchar("session_id", { length: 255 }),
	attemptedAt: timestamp("attempted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_login_attempts_attempted_at").using("btree", table.attemptedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_login_attempts_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_login_attempts_ip").using("btree", table.ipAddress.asc().nullsLast().op("text_ops")),
	index("idx_login_attempts_session_id").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("idx_login_attempts_success").using("btree", table.success.asc().nullsLast().op("bool_ops")),
	index("idx_login_attempts_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	tokenId: varchar("token_id", { length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: varchar("token_hash", { length: 64 }).notNull(),
	deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	userAgent: text("user_agent"),
	rememberMe: boolean("remember_me").default(false).notNull(),
	issuedAt: timestamp("issued_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastUsed: timestamp("last_used", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revokedReason: varchar("revoked_reason", { length: 50 }),
	rotationCount: integer("rotation_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_refresh_tokens_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_refresh_tokens_device").using("btree", table.deviceFingerprint.asc().nullsLast().op("text_ops")),
	index("idx_refresh_tokens_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_refresh_tokens_hash").using("btree", table.tokenHash.asc().nullsLast().op("text_ops")),
	index("idx_refresh_tokens_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const tokenBlacklist = pgTable("token_blacklist", {
	jti: varchar({ length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenType: varchar("token_type", { length: 20 }).notNull(),
	blacklistedAt: timestamp("blacklisted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	reason: varchar({ length: 50 }).notNull(),
	blacklistedBy: uuid("blacklisted_by"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
}, (table) => [
	index("idx_token_blacklist_blacklisted_at").using("btree", table.blacklistedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_token_blacklist_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_token_blacklist_type").using("btree", table.tokenType.asc().nullsLast().op("text_ops")),
	index("idx_token_blacklist_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const userSessions = pgTable("user_sessions", {
	sessionId: varchar("session_id", { length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	refreshTokenId: varchar("refresh_token_id", { length: 255 }),
	deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
	deviceName: varchar("device_name", { length: 100 }),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	userAgent: text("user_agent"),
	rememberMe: boolean("remember_me").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastActivity: timestamp("last_activity", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	endReason: varchar("end_reason", { length: 50 }),
}, (table) => [
	index("idx_user_sessions_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_user_sessions_device").using("btree", table.deviceFingerprint.asc().nullsLast().op("text_ops")),
	index("idx_user_sessions_last_activity").using("btree", table.lastActivity.asc().nullsLast().op("timestamptz_ops")),
	index("idx_user_sessions_refresh_token").using("btree", table.refreshTokenId.asc().nullsLast().op("text_ops")),
	index("idx_user_sessions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const samlReplayPrevention = pgTable("saml_replay_prevention", {
	replayId: text("replay_id").primaryKey().notNull(),
	inResponseTo: text("in_response_to").notNull(),
	userEmail: text("user_email").notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	ipAddress: text("ip_address").notNull(),
	userAgent: text("user_agent"),
	sessionId: text("session_id"),
}, (table) => [
	index("idx_saml_replay_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_saml_replay_in_response_to").using("btree", table.inResponseTo.asc().nullsLast().op("text_ops")),
	index("idx_saml_replay_user_email").using("btree", table.userEmail.asc().nullsLast().op("text_ops")),
]);

export const practiceComments = pgTable("practice_comments", {
	commentId: uuid("comment_id").defaultRandom().primaryKey().notNull(),
	practiceId: uuid("practice_id").notNull(),
	commenterName: varchar("commenter_name", { length: 255 }),
	commenterLocation: varchar("commenter_location", { length: 255 }),
	comment: text().notNull(),
	rating: numeric().notNull(),
	displayOrder: integer("display_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_practice_comments_display_order").using("btree", table.practiceId.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("int4_ops")),
	index("idx_practice_comments_practice_id").using("btree", table.practiceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.practiceId],
			foreignColumns: [practices.practiceId],
			name: "practice_comments_practice_id_practices_practice_id_fk"
		}).onDelete("cascade"),
]);

export const workItemActivity = pgTable("work_item_activity", {
	workItemActivityId: uuid("work_item_activity_id").defaultRandom().primaryKey().notNull(),
	workItemId: uuid("work_item_id").notNull(),
	activityType: text("activity_type").notNull(),
	fieldName: text("field_name"),
	oldValue: text("old_value"),
	newValue: text("new_value"),
	description: text(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_activity_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_activity_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_activity_type").using("btree", table.activityType.asc().nullsLast().op("text_ops")),
	index("idx_activity_work_item").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "work_item_activity_created_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.workItemId],
			name: "work_item_activity_work_item_id_work_items_work_item_id_fk"
		}).onDelete("cascade"),
]);

export const workItemAttachments = pgTable("work_item_attachments", {
	workItemAttachmentId: uuid("work_item_attachment_id").defaultRandom().primaryKey().notNull(),
	workItemId: uuid("work_item_id").notNull(),
	fileName: text("file_name").notNull(),
	fileSize: integer("file_size").notNull(),
	fileType: text("file_type").notNull(),
	s3Key: text("s3_key").notNull(),
	s3Bucket: text("s3_bucket").notNull(),
	uploadedBy: uuid("uploaded_by").notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_attachments_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_attachments_uploaded_at").using("btree", table.uploadedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_attachments_uploaded_by").using("btree", table.uploadedBy.asc().nullsLast().op("uuid_ops")),
	index("idx_attachments_work_item").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.userId],
			name: "work_item_attachments_uploaded_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.workItemId],
			name: "work_item_attachments_work_item_id_work_items_work_item_id_fk"
		}).onDelete("cascade"),
]);

export const accountSecurity = pgTable("account_security", {
	userId: uuid("user_id").primaryKey().notNull(),
	failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
	lastFailedAttempt: timestamp("last_failed_attempt", { withTimezone: true, mode: 'string' }),
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'string' }),
	lockoutReason: varchar("lockout_reason", { length: 50 }),
	maxConcurrentSessions: integer("max_concurrent_sessions").default(3).notNull(),
	requireFreshAuthMinutes: integer("require_fresh_auth_minutes").default(5).notNull(),
	passwordChangedAt: timestamp("password_changed_at", { withTimezone: true, mode: 'string' }),
	lastPasswordReset: timestamp("last_password_reset", { withTimezone: true, mode: 'string' }),
	suspiciousActivityDetected: boolean("suspicious_activity_detected").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
	mfaMethod: varchar("mfa_method", { length: 20 }),
	mfaEnforcedAt: timestamp("mfa_enforced_at", { withTimezone: true, mode: 'string' }),
	mfaSkipsRemaining: integer("mfa_skips_remaining").default(5).notNull(),
	mfaSkipCount: integer("mfa_skip_count").default(0).notNull(),
	mfaFirstSkippedAt: timestamp("mfa_first_skipped_at", { withTimezone: true, mode: 'string' }),
	mfaLastSkippedAt: timestamp("mfa_last_skipped_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_account_security_locked_until").using("btree", table.lockedUntil.asc().nullsLast().op("timestamptz_ops")),
	index("idx_account_security_mfa_enabled").using("btree", table.mfaEnabled.asc().nullsLast().op("bool_ops")),
	index("idx_account_security_mfa_skips").using("btree", table.mfaSkipsRemaining.asc().nullsLast().op("int4_ops")),
	index("idx_account_security_suspicious").using("btree", table.suspiciousActivityDetected.asc().nullsLast().op("bool_ops")),
]);

export const webauthnCredentials = pgTable("webauthn_credentials", {
	credentialId: varchar("credential_id", { length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	publicKey: text("public_key").notNull(),
	counter: integer().default(0).notNull(),
	credentialDeviceType: varchar("credential_device_type", { length: 32 }).notNull(),
	transports: text(),
	aaguid: text(),
	credentialName: varchar("credential_name", { length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastUsed: timestamp("last_used", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	backedUp: boolean("backed_up").default(false).notNull(),
	registrationIp: varchar("registration_ip", { length: 45 }).notNull(),
	registrationUserAgent: text("registration_user_agent"),
}, (table) => [
	index("idx_webauthn_credentials_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_webauthn_credentials_last_used").using("btree", table.lastUsed.asc().nullsLast().op("timestamptz_ops")),
	index("idx_webauthn_credentials_user_active").using("btree", table.userId.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("uuid_ops")),
	index("idx_webauthn_credentials_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.userId],
			name: "webauthn_credentials_user_id_users_user_id_fk"
		}).onDelete("cascade"),
]);

export const webauthnChallenges = pgTable("webauthn_challenges", {
	challengeId: varchar("challenge_id", { length: 255 }).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	challenge: varchar({ length: 255 }).notNull(),
	challengeType: varchar("challenge_type", { length: 20 }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_webauthn_challenges_challenge_type").using("btree", table.challengeType.asc().nullsLast().op("text_ops")),
	index("idx_webauthn_challenges_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_webauthn_challenges_expires_used").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops"), table.usedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_webauthn_challenges_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
]);

export const permissions = pgTable("permissions", {
	permissionId: uuid("permission_id").defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	resource: varchar({ length: 50 }).notNull(),
	action: varchar({ length: 50 }).notNull(),
	scope: varchar({ length: 50 }).default('own'),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_permissions_action").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("idx_permissions_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_permissions_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_permissions_resource").using("btree", table.resource.asc().nullsLast().op("text_ops")),
	index("idx_permissions_resource_action").using("btree", table.resource.asc().nullsLast().op("text_ops"), table.action.asc().nullsLast().op("text_ops")),
	index("idx_permissions_scope").using("btree", table.scope.asc().nullsLast().op("text_ops")),
	unique("permissions_name_unique").on(table.name),
]);

export const dashboards = pgTable("dashboards", {
	dashboardId: uuid("dashboard_id").defaultRandom().primaryKey().notNull(),
	dashboardName: varchar("dashboard_name", { length: 255 }).notNull(),
	dashboardDescription: text("dashboard_description"),
	layoutConfig: jsonb("layout_config").notNull(),
	dashboardCategoryId: integer("dashboard_category_id"),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isActive: boolean("is_active").default(true),
	isPublished: boolean("is_published").default(false),
	isDefault: boolean("is_default").default(false),
	organizationId: uuid("organization_id"),
}, (table) => [
	index("idx_dashboards_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_dashboards_category").using("btree", table.dashboardCategoryId.asc().nullsLast().op("int4_ops")),
	index("idx_dashboards_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_dashboards_default").using("btree", table.isDefault.asc().nullsLast().op("bool_ops")).where(sql`(is_default = true)`),
	index("idx_dashboards_name").using("btree", table.dashboardName.asc().nullsLast().op("text_ops")),
	index("idx_dashboards_organization_id").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_dashboards_published").using("btree", table.isPublished.asc().nullsLast().op("bool_ops")),
	index("idx_dashboards_published_org").using("btree", table.isPublished.asc().nullsLast().op("bool_ops"), table.organizationId.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "dashboards_created_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.dashboardCategoryId],
			foreignColumns: [chartCategories.chartCategoryId],
			name: "dashboards_dashboard_category_id_chart_categories_chart_categor"
		}),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.organizationId],
			name: "dashboards_organization_id_organizations_organization_id_fk"
		}).onDelete("set null"),
]);

export const workItemFields = pgTable("work_item_fields", {
	workItemFieldId: uuid("work_item_field_id").defaultRandom().primaryKey().notNull(),
	workItemTypeId: uuid("work_item_type_id").notNull(),
	fieldName: varchar("field_name", { length: 100 }).notNull(),
	fieldLabel: varchar("field_label", { length: 255 }).notNull(),
	fieldType: varchar("field_type", { length: 50 }).notNull(),
	fieldDescription: text("field_description"),
	fieldOptions: jsonb("field_options"),
	validationRules: jsonb("validation_rules"),
	defaultValue: text("default_value"),
	displayOrder: integer("display_order").default(0).notNull(),
	isVisible: boolean("is_visible").default(true),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	fieldConfig: jsonb("field_config"),
	isRequiredOnCreation: boolean("is_required_on_creation").default(false).notNull(),
	isRequiredToComplete: boolean("is_required_to_complete").default(false).notNull(),
}, (table) => [
	index("idx_work_item_fields_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_work_item_fields_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_work_item_fields_display_order").using("btree", table.displayOrder.asc().nullsLast().op("int4_ops")),
	index("idx_work_item_fields_type").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_item_fields_type_order").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops"), table.displayOrder.asc().nullsLast().op("uuid_ops")),
	index("idx_work_item_fields_type_visible").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops"), table.isVisible.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "work_item_fields_created_by_users_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workItemTypeId],
			foreignColumns: [workItemTypes.workItemTypeId],
			name: "work_item_fields_work_item_type_id_work_item_types_work_item_ty"
		}).onDelete("cascade"),
]);

export const workItemComments = pgTable("work_item_comments", {
	workItemCommentId: uuid("work_item_comment_id").defaultRandom().primaryKey().notNull(),
	workItemId: uuid("work_item_id").notNull(),
	parentCommentId: uuid("parent_comment_id"),
	commentText: text("comment_text").notNull(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_comments_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_comments_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_comments_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_comments_parent").using("btree", table.parentCommentId.asc().nullsLast().op("uuid_ops")),
	index("idx_comments_work_item").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "work_item_comments_created_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.workItemId],
			name: "work_item_comments_work_item_id_work_items_work_item_id_fk"
		}).onDelete("cascade"),
]);

export const workItemFieldValues = pgTable("work_item_field_values", {
	workItemFieldValueId: uuid("work_item_field_value_id").defaultRandom().primaryKey().notNull(),
	workItemId: uuid("work_item_id").notNull(),
	workItemFieldId: uuid("work_item_field_id").notNull(),
	fieldValue: jsonb("field_value").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_work_item_field_values_field").using("btree", table.workItemFieldId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_item_field_values_work_item").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_item_field_values_work_item_field").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops"), table.workItemFieldId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workItemFieldId],
			foreignColumns: [workItemFields.workItemFieldId],
			name: "work_item_field_values_work_item_field_id_work_item_fields_work"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.workItemId],
			name: "work_item_field_values_work_item_id_work_items_work_item_id_fk"
		}).onDelete("cascade"),
]);

export const workItemStatuses = pgTable("work_item_statuses", {
	workItemStatusId: uuid("work_item_status_id").defaultRandom().primaryKey().notNull(),
	workItemTypeId: uuid("work_item_type_id").notNull(),
	statusName: text("status_name").notNull(),
	statusCategory: text("status_category").notNull(),
	isInitial: boolean("is_initial").default(false).notNull(),
	isFinal: boolean("is_final").default(false).notNull(),
	color: text(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_statuses_category").using("btree", table.statusCategory.asc().nullsLast().op("text_ops")),
	index("idx_statuses_type").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workItemTypeId],
			foreignColumns: [workItemTypes.workItemTypeId],
			name: "work_item_statuses_work_item_type_id_work_item_types_work_item_"
		}).onDelete("cascade"),
]);

export const roles = pgTable("roles", {
	roleId: uuid("role_id").defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	organizationId: uuid("organization_id"),
	isSystemRole: boolean("is_system_role").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_roles_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_roles_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_roles_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_roles_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_roles_organization").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_roles_system").using("btree", table.isSystemRole.asc().nullsLast().op("bool_ops")),
	index("idx_unique_role_per_org").using("btree", table.name.asc().nullsLast().op("text_ops"), table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.organizationId],
			name: "roles_organization_id_organizations_organization_id_fk"
		}).onDelete("cascade"),
]);

export const userRoles = pgTable("user_roles", {
	userRoleId: uuid("user_role_id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	roleId: uuid("role_id").notNull(),
	organizationId: uuid("organization_id"),
	grantedBy: uuid("granted_by"),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_unique_user_role_org").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.roleId.asc().nullsLast().op("uuid_ops"), table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_roles_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_user_roles_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_user_roles_granted_by").using("btree", table.grantedBy.asc().nullsLast().op("uuid_ops")),
	index("idx_user_roles_organization").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_roles_role").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_roles_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.organizationId],
			name: "user_roles_organization_id_organizations_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.roleId],
			name: "user_roles_role_id_roles_role_id_fk"
		}).onDelete("cascade"),
]);

export const userOrganizations = pgTable("user_organizations", {
	userOrganizationId: uuid("user_organization_id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	organizationId: uuid("organization_id").notNull(),
	isActive: boolean("is_active").default(true),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_unique_user_organization").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_organizations_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_user_organizations_joined_at").using("btree", table.joinedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_user_organizations_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_organizations_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.organizationId],
			name: "user_organizations_organization_id_organizations_organization_i"
		}).onDelete("cascade"),
]);

export const organizations = pgTable("organizations", {
	organizationId: uuid("organization_id").defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 100 }).notNull(),
	parentOrganizationId: uuid("parent_organization_id"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	practiceUids: integer("practice_uids").array().default([]),
}, (table) => [
	index("idx_organizations_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_organizations_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_organizations_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_organizations_parent").using("btree", table.parentOrganizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_organizations_practice_uids").using("gin", table.practiceUids.asc().nullsLast().op("array_ops")),
	index("idx_organizations_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("organizations_slug_unique").on(table.slug),
]);

export const rolePermissions = pgTable("role_permissions", {
	rolePermissionId: uuid("role_permission_id").defaultRandom().primaryKey().notNull(),
	roleId: uuid("role_id").notNull(),
	permissionId: uuid("permission_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_role_permissions_permission").using("btree", table.permissionId.asc().nullsLast().op("uuid_ops")),
	index("idx_role_permissions_role").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
	index("idx_unique_role_permission").using("btree", table.roleId.asc().nullsLast().op("uuid_ops"), table.permissionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [permissions.permissionId],
			name: "role_permissions_permission_id_permissions_permission_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.roleId],
			name: "role_permissions_role_id_roles_role_id_fk"
		}).onDelete("cascade"),
]);

export const dataSources = pgTable("data_sources", {
	dataSourceId: integer("data_source_id").primaryKey().generatedByDefaultAsIdentity({ name: "data_sources_data_source_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	dataSourceName: varchar("data_source_name", { length: 100 }).notNull(),
	tableName: varchar("table_name", { length: 100 }).notNull(),
	schemaName: varchar("schema_name", { length: 50 }).notNull(),
	dataSourceDescription: text("data_source_description"),
	availableFields: jsonb("available_fields"),
	sampleQuery: text("sample_query"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_data_sources_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_data_sources_name").using("btree", table.dataSourceName.asc().nullsLast().op("text_ops")),
	index("idx_data_sources_table").using("btree", table.tableName.asc().nullsLast().op("text_ops")),
]);

export const chartCategories = pgTable("chart_categories", {
	chartCategoryId: integer("chart_category_id").primaryKey().generatedByDefaultAsIdentity({ name: "chart_categories_chart_category_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	categoryName: varchar("category_name", { length: 100 }).notNull(),
	categoryDescription: text("category_description"),
	parentCategoryId: integer("parent_category_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chart_categories_name").using("btree", table.categoryName.asc().nullsLast().op("text_ops")),
	index("idx_chart_categories_parent").using("btree", table.parentCategoryId.asc().nullsLast().op("int4_ops")),
]);

export const chartPermissions = pgTable("chart_permissions", {
	chartPermissionId: uuid("chart_permission_id").defaultRandom().primaryKey().notNull(),
	chartDefinitionId: uuid("chart_definition_id").notNull(),
	userId: uuid("user_id").notNull(),
	permissionType: varchar("permission_type", { length: 20 }).notNull(),
	grantedByUserId: uuid("granted_by_user_id").notNull(),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chart_permissions_chart").using("btree", table.chartDefinitionId.asc().nullsLast().op("uuid_ops")),
	index("idx_chart_permissions_type").using("btree", table.permissionType.asc().nullsLast().op("text_ops")),
	index("idx_chart_permissions_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.chartDefinitionId],
			foreignColumns: [chartDefinitions.chartDefinitionId],
			name: "chart_permissions_chart_definition_id_chart_definitions_chart_d"
		}),
	foreignKey({
			columns: [table.grantedByUserId],
			foreignColumns: [users.userId],
			name: "chart_permissions_granted_by_user_id_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.userId],
			name: "chart_permissions_user_id_users_user_id_fk"
		}),
]);

export const chartDefinitions = pgTable("chart_definitions", {
	chartDefinitionId: uuid("chart_definition_id").defaultRandom().primaryKey().notNull(),
	chartName: varchar("chart_name", { length: 255 }).notNull(),
	chartDescription: text("chart_description"),
	chartType: varchar("chart_type", { length: 50 }).notNull(),
	dataSource: jsonb("data_source").notNull(),
	chartConfig: jsonb("chart_config").notNull(),
	accessControl: jsonb("access_control"),
	chartCategoryId: integer("chart_category_id"),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isActive: boolean("is_active").default(true),
	dataSourceId: integer("data_source_id"),
}, (table) => [
	index("idx_chart_definitions_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_chart_definitions_category").using("btree", table.chartCategoryId.asc().nullsLast().op("int4_ops")),
	index("idx_chart_definitions_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_chart_definitions_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_chart_definitions_data_source").using("btree", table.dataSourceId.asc().nullsLast().op("int4_ops")),
	index("idx_chart_definitions_name").using("btree", table.chartName.asc().nullsLast().op("text_ops")),
	index("idx_chart_definitions_type").using("btree", table.chartType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.chartCategoryId],
			foreignColumns: [chartCategories.chartCategoryId],
			name: "chart_definitions_chart_category_id_chart_categories_chart_cate"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "chart_definitions_created_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.dataSourceId],
			foreignColumns: [chartDataSources.dataSourceId],
			name: "chart_definitions_data_source_id_chart_data_sources_data_source"
		}).onDelete("set null"),
]);

export const dashboardCharts = pgTable("dashboard_charts", {
	dashboardChartId: uuid("dashboard_chart_id").defaultRandom().primaryKey().notNull(),
	dashboardId: uuid("dashboard_id").notNull(),
	chartDefinitionId: uuid("chart_definition_id").notNull(),
	positionConfig: jsonb("position_config"),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_dashboard_charts_chart").using("btree", table.chartDefinitionId.asc().nullsLast().op("uuid_ops")),
	index("idx_dashboard_charts_dashboard").using("btree", table.dashboardId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.chartDefinitionId],
			foreignColumns: [chartDefinitions.chartDefinitionId],
			name: "dashboard_charts_chart_definition_id_chart_definitions_chart_de"
		}),
	foreignKey({
			columns: [table.dashboardId],
			foreignColumns: [dashboards.dashboardId],
			name: "dashboard_charts_dashboard_id_dashboards_dashboard_id_fk"
		}),
]);

export const userChartFavorites = pgTable("user_chart_favorites", {
	userId: uuid("user_id").notNull(),
	chartDefinitionId: uuid("chart_definition_id").notNull(),
	favoritedAt: timestamp("favorited_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_user_chart_favorites_chart").using("btree", table.chartDefinitionId.asc().nullsLast().op("uuid_ops")),
	index("idx_user_chart_favorites_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("pk_user_chart_favorites").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.chartDefinitionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.chartDefinitionId],
			foreignColumns: [chartDefinitions.chartDefinitionId],
			name: "user_chart_favorites_chart_definition_id_chart_definitions_char"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.userId],
			name: "user_chart_favorites_user_id_users_user_id_fk"
		}),
]);

export const colorPalettes = pgTable("color_palettes", {
	paletteId: integer("palette_id").primaryKey().generatedByDefaultAsIdentity({ name: "color_palettes_palette_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	paletteName: varchar("palette_name", { length: 100 }).notNull(),
	paletteDescription: text("palette_description"),
	colors: jsonb().notNull(),
	paletteType: varchar("palette_type", { length: 50 }).default('general'),
	maxColors: integer("max_colors"),
	isColorblindSafe: boolean("is_colorblind_safe").default(false),
	contrastRatio: numeric("contrast_ratio", { precision: 3, scale:  2 }),
	isDefault: boolean("is_default").default(false),
	isSystem: boolean("is_system").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: uuid("created_by"),
}, (table) => [
	index("idx_color_palettes_default").using("btree", table.isDefault.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_color_palettes_system").using("btree", table.isSystem.asc().nullsLast().op("bool_ops")),
	index("idx_color_palettes_type").using("btree", table.paletteType.asc().nullsLast().op("text_ops")),
]);

export const chartDisplayConfigurations = pgTable("chart_display_configurations", {
	displayConfigurationId: integer("display_configuration_id").primaryKey().generatedByDefaultAsIdentity({ name: "chart_display_configs_config_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	chartType: varchar("chart_type", { length: 50 }).notNull(),
	frequency: varchar({ length: 20 }),
	xAxisConfig: jsonb("x_axis_config"),
	yAxisConfig: jsonb("y_axis_config"),
	defaultWidth: integer("default_width").default(800),
	defaultHeight: integer("default_height").default(400),
	paddingConfig: jsonb("padding_config"),
	timeUnit: varchar("time_unit", { length: 20 }),
	timeDisplayFormat: varchar("time_display_format", { length: 50 }),
	timeTooltipFormat: varchar("time_tooltip_format", { length: 50 }),
	showLegend: boolean("show_legend").default(true),
	showTooltips: boolean("show_tooltips").default(true),
	enableAnimation: boolean("enable_animation").default(true),
	defaultColorPaletteId: integer("default_color_palette_id"),
	isDefault: boolean("is_default").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chart_display_configurations_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_chart_display_configurations_default").using("btree", table.isDefault.asc().nullsLast().op("bool_ops")),
	index("idx_chart_display_configurations_type_freq").using("btree", table.chartType.asc().nullsLast().op("text_ops"), table.frequency.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.defaultColorPaletteId],
			foreignColumns: [colorPalettes.paletteId],
			name: "chart_display_configurations_default_color_palette_id_color_pal"
		}),
]);

export const chartDataSourceColumns = pgTable("chart_data_source_columns", {
	columnId: integer("column_id").primaryKey().generatedByDefaultAsIdentity({ name: "chart_data_source_columns_column_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	dataSourceId: integer("data_source_id").notNull(),
	columnName: varchar("column_name", { length: 100 }).notNull(),
	displayName: varchar("display_name", { length: 100 }).notNull(),
	columnDescription: text("column_description"),
	dataType: varchar("data_type", { length: 50 }).notNull(),
	isFilterable: boolean("is_filterable").default(false),
	isGroupable: boolean("is_groupable").default(false),
	isMeasure: boolean("is_measure").default(false),
	isDimension: boolean("is_dimension").default(false),
	isDateField: boolean("is_date_field").default(false),
	formatType: varchar("format_type", { length: 50 }),
	sortOrder: integer("sort_order").default(0),
	defaultAggregation: varchar("default_aggregation", { length: 20 }),
	isSensitive: boolean("is_sensitive").default(false),
	accessLevel: varchar("access_level", { length: 20 }).default('all'),
	allowedValues: jsonb("allowed_values"),
	validationRules: jsonb("validation_rules"),
	exampleValue: text("example_value"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	isMeasureType: boolean("is_measure_type").default(false),
	isTimePeriod: boolean("is_time_period").default(false),
	displayIcon: boolean("display_icon").default(false),
	iconType: varchar("icon_type", { length: 20 }),
	iconColorMode: varchar("icon_color_mode", { length: 20 }).default('auto'),
	iconColor: varchar("icon_color", { length: 50 }),
	iconMapping: jsonb("icon_mapping"),
}, (table) => [
	index("idx_chart_data_source_columns_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_chart_data_source_columns_data_source").using("btree", table.dataSourceId.asc().nullsLast().op("int4_ops")),
	index("idx_chart_data_source_columns_flags").using("btree", table.isFilterable.asc().nullsLast().op("bool_ops"), table.isGroupable.asc().nullsLast().op("bool_ops"), table.isMeasure.asc().nullsLast().op("bool_ops"), table.isMeasureType.asc().nullsLast().op("bool_ops")),
	index("idx_chart_data_source_columns_unique").using("btree", table.dataSourceId.asc().nullsLast().op("text_ops"), table.columnName.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.dataSourceId],
			foreignColumns: [chartDataSources.dataSourceId],
			name: "chart_data_source_columns_data_source_id_chart_data_sources_dat"
		}).onDelete("cascade"),
]);

export const csrfFailureEvents = pgTable("csrf_failure_events", {
	eventId: uuid("event_id").defaultRandom().primaryKey().notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	userAgent: text("user_agent").notNull(),
	pathname: varchar({ length: 500 }).notNull(),
	reason: varchar({ length: 200 }).notNull(),
	severity: varchar({ length: 20 }).notNull(),
	userId: uuid("user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_csrf_failures_alert_detection").using("btree", table.ipAddress.asc().nullsLast().op("text_ops"), table.severity.asc().nullsLast().op("text_ops"), table.timestamp.asc().nullsLast().op("text_ops")),
	index("idx_csrf_failures_ip_timestamp").using("btree", table.ipAddress.asc().nullsLast().op("text_ops"), table.timestamp.asc().nullsLast().op("text_ops")),
	index("idx_csrf_failures_pathname_timestamp").using("btree", table.pathname.asc().nullsLast().op("text_ops"), table.timestamp.asc().nullsLast().op("text_ops")),
	index("idx_csrf_failures_severity_timestamp").using("btree", table.severity.asc().nullsLast().op("text_ops"), table.timestamp.asc().nullsLast().op("text_ops")),
	index("idx_csrf_failures_timestamp").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("idx_csrf_failures_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.userId],
			name: "csrf_failure_events_user_id_users_user_id_fk"
		}).onDelete("set null"),
]);

export const workItems = pgTable("work_items", {
	workItemId: uuid("work_item_id").defaultRandom().primaryKey().notNull(),
	workItemTypeId: uuid("work_item_type_id").notNull(),
	organizationId: uuid("organization_id").notNull(),
	subject: text().notNull(),
	description: text(),
	statusId: uuid("status_id").notNull(),
	priority: text().default('medium').notNull(),
	assignedTo: uuid("assigned_to"),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	parentWorkItemId: uuid("parent_work_item_id"),
	rootWorkItemId: uuid("root_work_item_id"),
	depth: integer().default(0).notNull(),
	path: text(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_work_items_assigned").using("btree", table.assignedTo.asc().nullsLast().op("uuid_ops")),
	index("idx_work_items_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_work_items_created_by").using("btree", table.createdBy.asc().nullsLast().op("uuid_ops")),
	index("idx_work_items_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_work_items_depth").using("btree", table.depth.asc().nullsLast().op("int4_ops")),
	index("idx_work_items_due_date").using("btree", table.dueDate.asc().nullsLast().op("timestamptz_ops")),
	index("idx_work_items_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_items_parent").using("btree", table.parentWorkItemId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_items_path").using("btree", table.path.asc().nullsLast().op("text_ops")),
	index("idx_work_items_priority").using("btree", table.priority.asc().nullsLast().op("text_ops")),
	index("idx_work_items_root").using("btree", table.rootWorkItemId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_items_status").using("btree", table.statusId.asc().nullsLast().op("uuid_ops")),
	index("idx_work_items_type").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.assignedTo],
			foreignColumns: [users.userId],
			name: "work_items_assigned_to_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "work_items_created_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.organizationId],
			name: "work_items_organization_id_organizations_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.statusId],
			foreignColumns: [workItemStatuses.workItemStatusId],
			name: "work_items_status_id_work_item_statuses_work_item_status_id_fk"
		}),
	foreignKey({
			columns: [table.workItemTypeId],
			foreignColumns: [workItemTypes.workItemTypeId],
			name: "work_items_work_item_type_id_work_item_types_work_item_type_id_"
		}),
]);

export const workItemTypes = pgTable("work_item_types", {
	workItemTypeId: uuid("work_item_type_id").defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id"),
	name: text().notNull(),
	description: text(),
	icon: text(),
	color: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_work_item_types_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_work_item_types_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_work_item_types_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.userId],
			name: "work_item_types_created_by_users_user_id_fk"
		}),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.organizationId],
			name: "work_item_types_organization_id_organizations_organization_id_f"
		}).onDelete("cascade"),
]);

export const workItemStatusTransitions = pgTable("work_item_status_transitions", {
	workItemStatusTransitionId: uuid("work_item_status_transition_id").defaultRandom().primaryKey().notNull(),
	workItemTypeId: uuid("work_item_type_id").notNull(),
	fromStatusId: uuid("from_status_id").notNull(),
	toStatusId: uuid("to_status_id").notNull(),
	isAllowed: boolean("is_allowed").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	validationConfig: jsonb("validation_config"),
	actionConfig: jsonb("action_config"),
}, (table) => [
	index("idx_transitions_from").using("btree", table.fromStatusId.asc().nullsLast().op("uuid_ops")),
	index("idx_transitions_to").using("btree", table.toStatusId.asc().nullsLast().op("uuid_ops")),
	index("idx_transitions_type").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops")),
	index("idx_unique_transition").using("btree", table.workItemTypeId.asc().nullsLast().op("uuid_ops"), table.fromStatusId.asc().nullsLast().op("uuid_ops"), table.toStatusId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.fromStatusId],
			foreignColumns: [workItemStatuses.workItemStatusId],
			name: "work_item_status_transitions_from_status_id_work_item_statuses_"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toStatusId],
			foreignColumns: [workItemStatuses.workItemStatusId],
			name: "work_item_status_transitions_to_status_id_work_item_statuses_wo"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workItemTypeId],
			foreignColumns: [workItemTypes.workItemTypeId],
			name: "work_item_status_transitions_work_item_type_id_work_item_types_"
		}).onDelete("cascade"),
]);

export const workItemTypeRelationships = pgTable("work_item_type_relationships", {
	workItemTypeRelationshipId: uuid("work_item_type_relationship_id").defaultRandom().primaryKey().notNull(),
	parentTypeId: uuid("parent_type_id").notNull(),
	childTypeId: uuid("child_type_id").notNull(),
	relationshipName: text("relationship_name").notNull(),
	isRequired: boolean("is_required").default(false).notNull(),
	minCount: integer("min_count"),
	maxCount: integer("max_count"),
	autoCreate: boolean("auto_create").default(false).notNull(),
	autoCreateConfig: jsonb("auto_create_config"),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_type_relationships_child").using("btree", table.childTypeId.asc().nullsLast().op("uuid_ops")),
	index("idx_type_relationships_deleted_at").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_type_relationships_parent").using("btree", table.parentTypeId.asc().nullsLast().op("uuid_ops")),
	index("idx_unique_type_relationship").using("btree", table.parentTypeId.asc().nullsLast().op("timestamptz_ops"), table.childTypeId.asc().nullsLast().op("uuid_ops"), table.deletedAt.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.childTypeId],
			foreignColumns: [workItemTypes.workItemTypeId],
			name: "work_item_type_relationships_child_type_id_work_item_types_work"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.parentTypeId],
			foreignColumns: [workItemTypes.workItemTypeId],
			name: "work_item_type_relationships_parent_type_id_work_item_types_wor"
		}).onDelete("cascade"),
]);

export const workItemWatchers = pgTable("work_item_watchers", {
	workItemWatcherId: uuid("work_item_watcher_id").defaultRandom().primaryKey().notNull(),
	workItemId: uuid("work_item_id").notNull(),
	userId: uuid("user_id").notNull(),
	watchType: text("watch_type").default('manual').notNull(),
	notifyStatusChanges: boolean("notify_status_changes").default(true).notNull(),
	notifyComments: boolean("notify_comments").default(true).notNull(),
	notifyAssignments: boolean("notify_assignments").default(true).notNull(),
	notifyDueDate: boolean("notify_due_date").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_unique_watcher").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops"), table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_watchers_type").using("btree", table.watchType.asc().nullsLast().op("text_ops")),
	index("idx_watchers_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("idx_watchers_work_item").using("btree", table.workItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.userId],
			name: "work_item_watchers_user_id_users_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workItemId],
			foreignColumns: [workItems.workItemId],
			name: "work_item_watchers_work_item_id_work_items_work_item_id_fk"
		}).onDelete("cascade"),
]);

export const chartDataSources = pgTable("chart_data_sources", {
	dataSourceId: integer("data_source_id").primaryKey().generatedByDefaultAsIdentity({ name: "chart_data_sources_data_source_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	dataSourceName: varchar("data_source_name", { length: 100 }).notNull(),
	dataSourceDescription: text("data_source_description"),
	tableName: varchar("table_name", { length: 100 }).notNull(),
	schemaName: varchar("schema_name", { length: 50 }).notNull(),
	databaseType: varchar("database_type", { length: 50 }).default('postgresql'),
	connectionConfig: jsonb("connection_config"),
	isActive: boolean("is_active").default(true),
	requiresAuth: boolean("requires_auth").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: uuid("created_by"),
	dataSourceType: varchar("data_source_type", { length: 20 }).default('measure-based').notNull(),
}, (table) => [
	index("idx_chart_data_sources_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_chart_data_sources_table").using("btree", table.tableName.asc().nullsLast().op("text_ops")),
	index("idx_chart_data_sources_type").using("btree", table.dataSourceType.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("text_ops")),
]);

export const explorerQueryPatterns = pgTable("explorer_query_patterns", {
	queryPatternId: uuid("query_pattern_id").defaultRandom().primaryKey().notNull(),
	patternType: text("pattern_type"),
	naturalLanguagePattern: text("natural_language_pattern"),
	sqlPattern: text("sql_pattern"),
	tablesInvolved: text("tables_involved").array(),
	usageCount: integer("usage_count").default(1),
	successRate: numeric("success_rate", { precision: 5, scale:  2 }),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_explorer_patterns_type").using("btree", table.patternType.asc().nullsLast().op("text_ops")),
]);

export const explorerTableMetadata = pgTable("explorer_table_metadata", {
	tableMetadataId: uuid("table_metadata_id").defaultRandom().primaryKey().notNull(),
	schemaName: text("schema_name").default('ih').notNull(),
	tableName: text("table_name").notNull(),
	displayName: text("display_name"),
	description: text(),
	rowMeaning: text("row_meaning"),
	primaryEntity: text("primary_entity"),
	commonFilters: text("common_filters").array(),
	commonJoins: text("common_joins").array(),
	tier: integer().default(3),
	sampleQuestions: text("sample_questions").array(),
	tags: text().array(),
	isActive: boolean("is_active").default(true),
	isAutoDiscovered: boolean("is_auto_discovered").default(false),
	confidenceScore: numeric("confidence_score", { precision: 3, scale:  2 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	rowCountEstimate: bigint("row_count_estimate", { mode: "number" }),
	lastAnalyzed: timestamp("last_analyzed", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: text("created_by"),
	updatedBy: text("updated_by"),
}, (table) => [
	index("idx_explorer_table_metadata_schema_table").using("btree", table.schemaName.asc().nullsLast().op("text_ops"), table.tableName.asc().nullsLast().op("text_ops")),
	index("idx_explorer_table_metadata_tier").using("btree", table.tier.asc().nullsLast().op("int4_ops"), table.isActive.asc().nullsLast().op("int4_ops")),
]);

export const explorerColumnMetadata = pgTable("explorer_column_metadata", {
	columnMetadataId: uuid("column_metadata_id").defaultRandom().primaryKey().notNull(),
	tableId: uuid("table_id").notNull(),
	columnName: text("column_name").notNull(),
	displayName: text("display_name"),
	description: text(),
	dataType: text("data_type").notNull(),
	semanticType: text("semantic_type"),
	isNullable: boolean("is_nullable").default(true),
	isPrimaryKey: boolean("is_primary_key").default(false),
	isForeignKey: boolean("is_foreign_key").default(false),
	foreignKeyTable: text("foreign_key_table"),
	foreignKeyColumn: text("foreign_key_column"),
	isOrgFilter: boolean("is_org_filter").default(false),
	isPhi: boolean("is_phi").default(false),
	commonValues: jsonb("common_values"),
	valueFormat: text("value_format"),
	exampleValues: text("example_values").array(),
	minValue: text("min_value"),
	maxValue: text("max_value"),
	distinctCount: integer("distinct_count"),
	nullPercentage: numeric("null_percentage", { precision: 5, scale:  2 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_explorer_column_metadata_table").using("btree", table.tableId.asc().nullsLast().op("uuid_ops")),
	index("idx_explorer_column_semantic").using("btree", table.semanticType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tableId],
			foreignColumns: [explorerTableMetadata.tableMetadataId],
			name: "explorer_column_metadata_table_id_explorer_table_metadata_table"
		}).onDelete("cascade"),
]);

export const explorerQueryHistory = pgTable("explorer_query_history", {
	queryHistoryId: uuid("query_history_id").defaultRandom().primaryKey().notNull(),
	naturalLanguageQuery: text("natural_language_query").notNull(),
	generatedSql: text("generated_sql").notNull(),
	executedSql: text("executed_sql"),
	finalSql: text("final_sql"),
	status: text().notNull(),
	executionTimeMs: integer("execution_time_ms"),
	rowCount: integer("row_count"),
	errorMessage: text("error_message"),
	errorDetails: jsonb("error_details"),
	userId: text("user_id").notNull(),
	userEmail: text("user_email"),
	organizationId: text("organization_id"),
	modelUsed: text("model_used").default('claude-3-5-sonnet'),
	modelTemperature: numeric("model_temperature", { precision: 2, scale:  1 }),
	promptTokens: integer("prompt_tokens"),
	completionTokens: integer("completion_tokens"),
	totalCostCents: integer("total_cost_cents"),
	userRating: integer("user_rating"),
	userFeedback: text("user_feedback"),
	wasHelpful: boolean("was_helpful"),
	tablesUsed: text("tables_used").array(),
	executionPlan: jsonb("execution_plan"),
	resultSample: jsonb("result_sample"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	metadata: jsonb(),
}, (table) => [
	index("idx_explorer_query_history_org").using("btree", table.organizationId.asc().nullsLast().op("text_ops")),
	index("idx_explorer_query_history_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_explorer_query_history_tables").using("gin", table.tablesUsed.asc().nullsLast().op("array_ops")),
	index("idx_explorer_query_history_user").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
]);

export const explorerSavedQueries = pgTable("explorer_saved_queries", {
	savedQueryId: uuid("saved_query_id").defaultRandom().primaryKey().notNull(),
	queryHistoryId: uuid("query_history_id"),
	name: text().notNull(),
	description: text(),
	category: text(),
	naturalLanguageTemplate: text("natural_language_template"),
	sqlTemplate: text("sql_template"),
	templateVariables: jsonb("template_variables"),
	tags: text().array(),
	isPublic: boolean("is_public").default(false),
	usageCount: integer("usage_count").default(0),
	lastUsed: timestamp("last_used", { withTimezone: true, mode: 'string' }),
	createdBy: text("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_explorer_saved_queries_category").using("btree", table.category.asc().nullsLast().op("text_ops"), table.isPublic.asc().nullsLast().op("text_ops")),
	index("idx_explorer_saved_queries_created_by").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.queryHistoryId],
			foreignColumns: [explorerQueryHistory.queryHistoryId],
			name: "explorer_saved_queries_query_history_id_explorer_query_history_"
		}),
]);

export const explorerTableRelationships = pgTable("explorer_table_relationships", {
	tableRelationshipId: uuid("table_relationship_id").defaultRandom().primaryKey().notNull(),
	fromTableId: uuid("from_table_id"),
	toTableId: uuid("to_table_id"),
	relationshipType: text("relationship_type"),
	joinCondition: text("join_condition").notNull(),
	isCommon: boolean("is_common").default(false),
	confidenceScore: numeric("confidence_score", { precision: 3, scale:  2 }),
	discoveredFrom: text("discovered_from"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.fromTableId],
			foreignColumns: [explorerTableMetadata.tableMetadataId],
			name: "explorer_table_relationships_from_table_id_explorer_table_metad"
		}),
	foreignKey({
			columns: [table.toTableId],
			foreignColumns: [explorerTableMetadata.tableMetadataId],
			name: "explorer_table_relationships_to_table_id_explorer_table_metadat"
		}),
]);

export const explorerSchemaInstructions = pgTable("explorer_schema_instructions", {
	instructionId: uuid("instruction_id").defaultRandom().primaryKey().notNull(),
	schemaName: text("schema_name").default('ih').notNull(),
	category: text(),
	title: text().notNull(),
	instruction: text().notNull(),
	priority: integer().default(2),
	appliesToTables: text("applies_to_tables").array(),
	exampleQuery: text("example_query"),
	exampleSql: text("example_sql"),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: text("created_by"),
	updatedBy: text("updated_by"),
}, (table) => [
	index("idx_schema_instructions_priority").using("btree", table.priority.asc().nullsLast().op("int4_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_schema_instructions_schema").using("btree", table.schemaName.asc().nullsLast().op("bool_ops"), table.isActive.asc().nullsLast().op("text_ops")),
]);
