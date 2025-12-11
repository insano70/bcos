# User Announcements System - Design Document

## Overview

A system for delivering announcements to users when they log in or return to the application. Announcements support markdown, can target all users or specific users, and track read status per user.

**Use Cases:**
- Release notes and new feature announcements
- System maintenance notifications
- Policy updates
- Organization-specific communications

---

## Design Decisions

Based on review feedback:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Content format | Markdown | Simple, portable, easy to render |
| Multiple announcements | List view | Better UX for multiple items |
| Re-publish capability | Yes | Allow resending to users who already read |
| Dismiss without reading | No | Only confirmation marks as read |
| Header badge | Yes | Visual indicator of unread count |
| Organization scoping | Global only | Keep simple for v1 |
| Column types | `text` | PostgreSQL best practice over varchar |
| Permissions | Use existing | `settings:update:all` (admin), `users:read:own` (user) |

---

## Database Schema

### New Schema File: `lib/db/announcements-schema.ts`

```typescript
// lib/db/announcements-schema.ts
import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './rbac-schema';

/**
 * Announcements table - stores announcement content and targeting
 */
export const announcements = pgTable(
  'announcements',
  {
    announcement_id: uuid('announcement_id').primaryKey().defaultRandom(),

    // Content
    subject: text('subject').notNull(),
    body: text('body').notNull(), // Markdown content

    // Targeting
    target_type: text('target_type').notNull().default('all'),
    // 'all' = all users, 'specific' = only users in announcement_recipients

    // Scheduling
    publish_at: timestamp('publish_at', { withTimezone: true }),
    // null = publish immediately, otherwise scheduled for future
    expires_at: timestamp('expires_at', { withTimezone: true }),
    // null = never expires, otherwise auto-dismiss after this date

    // Status
    is_active: boolean('is_active').default(true).notNull(),

    // Priority/Display
    priority: text('priority').notNull().default('normal'),
    // 'low', 'normal', 'high', 'urgent'

    // Audit
    created_by: uuid('created_by')
      .references(() => users.user_id)
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }), // Soft delete
  },
  (table) => [
    index('idx_announcements_publish_at').on(table.publish_at),
    index('idx_announcements_target_type').on(table.target_type),
    index('idx_announcements_is_active').on(table.is_active),
    index('idx_announcements_created_at').on(table.created_at),
  ]
);

/**
 * Announcement recipients - for targeted announcements
 * Only populated when target_type = 'specific'
 */
export const announcement_recipients = pgTable(
  'announcement_recipients',
  {
    announcement_recipient_id: uuid('announcement_recipient_id').primaryKey().defaultRandom(),
    announcement_id: uuid('announcement_id')
      .references(() => announcements.announcement_id, { onDelete: 'cascade' })
      .notNull(),
    user_id: uuid('user_id')
      .references(() => users.user_id, { onDelete: 'cascade' })
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_announcement_recipients_announcement').on(table.announcement_id),
    index('idx_announcement_recipients_user').on(table.user_id),
    unique('uq_announcement_recipients').on(table.announcement_id, table.user_id),
  ]
);

/**
 * Announcement reads - tracks which users have acknowledged which announcements
 */
export const announcement_reads = pgTable(
  'announcement_reads',
  {
    announcement_read_id: uuid('announcement_read_id').primaryKey().defaultRandom(),
    announcement_id: uuid('announcement_id')
      .references(() => announcements.announcement_id, { onDelete: 'cascade' })
      .notNull(),
    user_id: uuid('user_id')
      .references(() => users.user_id, { onDelete: 'cascade' })
      .notNull(),
    read_at: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_announcement_reads_announcement').on(table.announcement_id),
    index('idx_announcement_reads_user').on(table.user_id),
    unique('uq_announcement_reads').on(table.announcement_id, table.user_id),
  ]
);

// Relations
export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [announcements.created_by],
    references: [users.user_id],
  }),
  recipients: many(announcement_recipients),
  reads: many(announcement_reads),
}));

export const announcementRecipientsRelations = relations(announcement_recipients, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcement_recipients.announcement_id],
    references: [announcements.announcement_id],
  }),
  user: one(users, {
    fields: [announcement_recipients.user_id],
    references: [users.user_id],
  }),
}));

export const announcementReadsRelations = relations(announcement_reads, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcement_reads.announcement_id],
    references: [announcements.announcement_id],
  }),
  user: one(users, {
    fields: [announcement_reads.user_id],
    references: [users.user_id],
  }),
}));
```

### Update Main Schema Export

Add to `lib/db/schema.ts`:
```typescript
export {
  announcements,
  announcement_recipients,
  announcement_reads,
  announcementsRelations,
  announcementRecipientsRelations,
  announcementReadsRelations,
} from './announcements-schema';
```

---

## Service Layer

Following single responsibility principle, split into focused services:

### 1. Admin CRUD Service: `lib/services/rbac-announcements-service.ts`

Extends `BaseCrudService` for standard CRUD operations. Admin-only operations.

