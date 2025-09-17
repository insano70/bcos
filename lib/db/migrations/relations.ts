import { relations } from "drizzle-orm/relations";
import { templates, practices, users, staffMembers, practiceAttributes, organizations, roles, userRoles, userOrganizations, rolePermissions, permissions } from "./schema";

export const practicesRelations = relations(practices, ({one, many}) => ({
	template: one(templates, {
		fields: [practices.templateId],
		references: [templates.templateId]
	}),
	user: one(users, {
		fields: [practices.ownerUserId],
		references: [users.userId]
	}),
	staffMembers: many(staffMembers),
	practiceAttributes: many(practiceAttributes),
}));

export const templatesRelations = relations(templates, ({many}) => ({
	practices: many(practices),
}));

export const usersRelations = relations(users, ({many}) => ({
	practices: many(practices),
}));

export const staffMembersRelations = relations(staffMembers, ({one}) => ({
	practice: one(practices, {
		fields: [staffMembers.practiceId],
		references: [practices.practiceId]
	}),
}));

export const practiceAttributesRelations = relations(practiceAttributes, ({one}) => ({
	practice: one(practices, {
		fields: [practiceAttributes.practiceId],
		references: [practices.practiceId]
	}),
}));

export const rolesRelations = relations(roles, ({one, many}) => ({
	organization: one(organizations, {
		fields: [roles.organizationId],
		references: [organizations.organizationId]
	}),
	userRoles: many(userRoles),
	rolePermissions: many(rolePermissions),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	roles: many(roles),
	userRoles: many(userRoles),
	userOrganizations: many(userOrganizations),
}));

export const userRolesRelations = relations(userRoles, ({one}) => ({
	role: one(roles, {
		fields: [userRoles.roleId],
		references: [roles.roleId]
	}),
	organization: one(organizations, {
		fields: [userRoles.organizationId],
		references: [organizations.organizationId]
	}),
}));

export const userOrganizationsRelations = relations(userOrganizations, ({one}) => ({
	organization: one(organizations, {
		fields: [userOrganizations.organizationId],
		references: [organizations.organizationId]
	}),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({one}) => ({
	role: one(roles, {
		fields: [rolePermissions.roleId],
		references: [roles.roleId]
	}),
	permission: one(permissions, {
		fields: [rolePermissions.permissionId],
		references: [permissions.permissionId]
	}),
}));

export const permissionsRelations = relations(permissions, ({many}) => ({
	rolePermissions: many(rolePermissions),
}));