import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * RBAC Database Schema for Enterprise Role-Based Access Control
 * Implements Resource-Action-Scope permission model with multi-tenant support
 */

// Organizations table (for multi-tenancy/scoping)
// In healthcare context, these represent practice organizations
export const organizations = pgTable(
  'organizations',
  {
    organization_id: uuid('organization_id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    parent_organization_id: uuid('parent_organization_id'),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    slugIdx: index('idx_organizations_slug').on(table.slug),
    parentIdx: index('idx_organizations_parent').on(table.parent_organization_id),
    activeIdx: index('idx_organizations_active').on(table.is_active),
    createdAtIdx: index('idx_organizations_created_at').on(table.created_at),
    deletedAtIdx: index('idx_organizations_deleted_at').on(table.deleted_at),
  })
);

// Permissions table - defines what actions can be performed on resources
export const permissions = pgTable(
  'permissions',
  {
    permission_id: uuid('permission_id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(), // e.g., 'users:read:organization'
    description: text('description'),
    resource: varchar('resource', { length: 50 }).notNull(), // e.g., 'users', 'organizations', 'analytics'
    action: varchar('action', { length: 50 }).notNull(), // e.g., 'read', 'create', 'update', 'delete'
    scope: varchar('scope', { length: 50 }).default('own'), // 'own', 'organization', 'all'
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    nameIdx: index('idx_permissions_name').on(table.name),
    resourceActionIdx: index('idx_permissions_resource_action').on(table.resource, table.action),
    resourceIdx: index('idx_permissions_resource').on(table.resource),
    actionIdx: index('idx_permissions_action').on(table.action),
    scopeIdx: index('idx_permissions_scope').on(table.scope),
    activeIdx: index('idx_permissions_active').on(table.is_active),
  })
);

// Roles table - groups of permissions
export const roles = pgTable(
  'roles',
  {
    role_id: uuid('role_id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(), // e.g., 'admin', 'manager', 'user'
    description: text('description'),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'cascade',
    }),
    is_system_role: boolean('is_system_role').default(false), // true for global roles like 'super_admin'
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    nameIdx: index('idx_roles_name').on(table.name),
    organizationIdx: index('idx_roles_organization').on(table.organization_id),
    systemRoleIdx: index('idx_roles_system').on(table.is_system_role),
    activeIdx: index('idx_roles_active').on(table.is_active),
    createdAtIdx: index('idx_roles_created_at').on(table.created_at),
    deletedAtIdx: index('idx_roles_deleted_at').on(table.deleted_at),
    // Ensure unique role names per organization (or globally for system roles)
    uniqueRolePerOrgIdx: index('idx_unique_role_per_org').on(table.name, table.organization_id),
  })
);

// Role permissions junction table - assigns permissions to roles
export const role_permissions = pgTable(
  'role_permissions',
  {
    role_permission_id: uuid('role_permission_id').primaryKey().defaultRandom(),
    role_id: uuid('role_id')
      .notNull()
      .references(() => roles.role_id, { onDelete: 'cascade' }),
    permission_id: uuid('permission_id')
      .notNull()
      .references(() => permissions.permission_id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    roleIdx: index('idx_role_permissions_role').on(table.role_id),
    permissionIdx: index('idx_role_permissions_permission').on(table.permission_id),
    // Ensure unique role-permission combinations
    uniqueRolePermissionIdx: index('idx_unique_role_permission').on(
      table.role_id,
      table.permission_id
    ),
  })
);

// User roles junction table - assigns roles to users within organizations
export const user_roles = pgTable(
  'user_roles',
  {
    user_role_id: uuid('user_role_id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(), // References users.user_id (from main schema)
    role_id: uuid('role_id')
      .notNull()
      .references(() => roles.role_id, { onDelete: 'cascade' }),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'cascade',
    }),
    granted_by: uuid('granted_by'), // References users.user_id - who granted this role
    granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true }), // Optional: for temporary role assignments
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_user_roles_user').on(table.user_id),
    roleIdx: index('idx_user_roles_role').on(table.role_id),
    organizationIdx: index('idx_user_roles_organization').on(table.organization_id),
    grantedByIdx: index('idx_user_roles_granted_by').on(table.granted_by),
    activeIdx: index('idx_user_roles_active').on(table.is_active),
    expiresAtIdx: index('idx_user_roles_expires_at').on(table.expires_at),
    // Ensure unique user-role-organization combinations
    uniqueUserRoleOrgIdx: index('idx_unique_user_role_org').on(
      table.user_id,
      table.role_id,
      table.organization_id
    ),
  })
);

// User organizations table - tracks which users belong to which organizations
export const user_organizations = pgTable(
  'user_organizations',
  {
    user_organization_id: uuid('user_organization_id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(), // References users.user_id (from main schema)
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.organization_id, { onDelete: 'cascade' }),
    is_active: boolean('is_active').default(true),
    joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_user_organizations_user').on(table.user_id),
    organizationIdx: index('idx_user_organizations_org').on(table.organization_id),
    activeIdx: index('idx_user_organizations_active').on(table.is_active),
    joinedAtIdx: index('idx_user_organizations_joined_at').on(table.joined_at),
    // Ensure unique user-organization combinations
    uniqueUserOrgIdx: index('idx_unique_user_organization').on(
      table.user_id,
      table.organization_id
    ),
  })
);

// Define relations for better type safety and query building
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  parent: one(organizations, {
    fields: [organizations.parent_organization_id],
    references: [organizations.organization_id],
    relationName: 'parent_child',
  }),
  children: many(organizations, { relationName: 'parent_child' }),
  roles: many(roles),
  userOrganizations: many(user_organizations),
  userRoles: many(user_roles),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roles.organization_id],
    references: [organizations.organization_id],
  }),
  rolePermissions: many(role_permissions),
  userRoles: many(user_roles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(role_permissions),
}));

export const rolePermissionsRelations = relations(role_permissions, ({ one }) => ({
  role: one(roles, {
    fields: [role_permissions.role_id],
    references: [roles.role_id],
  }),
  permission: one(permissions, {
    fields: [role_permissions.permission_id],
    references: [permissions.permission_id],
  }),
}));

export const userRolesRelations = relations(user_roles, ({ one }) => ({
  role: one(roles, {
    fields: [user_roles.role_id],
    references: [roles.role_id],
  }),
  organization: one(organizations, {
    fields: [user_roles.organization_id],
    references: [organizations.organization_id],
  }),
}));

export const userOrganizationsRelations = relations(user_organizations, ({ one }) => ({
  organization: one(organizations, {
    fields: [user_organizations.organization_id],
    references: [organizations.organization_id],
  }),
}));