```typescript
import type { InferSelectModel } from 'drizzle-orm';
import { eq, like, or, and, isNull, sql, getTableColumns } from 'drizzle-orm';

import { db } from '@/lib/db';
import { announcements, announcement_recipients, announcement_reads, users } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseCrudService, type BaseQueryOptions, type CrudServiceConfig, type JoinQueryConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

// Entity types
export type Announcement = InferSelectModel<typeof announcements>;

export interface AnnouncementWithDetails extends Announcement {
  created_by_name?: string;
  recipient_count?: number;
  read_count?: number;
}

export interface CreateAnnouncementData {
  subject: string;
  body: string;
  target_type: 'all' | 'specific';
  recipient_user_ids?: string[];
  publish_at?: Date | null;
  expires_at?: Date | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface UpdateAnnouncementData {
  subject?: string;
  body?: string;
  target_type?: 'all' | 'specific';
  recipient_user_ids?: string[];
  publish_at?: Date | null;
  expires_at?: Date | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  is_active?: boolean;
}

export interface AnnouncementQueryOptions extends BaseQueryOptions {
  target_type?: 'all' | 'specific';
  is_active?: boolean;
  include_expired?: boolean;
}

/**
 * Admin CRUD Service for Announcements
 * Uses settings:update:all permission for all operations (admin only)
 */
export class RBACAnnouncementsService extends BaseCrudService<
  typeof announcements,
  AnnouncementWithDetails,
  CreateAnnouncementData,
  UpdateAnnouncementData,
  AnnouncementQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof announcements,
    AnnouncementWithDetails,
    CreateAnnouncementData,
    UpdateAnnouncementData,
    AnnouncementQueryOptions
  > = {
    table: announcements,
    resourceName: 'announcements',
    displayName: 'announcement',
    primaryKeyName: 'announcement_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'settings:update:all',
      create: 'settings:update:all',
      update: 'settings:update:all',
      delete: 'settings:update:all',
    },
    // No organization scoping - announcements are global
    transformers: {
      toCreateValues: (data, ctx) => ({
        subject: data.subject,
        body: data.body,
        target_type: data.target_type,
        publish_at: data.publish_at ?? null,
        expires_at: data.expires_at ?? null,
        priority: data.priority ?? 'normal',
        created_by: ctx.user_id,
      }),
      toEntity: (row) => ({
        ...row,
        created_by_name: row.created_by_name as string | undefined,
        recipient_count: row.recipient_count as number | undefined,
        read_count: row.read_count as number | undefined,
      } as AnnouncementWithDetails),
    },
    hooks: {
      afterCreate: async (entity, ctx) => {
        // Handle recipient creation if target_type is 'specific'
        // This is handled in the createAnnouncement method below
      },
    },
  };

  protected buildSearchConditions(search: string): SQL[] {
    return [
      like(announcements.subject, `%${search}%`),
      like(announcements.body, `%${search}%`),
    ];
  }

  /**
   * Build JOIN query to include creator name and counts
   */
  protected buildJoinQuery(): JoinQueryConfig {
    return {
      selectFields: {
        ...getTableColumns(announcements),
        created_by_name: sql<string>`CONCAT(${users.first_name}, ' ', ${users.last_name})`.as('created_by_name'),
        recipient_count: sql<number>`(
          SELECT COUNT(*) FROM announcement_recipients ar
          WHERE ar.announcement_id = ${announcements.announcement_id}
        )`.as('recipient_count'),
        read_count: sql<number>`(
          SELECT COUNT(*) FROM announcement_reads ar
          WHERE ar.announcement_id = ${announcements.announcement_id}
        )`.as('read_count'),
      },
      joins: [
        {
          table: users,
          on: eq(announcements.created_by, users.user_id),
          type: 'left',
        },
      ],
    };
  }

  protected buildCustomConditions(options: AnnouncementQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.target_type) {
      conditions.push(eq(announcements.target_type, options.target_type));
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(announcements.is_active, options.is_active));
    }

    if (!options.include_expired) {
      conditions.push(
        or(
          isNull(announcements.expires_at),
          sql`${announcements.expires_at} > NOW()`
        )!
      );
    }

    return conditions;
  }

  /**
   * Create announcement with recipients (wraps base create)
   */
  async createAnnouncement(data: CreateAnnouncementData): Promise<AnnouncementWithDetails> {
    const announcement = await this.create(data);

    // Add recipients if target_type is 'specific'
    if (data.target_type === 'specific' && data.recipient_user_ids?.length) {
      await this.setRecipients(announcement.announcement_id, data.recipient_user_ids);
    }

    return announcement;
  }

  /**
   * Update announcement with recipients (wraps base update)
   */
  async updateAnnouncement(
    id: string,
    data: UpdateAnnouncementData
  ): Promise<AnnouncementWithDetails> {
    const announcement = await this.update(id, data);

    // Update recipients if provided
    if (data.recipient_user_ids !== undefined) {
      await this.setRecipients(id, data.recipient_user_ids);
    }

    return announcement;
  }

  /**
   * Set recipients for an announcement (replaces existing)
   */
  async setRecipients(announcementId: string, userIds: string[]): Promise<void> {
    // Delete existing recipients
    await db
      .delete(announcement_recipients)
      .where(eq(announcement_recipients.announcement_id, announcementId));

    // Insert new recipients
    if (userIds.length > 0) {
      await db.insert(announcement_recipients).values(
        userIds.map((userId) => ({
          announcement_id: announcementId,
          user_id: userId,
        }))
      );
    }
  }

  /**
   * Get recipients for an announcement
   */
  async getRecipients(announcementId: string): Promise<{ user_id: string; email: string; name: string }[]> {
    const result = await db
      .select({
        user_id: users.user_id,
        email: users.email,
        name: sql<string>`CONCAT(${users.first_name}, ' ', ${users.last_name})`,
      })
      .from(announcement_recipients)
      .innerJoin(users, eq(announcement_recipients.user_id, users.user_id))
      .where(eq(announcement_recipients.announcement_id, announcementId));

    return result;
  }

  /**
   * Re-publish an announcement (clear read records so users see it again)
   */
  async republish(announcementId: string): Promise<void> {
    this.requirePermission('settings:update:all');

    await db
      .delete(announcement_reads)
      .where(eq(announcement_reads.announcement_id, announcementId));

    // Log the re-publish action
    log.info('announcement republished', {
      operation: 'republish_announcement',
      resourceType: 'announcement',
      resourceId: announcementId,
      userId: this.userContext.user_id,
      component: 'announcements',
    });
  }
}

export function createRBACAnnouncementsService(userContext: UserContext): RBACAnnouncementsService {
  return new RBACAnnouncementsService(userContext);
}
```

### 2. User-Facing Service: `lib/services/user-announcements-service.ts`

Handles user-specific operations (get unread, mark as read). Separate service following single responsibility.

```typescript
import { and, eq, isNull, or, sql, desc, notExists } from 'drizzle-orm';

import { db } from '@/lib/db';
import { announcements, announcement_recipients, announcement_reads } from '@/lib/db';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

export interface UnreadAnnouncement {
  announcement_id: string;
  subject: string;
  body: string;
  priority: string;
  created_at: Date;
}

/**
 * User-Facing Announcements Service
 * Handles fetching unread announcements and marking as read
 * Uses users:read:own permission (all authenticated users have this)
 */
export class UserAnnouncementsService extends BaseRBACService {
  /**
   * Get all unread announcements for the current user
   * Returns a list for display in modal
   */
  async getUnreadAnnouncements(): Promise<UnreadAnnouncement[]> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;

    // Subquery to check if user has read the announcement
    const hasRead = db
      .select({ announcement_id: announcement_reads.announcement_id })
      .from(announcement_reads)
      .where(
        and(
          eq(announcement_reads.announcement_id, announcements.announcement_id),
          eq(announcement_reads.user_id, userId)
        )
      );

    // Subquery to check if user is a recipient (for targeted announcements)
    const isRecipient = db
      .select({ announcement_id: announcement_recipients.announcement_id })
      .from(announcement_recipients)
      .where(
        and(
          eq(announcement_recipients.announcement_id, announcements.announcement_id),
          eq(announcement_recipients.user_id, userId)
        )
      );

    const result = await db
      .select({
        announcement_id: announcements.announcement_id,
        subject: announcements.subject,
        body: announcements.body,
        priority: announcements.priority,
        created_at: announcements.created_at,
      })
      .from(announcements)
      .where(
        and(
          eq(announcements.is_active, true),
          isNull(announcements.deleted_at),
          // Published (null = immediate, or publish_at <= now)
          or(
            isNull(announcements.publish_at),
            sql`${announcements.publish_at} <= NOW()`
          ),
          // Not expired (null = never, or expires_at > now)
          or(
            isNull(announcements.expires_at),
            sql`${announcements.expires_at} > NOW()`
          ),
          // User is target (all users OR specific recipient)
          or(
            eq(announcements.target_type, 'all'),
            sql`EXISTS (${isRecipient})`
          ),
          // User has not read it yet
          sql`NOT EXISTS (${hasRead})`
        )
      )
      .orderBy(
        // Priority order: urgent > high > normal > low
        sql`CASE ${announcements.priority}
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END`,
        desc(announcements.created_at)
      );

    return result;
  }

  /**
   * Get count of unread announcements (for header badge)
   */
  async getUnreadCount(): Promise<number> {
    this.requirePermission('users:read:own');

    const unread = await this.getUnreadAnnouncements();
    return unread.length;
  }

  /**
   * Mark a single announcement as read
   */
  async markAsRead(announcementId: string): Promise<void> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;

    // Use INSERT ... ON CONFLICT to handle duplicate reads gracefully
    await db
      .insert(announcement_reads)
      .values({
        announcement_id: announcementId,
        user_id: userId,
      })
      .onConflictDoNothing();

    log.info('announcement acknowledged', {
      operation: 'acknowledge_announcement',
      resourceType: 'announcement',
      resourceId: announcementId,
      userId,
      component: 'announcements',
    });
  }

  /**
   * Mark all unread announcements as read
   */
  async markAllAsRead(): Promise<number> {
    this.requirePermission('users:read:own');

    const userId = this.userContext.user_id;
    const unread = await this.getUnreadAnnouncements();

    if (unread.length === 0) {
      return 0;
    }

    // Bulk insert read records
    await db.insert(announcement_reads).values(
      unread.map((a) => ({
        announcement_id: a.announcement_id,
        user_id: userId,
      }))
    ).onConflictDoNothing();

    log.info('all announcements acknowledged', {
      operation: 'acknowledge_all_announcements',
      userId,
      count: unread.length,
      component: 'announcements',
    });

    return unread.length;
  }
}

export function createUserAnnouncementsService(userContext: UserContext): UserAnnouncementsService {
  return new UserAnnouncementsService(userContext);
}
```

### Service Architecture Summary

| Service | Responsibility | Permission |
|---------|---------------|------------|
| `RBACAnnouncementsService` | Admin CRUD, recipients, republish | `settings:update:all` |
| `UserAnnouncementsService` | Get unread, mark as read | `users:read:own` |

This follows single responsibility - each service has one clear purpose.

---

## API Routes

### Admin Routes

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/configure/announcements` | `settings:update:all` | List all announcements (paginated) |
| POST | `/api/configure/announcements` | `settings:update:all` | Create new announcement |
| GET | `/api/configure/announcements/[id]` | `settings:update:all` | Get single announcement |
| PATCH | `/api/configure/announcements/[id]` | `settings:update:all` | Update announcement |
| DELETE | `/api/configure/announcements/[id]` | `settings:update:all` | Soft delete announcement |
| POST | `/api/configure/announcements/[id]/republish` | `settings:update:all` | Clear read records |
| GET | `/api/configure/announcements/[id]/recipients` | `settings:update:all` | List recipients |

### User Routes

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/user/announcements` | `users:read:own` | Get unread announcements |
| GET | `/api/user/announcements/count` | `users:read:own` | Get unread count (for badge) |
| POST | `/api/user/announcements/[id]/read` | `users:read:own` | Mark single as read (API available, UI uses mark-all) |
| POST | `/api/user/announcements/read-all` | `users:read:own` | Mark all as read (used by modal) |

### Route Implementation Examples

**Admin List Route:**
```typescript
// app/api/configure/announcements/route.ts
import { rbacRoute } from '@/lib/api/route-handlers';
import { createPaginatedResponse, handleRouteError } from '@/lib/api/responses';
import { getPagination } from '@/lib/api/utils/request';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createRBACAnnouncementsService } from '@/lib/services/rbac-announcements-service';
import { createAnnouncementSchema } from '@/lib/validations/announcements';
import { log } from '@/lib/logger';
import type { NextRequest } from 'next/server';
import type { UserContext } from '@/lib/types/rbac';

// GET - List announcements
const getAnnouncementsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const searchParams = new URL(request.url).searchParams;

  try {
    const pagination = getPagination(searchParams);
    const service = createRBACAnnouncementsService(userContext);

    const result = await service.getList({
      ...pagination,
      search: searchParams.get('search') ?? undefined,
      target_type: searchParams.get('target_type') as 'all' | 'specific' | undefined,
      is_active: searchParams.get('is_active') === 'true' ? true :
                 searchParams.get('is_active') === 'false' ? false : undefined,
    });

    log.info('announcements list fetched', {
      operation: 'list_announcements',
      userId: userContext.user_id,
      results: { returned: result.items.length, total: result.total },
      duration: Date.now() - startTime,
      component: 'announcements',
    });

    return createPaginatedResponse(result.items, {
      page: result.page,
      limit: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    log.error('Failed to fetch announcements', error, { userId: userContext.user_id });
    return handleRouteError(error, 'Failed to fetch announcements', request);
  }
};

// POST - Create announcement
const createAnnouncementHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const data = await validateRequest(request, createAnnouncementSchema);
    const service = createRBACAnnouncementsService(userContext);
    const announcement = await service.createAnnouncement(data);

    log.info('announcement created', {
      operation: 'create_announcement',
      resourceId: announcement.announcement_id,
      userId: userContext.user_id,
      metadata: { targetType: data.target_type, priority: data.priority },
      duration: Date.now() - startTime,
      component: 'announcements',
    });

    return createSuccessResponse(announcement, 'Announcement created');
  } catch (error) {
    log.error('Failed to create announcement', error, { userId: userContext.user_id });
    return handleRouteError(error, 'Failed to create announcement', request);
  }
};

export const GET = rbacRoute(getAnnouncementsHandler, { permission: 'settings:update:all', rateLimit: 'api' });
export const POST = rbacRoute(createAnnouncementHandler, { permission: 'settings:update:all', rateLimit: 'api' });
```

**Admin Single Route (with extractRouteParams):**
```typescript
// app/api/configure/announcements/[id]/route.ts
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse, handleRouteError } from '@/lib/api/responses';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createRBACAnnouncementsService } from '@/lib/services/rbac-announcements-service';
import { updateAnnouncementSchema, announcementIdParamsSchema } from '@/lib/validations/announcements';
import { NotFoundError } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import type { NextRequest } from 'next/server';
import type { UserContext } from '@/lib/types/rbac';

// GET - Get single announcement
const getAnnouncementHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id } = await extractRouteParams(args[0], announcementIdParamsSchema);
    const service = createRBACAnnouncementsService(userContext);
    const announcement = await service.getById(id);

    if (!announcement) {
      throw NotFoundError('Announcement');
    }

    return createSuccessResponse(announcement);
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch announcement', request);
  }
};

// PATCH - Update announcement
const updateAnnouncementHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id } = await extractRouteParams(args[0], announcementIdParamsSchema);
    const data = await validateRequest(request, updateAnnouncementSchema);
    const service = createRBACAnnouncementsService(userContext);
    const announcement = await service.updateAnnouncement(id, data);

    log.info('announcement updated', {
      operation: 'update_announcement',
      resourceId: id,
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'announcements',
    });

    return createSuccessResponse(announcement, 'Announcement updated');
  } catch (error) {
    log.error('Failed to update announcement', error, { userId: userContext.user_id });
    return handleRouteError(error, 'Failed to update announcement', request);
  }
};

// DELETE - Soft delete announcement
const deleteAnnouncementHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id } = await extractRouteParams(args[0], announcementIdParamsSchema);
    const service = createRBACAnnouncementsService(userContext);
    await service.delete(id);

    log.info('announcement deleted', {
      operation: 'delete_announcement',
      resourceId: id,
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'announcements',
    });

    return createSuccessResponse(null, 'Announcement deleted');
  } catch (error) {
    log.error('Failed to delete announcement', error, { userId: userContext.user_id });
    return handleRouteError(error, 'Failed to delete announcement', request);
  }
};

export const GET = rbacRoute(getAnnouncementHandler, { permission: 'settings:update:all', rateLimit: 'api' });
export const PATCH = rbacRoute(updateAnnouncementHandler, { permission: 'settings:update:all', rateLimit: 'api' });
export const DELETE = rbacRoute(deleteAnnouncementHandler, { permission: 'settings:update:all', rateLimit: 'api' });
```

**User Unread Route:**
```typescript
// app/api/user/announcements/route.ts
import { authRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse, handleRouteError } from '@/lib/api/responses';
import { createUserAnnouncementsService } from '@/lib/services/user-announcements-service';
import type { NextRequest } from 'next/server';
import type { AuthSession } from '@/lib/api/route-handlers';

const getUnreadAnnouncementsHandler = async (request: NextRequest, session?: AuthSession) => {
  try {
    if (!session?.user?.id) {
      return createSuccessResponse([]);
    }

    // Build minimal UserContext for service
    const userContext = {
      user_id: session.user.id,
      // ... other required fields from session
    };

    const service = createUserAnnouncementsService(userContext);
    const announcements = await service.getUnreadAnnouncements();

    return createSuccessResponse(announcements);
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch announcements', request);
  }
};

export const GET = authRoute(getUnreadAnnouncementsHandler, { rateLimit: 'api' });
```

---

## Frontend Components

### 1. Announcements List Modal

**File:** `components/announcements/announcements-modal.tsx`

Shows all unread announcements in a scrollable list with "Got it" button.

```typescript
interface AnnouncementsModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  announcements: UnreadAnnouncement[];
  onAcknowledgeAll: () => Promise<void>;
}
```

**Visual Design (List View):**
```
+--------------------------------------------------+
|                 Announcements (3)              X |
+--------------------------------------------------+
|                                                  |
|  [URGENT] New Security Policy                    |
|  ─────────────────────────────────────────────   |
|  We have updated our security policy...          |
|  [Read more collapsed/expanded]                  |
|                                                  |
|  ─────────────────────────────────────────────   |
|                                                  |
|  [HIGH] New Feature: Dark Mode                   |
|  ─────────────────────────────────────────────   |
|  You can now enable dark mode in settings...     |
|                                                  |
|  ─────────────────────────────────────────────   |
|                                                  |
|  Release Notes v2.5.0                            |
|  ─────────────────────────────────────────────   |
|  - Bug fixes and improvements                    |
|  - Performance enhancements                      |
|                                                  |
+--------------------------------------------------+
|                        [Mark All as Read]        |
+--------------------------------------------------+
```

**Features:**
- Uses `ModalBasic` as base component
- Scrollable list for multiple announcements
- Priority badges (color-coded: urgent=red, high=orange, normal=blue, low=gray)
- Markdown rendering for body content (use `react-markdown`)
- Expandable/collapsible long content
- Single "Mark All as Read" button at bottom
- Count in title header

### 2. Header Badge Component

**File:** `components/announcements/announcement-badge.tsx`

Small notification badge in header showing unread count.

```typescript
interface AnnouncementBadgeProps {
  count: number;
  onClick: () => void;
}
```

**Integration:** Add to existing header/nav component, similar to existing `DropdownNotifications`.

### 3. Announcements Provider

**File:** `components/announcements/announcements-provider.tsx`

React context for managing announcement state.

```typescript
interface AnnouncementsContextType {
  unreadAnnouncements: UnreadAnnouncement[];
  unreadCount: number;
  isModalOpen: boolean;
  isLoading: boolean;
  openModal: () => void;
  closeModal: () => void;
  acknowledgeAll: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

**Behavior:**
1. On mount (when user authenticated), fetch unread announcements
2. Auto-open modal if unread count > 0 (configurable)
3. Badge always shows count
4. Clicking badge opens modal
5. "Mark All as Read" calls API and closes modal
6. Periodic refresh on token refresh (optional)

### 4. Integration in App Layout

```typescript
// app/(default)/layout.tsx
<RBACAuthProvider>
  <AnnouncementsProvider autoShowOnLogin={true}>
    <Header>
      <AnnouncementBadge />  {/* Shows count, opens modal on click */}
    </Header>
    <AnnouncementsModal />   {/* Rendered at top level */}
    {children}
  </AnnouncementsProvider>
</RBACAuthProvider>
```

---

## Admin UI

### Announcements Management Page

**Location:** `app/(default)/configure/announcements/page.tsx`

**DataTable Configuration:**
```typescript
const columns = [
  { key: 'subject', label: 'Subject', sortable: true },
  { key: 'target_type', label: 'Target', render: (row) => row.target_type === 'all' ? 'All Users' : `${row.recipient_count} Users` },
  { key: 'priority', label: 'Priority', render: (row) => <PriorityBadge priority={row.priority} /> },
  { key: 'is_active', label: 'Status', render: (row) => row.is_active ? 'Active' : 'Inactive' },
  { key: 'created_at', label: 'Created', sortable: true },
  { key: 'read_count', label: 'Read', render: (row) => `${row.read_count} reads` },
];

const filters = [
  { key: 'target_type', label: 'Target', options: [{ value: 'all', label: 'All Users' }, { value: 'specific', label: 'Specific Users' }] },
  { key: 'is_active', label: 'Status', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
];

const rowActions = [
  { label: 'Edit', onClick: (row) => openEditModal(row) },
  { label: 'View Recipients', onClick: (row) => openRecipientsModal(row), show: (row) => row.target_type === 'specific' },
  { label: 'Republish', onClick: (row) => handleRepublish(row), confirmModal: { title: 'Republish Announcement', message: 'This will clear all read records and show this announcement to all targeted users again.', confirmText: 'Republish' } },
  { label: 'Delete', variant: 'danger', onClick: (row) => handleDelete(row), confirmModal: { title: 'Delete Announcement', message: 'Are you sure you want to delete this announcement? This action cannot be undone.', confirmText: 'Delete' } },
];
```

**Page Actions:**
- "Create Announcement" button opens `AnnouncementFormModal`

### View Recipients Modal

**Location:** `components/announcements/recipients-modal.tsx`

Shows list of users who are targeted by a specific announcement.

```typescript
interface RecipientsModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  announcementId: string;
  announcementSubject: string;
}
```

**Features:**
- Fetches from `GET /api/configure/announcements/[id]/recipients`
- Simple list showing user name and email
- Close button only (read-only view)

### Create/Edit Announcement Modal

**Location:** `components/announcements/announcement-modal.tsx`

Uses existing `CrudModal` component from `components/crud-modal/`.

```typescript
import CrudModal from '@/components/crud-modal';
import type { FieldConfig } from '@/components/crud-modal/types';
import { createAnnouncementSchema } from '@/lib/validations/announcements';
import MultiUserPicker from '@/components/announcements/multi-user-picker';

interface AnnouncementModalProps {
  mode: 'create' | 'edit';
  announcement?: AnnouncementWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const announcementFields: FieldConfig<AnnouncementFormData>[] = [
  {
    type: 'text',
    name: 'subject',
    label: 'Subject',
    required: true,
    maxLength: 255,
    placeholder: 'Enter announcement subject',
  },
  {
    type: 'textarea',
    name: 'body',
    label: 'Body',
    required: true,
    rows: 8,
    placeholder: 'Enter announcement content (Markdown supported)',
    helpText: 'Supports Markdown formatting: **bold**, *italic*, [links](url), etc.',
  },
  {
    type: 'select',
    name: 'target_type',
    label: 'Target Audience',
    required: true,
    options: [
      { value: 'all', label: 'All Users' },
      { value: 'specific', label: 'Specific Users' },
    ],
    column: 'left',
  },
  {
    type: 'select',
    name: 'priority',
    label: 'Priority',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
      { value: 'urgent', label: 'Urgent' },
    ],
    column: 'right',
  },
  {
    type: 'custom',
    name: 'recipient_user_ids',
    label: 'Recipients',
    component: MultiUserPicker,
    visible: (formData) => formData.target_type === 'specific',
    required: true, // Only when visible
    props: {
      placeholder: 'Search and select users...',
    },
  },
  {
    type: 'text', // Use datetime input type
    name: 'publish_at',
    label: 'Publish At',
    placeholder: 'Leave empty for immediate',
    helpText: 'Schedule for future publication',
    column: 'left',
  },
  {
    type: 'text',
    name: 'expires_at',
    label: 'Expires At',
    placeholder: 'Leave empty for no expiration',
    helpText: 'Auto-hide after this date',
    column: 'right',
  },
  {
    type: 'checkbox',
    name: 'is_active',
    label: 'Active',
    description: 'Inactive announcements are not shown to users',
  },
];

export default function AnnouncementModal({ mode, announcement, isOpen, onClose, onSuccess }: AnnouncementModalProps) {
  const handleSubmit = async (data: AnnouncementFormData) => {
    if (mode === 'create') {
      await fetch('/api/configure/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch(`/api/configure/announcements/${announcement?.announcement_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
  };

  return (
    <CrudModal
      mode={mode}
      entity={announcement}
      title={mode === 'create' ? 'Create Announcement' : 'Edit Announcement'}
      resourceName="announcement"
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      schema={createAnnouncementSchema}
      defaultValues={{
        subject: '',
        body: '',
        target_type: 'all',
        recipient_user_ids: [],
        priority: 'normal',
        publish_at: null,
        expires_at: null,
        is_active: true,
      }}
      fields={announcementFields}
      onSubmit={handleSubmit}
      size="4xl"
    />
  );
}
```

### Multi-User Picker Component

**Location:** `components/announcements/multi-user-picker.tsx`

Custom field component based on existing `UserPicker` and `MultiSelectField` patterns.

```typescript
interface MultiUserPickerProps {
  name: string;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}
```

**Implementation:**
- Fetch users from `/api/users` endpoint
- Search/filter functionality
- Multi-select with chips display
- Base on `UserPicker` for styling and `MultiSelectField` for multi-select logic

---

## Validation Schemas

```typescript
// lib/validations/announcements.ts
import { z } from 'zod';

export const announcementTargetTypeSchema = z.enum(['all', 'specific']);
export const announcementPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const createAnnouncementSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Body is required'),
  target_type: announcementTargetTypeSchema,
  recipient_user_ids: z.array(z.string().uuid()).optional(),
  publish_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  priority: announcementPrioritySchema.default('normal'),
}).refine(
  (data) => {
    if (data.target_type === 'specific') {
      return data.recipient_user_ids && data.recipient_user_ids.length > 0;
    }
    return true;
  },
  {
    message: 'Recipients are required when targeting specific users',
    path: ['recipient_user_ids'],
  }
);

export const updateAnnouncementSchema = createAnnouncementSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const announcementIdParamsSchema = z.object({
  id: z.string().uuid(),
});
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Flow                                 │
└─────────────────────────────────────────────────────────────────┘

User Login/Return
       │
       ▼
┌──────────────────┐
│ RBACAuthProvider │
│ initializeAuth() │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ AnnouncementsProvider        │
│ useEffect → fetch unread     │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐     ┌─────────────────────────┐
│ GET /api/user/announcements  │────▶│ UserAnnouncementsService │
└────────┬─────────────────────┘     │ getUnreadAnnouncements() │
         │                            └─────────────────────────┘
         ▼
┌──────────────────────────────┐
│ If count > 0:                │
│ - Update badge count         │
│ - Auto-show modal (optional) │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ User clicks "Mark All Read"  │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐     ┌─────────────────────────┐
│ POST /api/user/announcements │────▶│ UserAnnouncementsService │
│ /read-all                    │     │ markAllAsRead()          │
└────────┬─────────────────────┘     └─────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Close modal, reset count     │
└──────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                       Admin Flow                                 │
└─────────────────────────────────────────────────────────────────┘

Admin User
    │
    ▼
┌──────────────────────────────┐
│ /configure/announcements     │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐     ┌──────────────────────────┐
│ GET /api/configure/          │────▶│ RBACAnnouncementsService │
│ announcements                │     │ getList()                │
└────────┬─────────────────────┘     └──────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ DataTable with actions       │
│ - Create, Edit, Republish    │
│ - Delete                     │
└────────┬─────────────────────┘
         │
    ┌────┴────┬───────────┐
    ▼         ▼           ▼
┌────────┐ ┌────────┐ ┌───────────┐
│ Create │ │ Edit   │ │ Republish │
│ Modal  │ │ Modal  │ │ Action    │
└────┬───┘ └────┬───┘ └─────┬─────┘
     │          │           │
     ▼          ▼           ▼
┌──────────────────────────────┐
│ Service method calls         │
│ createAnnouncement()         │
│ updateAnnouncement()         │
│ republish()                  │
└──────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database & Core Services
1. Create `lib/db/announcements-schema.ts` with all 3 tables
2. Update `lib/db/schema.ts` to export new tables and relations
3. Generate migration: `pnpm drizzle-kit generate`
4. Run migration: `pnpm drizzle-kit migrate`
5. Create `lib/services/rbac-announcements-service.ts` (admin CRUD)
6. Create `lib/services/user-announcements-service.ts` (user operations)
7. Create `lib/validations/announcements.ts` (Zod schemas)

### Phase 2: Admin API Routes
Create all admin routes with full implementation:

1. `app/api/configure/announcements/route.ts`
   - `GET` - List announcements (paginated, filtered)
   - `POST` - Create announcement (with recipients)

2. `app/api/configure/announcements/[id]/route.ts`
   - `GET` - Get single announcement
   - `PATCH` - Update announcement
   - `DELETE` - Soft delete announcement

3. `app/api/configure/announcements/[id]/republish/route.ts`
   - `POST` - Clear read records for re-publish

4. `app/api/configure/announcements/[id]/recipients/route.ts`
   - `GET` - List recipients for announcement

### Phase 3: User API Routes
Create all user-facing routes:

1. `app/api/user/announcements/route.ts`
   - `GET` - Get unread announcements for current user

2. `app/api/user/announcements/count/route.ts`
   - `GET` - Get unread count (for badge)

3. `app/api/user/announcements/[id]/read/route.ts`
   - `POST` - Mark single announcement as read (for future use)

4. `app/api/user/announcements/read-all/route.ts`
   - `POST` - Mark all unread as read

### Phase 4: Frontend - User Experience
1. Install markdown library: `pnpm add marked`
2. Create `lib/utils/markdown-renderer.ts`
   - Wrapper that converts markdown to HTML using `marked`
   - Pipes through existing `sanitizeHtml` for XSS protection
   - Returns safe HTML string
3. Create `components/announcements/announcements-provider.tsx`
   - Context with state: unreadAnnouncements, unreadCount, isModalOpen, isLoading
   - Methods: openModal, closeModal, acknowledgeAll, refresh
   - Auto-fetch on auth state change (listen to auth context)
4. Create `components/announcements/announcements-modal.tsx`
   - Uses `ModalBasic` as base
   - List view with scrollable content
   - Priority badges (urgent=red, high=orange, normal=blue, low=gray)
   - Markdown rendering using `marked` + `SafeHtmlRenderer`
   - "Mark All as Read" button
5. Create `components/announcements/announcement-badge.tsx`
   - Badge showing unread count
   - Click handler to open modal
   - Style similar to existing notification badges
6. Integrate with layout:
   - Add `AnnouncementsProvider` to `app/(default)/layout.tsx` (inside `RBACAuthProvider`)
   - Add `AnnouncementBadge` to header (find existing header in `components/ui/header.tsx` or similar)
   - Render `AnnouncementsModal` at provider level

### Phase 5: Frontend - Admin UI
1. Create `app/(default)/configure/announcements/page.tsx`
   - DataTable with columns: Subject, Target, Priority, Status, Created, Read Count
   - Filters: Target type, Status
   - Search functionality
   - Row actions: Edit, View Recipients, Republish, Delete (with confirmModals)
   - "Create Announcement" button
2. Create `components/announcements/announcement-modal.tsx`
   - Uses existing `CrudModal` from `components/crud-modal/`
   - Field config as shown in Admin UI section above
   - Create and Edit modes (same component, different `mode` prop)
3. Create `components/announcements/multi-user-picker.tsx`
   - Custom field component for CrudModal
   - Based on `UserPicker` styling + `MultiSelectField` multi-select logic
   - Fetches users from `/api/users`
   - Search/filter + multi-select with chips
4. Create `components/announcements/recipients-modal.tsx`
   - Uses `ModalBasic` for simple read-only view
   - Fetches from recipients API
   - Lists user name + email
5. Add row action confirmations using `confirmModal` prop pattern (as shown in Admin UI section)
   - Delete: Uses `DeleteConfirmationModal` pattern
   - Republish: Custom confirmation message

### Phase 6: Testing & Verification
1. Write unit tests for `RBACAnnouncementsService`
2. Write unit tests for `UserAnnouncementsService`
3. Write integration tests for all API routes
4. Manual testing:
   - Create announcement targeting all users
   - Create announcement targeting specific users
   - Verify modal appears on login
   - Verify badge count updates
   - Verify mark-all-as-read works
   - Verify republish clears read records
   - Verify delete (soft delete) works
5. Run `pnpm tsc` - fix all type errors
6. Run `pnpm lint` - fix all lint errors

---

## DRY Principles Applied

### Services
1. **BaseCrudService**: Reuses existing CRUD infrastructure (`lib/services/crud/base-crud-service.ts`)
2. **BaseRBACService**: Reuses permission checking logic (`lib/rbac/base-service.ts`)

### API Utilities (from `lib/api/`)
3. **`extractRouteParams`**: Use for `[id]` routes (`lib/api/utils/params.ts`)
4. **`validateRequest`**: Use for request body validation (`lib/api/middleware/validation.ts`)
5. **`validateParams`**: Use for route param validation (`lib/api/middleware/validation.ts`)
6. **`getPagination`**: Use for list endpoints (`lib/api/utils/request.ts`)
7. **`getSortParams`**: Use for sortable lists (`lib/api/utils/request.ts`)
8. **Response Helpers**: `createSuccessResponse`, `createPaginatedResponse`, `handleRouteError`
9. **Logging Templates**: `logTemplates` from `lib/logger`

### UI Components
10. **`CrudModal`**: Use for create/edit forms (`components/crud-modal/`) - NOT custom modal
11. **`ModalBasic`**: Use for simple modals like recipients view (`components/modal-basic.tsx`)
12. **`DataTable`**: Use for admin list page (`components/data-table/`)
13. **`UserPicker`**: Base for multi-user picker (`components/user-picker.tsx`)
14. **`MultiSelectField`**: Pattern for multi-select (`components/work-items/multi-select-field.tsx`)
15. **`DeleteConfirmationModal`**: Use for delete/republish confirmations

### Security Utilities
16. **`sanitizeHtml`**: Sanitize markdown-converted HTML (`lib/utils/html-sanitizer.ts`)
17. **`SafeHtmlRenderer`**: Render sanitized HTML safely (`lib/utils/safe-html-renderer.tsx`)

### Validation
18. **Zod schemas**: Follow existing patterns from `lib/validations/`

---

## Security Considerations

1. **Permissions**: Admin operations require `settings:update:all`, user operations only need `users:read:own`
2. **Input Sanitization**: Markdown rendered with safe renderer (no raw HTML)
3. **Rate Limiting**: All endpoints use `api` rate limit
4. **Soft Deletes**: Preserve audit trail
5. **User Privacy**: Users can only see/mark their own read records
6. **SQL Injection**: All queries use Drizzle's parameterized queries

---

## File Structure Summary

```
lib/
├── db/
│   ├── announcements-schema.ts      # New schema file
│   └── schema.ts                    # Add exports
├── services/
│   ├── rbac-announcements-service.ts   # Admin CRUD service
│   └── user-announcements-service.ts   # User operations service
└── validations/
    └── announcements.ts             # Zod schemas

app/
├── api/
│   ├── configure/
│   │   └── announcements/
│   │       ├── route.ts             # GET (list), POST (create)
│   │       └── [id]/
│   │           ├── route.ts         # GET, PATCH, DELETE
│   │           ├── republish/
│   │           │   └── route.ts     # POST
│   │           └── recipients/
│   │               └── route.ts     # GET
│   └── user/
│       └── announcements/
│           ├── route.ts             # GET (unread list)
│           ├── count/
│           │   └── route.ts         # GET (unread count)
│           ├── read-all/
│           │   └── route.ts         # POST
│           └── [id]/
│               └── read/
│                   └── route.ts     # POST
└── (default)/
    └── configure/
        └── announcements/
            └── page.tsx             # Admin management page

lib/
└── utils/
    └── markdown-renderer.ts         # Markdown to safe HTML (uses marked + sanitizeHtml)

components/
└── announcements/
    ├── announcements-provider.tsx   # Context provider for user announcements
    ├── announcements-modal.tsx      # User-facing list modal (uses ModalBasic)
    ├── announcement-badge.tsx       # Header notification badge
    ├── announcement-modal.tsx       # Admin create/edit form (uses CrudModal)
    ├── multi-user-picker.tsx        # Custom CrudModal field for recipient selection
    └── recipients-modal.tsx         # Admin view recipients (uses ModalBasic)
```

---

## Implementation Completeness Checklist

Use this checklist to verify all functionality is implemented:

### Database
- [ ] `announcements` table created with all columns
- [ ] `announcement_recipients` table created with unique constraint
- [ ] `announcement_reads` table created with unique constraint
- [ ] All indexes created
- [ ] Relations defined
- [ ] Schema exported from `lib/db/schema.ts`
- [ ] Migration generated and applied

### Admin Service (`RBACAnnouncementsService`)
- [ ] Extends `BaseCrudService`
- [ ] `buildJoinQuery()` returns creator name, recipient_count, read_count
- [ ] `buildSearchConditions()` searches subject and body
- [ ] `buildCustomConditions()` filters by target_type, is_active, expired
- [ ] `createAnnouncement()` creates with recipients
- [ ] `updateAnnouncement()` updates with recipients
- [ ] `setRecipients()` replaces recipients
- [ ] `getRecipients()` returns user list
- [ ] `republish()` clears read records

### User Service (`UserAnnouncementsService`)
- [ ] `getUnreadAnnouncements()` with all filters (active, not deleted, published, not expired, targeted, not read)
- [ ] `getUnreadCount()` returns count
- [ ] `markAsRead()` creates read record
- [ ] `markAllAsRead()` bulk creates read records

### Admin API Routes
- [ ] `GET /api/configure/announcements` - list with pagination
- [ ] `POST /api/configure/announcements` - create
- [ ] `GET /api/configure/announcements/[id]` - get single
- [ ] `PATCH /api/configure/announcements/[id]` - update
- [ ] `DELETE /api/configure/announcements/[id]` - soft delete
- [ ] `POST /api/configure/announcements/[id]/republish` - republish
- [ ] `GET /api/configure/announcements/[id]/recipients` - list recipients

### User API Routes
- [ ] `GET /api/user/announcements` - get unread
- [ ] `GET /api/user/announcements/count` - get count
- [ ] `POST /api/user/announcements/[id]/read` - mark single read
- [ ] `POST /api/user/announcements/read-all` - mark all read

### User UI Components
- [ ] `AnnouncementsProvider` - context with state and methods
- [ ] `AnnouncementsModal` - list view with markdown rendering
- [ ] `AnnouncementBadge` - count badge in header
- [ ] Provider integrated in layout
- [ ] Badge integrated in header
- [ ] Modal auto-shows on login (if unread > 0)

### Admin UI Components
- [ ] Admin page at `/configure/announcements`
- [ ] DataTable with all columns (Subject, Target, Priority, Status, Created, Read Count)
- [ ] Filters (Target type, Status)
- [ ] Search functionality
- [ ] Create button opens form modal
- [ ] Edit action opens form modal with data
- [ ] View Recipients action opens recipients modal
- [ ] Republish action with confirmation
- [ ] Delete action with confirmation
- [ ] `AnnouncementModal` - create/edit form using `CrudModal`
- [ ] `MultiUserPicker` - custom CrudModal field for recipients
- [ ] `RecipientsModal` - view recipients list using `ModalBasic`

### Utilities
- [ ] `lib/utils/markdown-renderer.ts` - `marked` + `sanitizeHtml` wrapper
- [ ] `marked` package installed (`pnpm add marked`)

### Validation
- [ ] `createAnnouncementSchema` with refinement for recipients
- [ ] `updateAnnouncementSchema` partial schema
- [ ] `announcementIdParamsSchema` for route params

### Testing
- [ ] Unit tests for admin service
- [ ] Unit tests for user service
- [ ] `pnpm tsc` passes
- [ ] `pnpm lint` passes
