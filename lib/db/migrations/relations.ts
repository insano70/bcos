import { relations } from "drizzle-orm/relations";
import { users, practices, templates, staffMembers, practiceAttributes, oidcStates, oidcNonces, practiceComments, workItemActivity, workItems, workItemAttachments, webauthnCredentials, dashboards, chartCategories, organizations, workItemFields, workItemTypes, workItemComments, workItemFieldValues, workItemStatuses, roles, userRoles, userOrganizations, permissions, rolePermissions, chartDefinitions, chartPermissions, chartDataSources, dashboardCharts, userChartFavorites, colorPalettes, chartDisplayConfigurations, chartDataSourceColumns, csrfFailureEvents, workItemStatusTransitions, workItemTypeRelationships, workItemWatchers, explorerTableMetadata, explorerColumnMetadata, explorerQueryHistory, explorerSavedQueries, explorerTableRelationships } from "./schema";

export const practicesRelations = relations(practices, ({one, many}) => ({
	user: one(users, {
		fields: [practices.ownerUserId],
		references: [users.userId]
	}),
	template: one(templates, {
		fields: [practices.templateId],
		references: [templates.templateId]
	}),
	staffMembers: many(staffMembers),
	practiceAttributes: many(practiceAttributes),
	practiceComments: many(practiceComments),
}));

export const usersRelations = relations(users, ({many}) => ({
	practices: many(practices),
	workItemActivities: many(workItemActivity),
	workItemAttachments: many(workItemAttachments),
	webauthnCredentials: many(webauthnCredentials),
	dashboards: many(dashboards),
	workItemFields: many(workItemFields),
	workItemComments: many(workItemComments),
	chartPermissions_grantedByUserId: many(chartPermissions, {
		relationName: "chartPermissions_grantedByUserId_users_userId"
	}),
	chartPermissions_userId: many(chartPermissions, {
		relationName: "chartPermissions_userId_users_userId"
	}),
	chartDefinitions: many(chartDefinitions),
	userChartFavorites: many(userChartFavorites),
	csrfFailureEvents: many(csrfFailureEvents),
	workItems_assignedTo: many(workItems, {
		relationName: "workItems_assignedTo_users_userId"
	}),
	workItems_createdBy: many(workItems, {
		relationName: "workItems_createdBy_users_userId"
	}),
	workItemTypes: many(workItemTypes),
	workItemWatchers: many(workItemWatchers),
}));

export const templatesRelations = relations(templates, ({many}) => ({
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

export const oidcNoncesRelations = relations(oidcNonces, ({one}) => ({
	oidcState: one(oidcStates, {
		fields: [oidcNonces.state],
		references: [oidcStates.state]
	}),
}));

export const oidcStatesRelations = relations(oidcStates, ({many}) => ({
	oidcNonces: many(oidcNonces),
}));

export const practiceCommentsRelations = relations(practiceComments, ({one}) => ({
	practice: one(practices, {
		fields: [practiceComments.practiceId],
		references: [practices.practiceId]
	}),
}));

export const workItemActivityRelations = relations(workItemActivity, ({one}) => ({
	user: one(users, {
		fields: [workItemActivity.createdBy],
		references: [users.userId]
	}),
	workItem: one(workItems, {
		fields: [workItemActivity.workItemId],
		references: [workItems.workItemId]
	}),
}));

export const workItemsRelations = relations(workItems, ({one, many}) => ({
	workItemActivities: many(workItemActivity),
	workItemAttachments: many(workItemAttachments),
	workItemComments: many(workItemComments),
	workItemFieldValues: many(workItemFieldValues),
	user_assignedTo: one(users, {
		fields: [workItems.assignedTo],
		references: [users.userId],
		relationName: "workItems_assignedTo_users_userId"
	}),
	user_createdBy: one(users, {
		fields: [workItems.createdBy],
		references: [users.userId],
		relationName: "workItems_createdBy_users_userId"
	}),
	organization: one(organizations, {
		fields: [workItems.organizationId],
		references: [organizations.organizationId]
	}),
	workItemStatus: one(workItemStatuses, {
		fields: [workItems.statusId],
		references: [workItemStatuses.workItemStatusId]
	}),
	workItemType: one(workItemTypes, {
		fields: [workItems.workItemTypeId],
		references: [workItemTypes.workItemTypeId]
	}),
	workItemWatchers: many(workItemWatchers),
}));

export const workItemAttachmentsRelations = relations(workItemAttachments, ({one}) => ({
	user: one(users, {
		fields: [workItemAttachments.uploadedBy],
		references: [users.userId]
	}),
	workItem: one(workItems, {
		fields: [workItemAttachments.workItemId],
		references: [workItems.workItemId]
	}),
}));

export const webauthnCredentialsRelations = relations(webauthnCredentials, ({one}) => ({
	user: one(users, {
		fields: [webauthnCredentials.userId],
		references: [users.userId]
	}),
}));

export const dashboardsRelations = relations(dashboards, ({one, many}) => ({
	user: one(users, {
		fields: [dashboards.createdBy],
		references: [users.userId]
	}),
	chartCategory: one(chartCategories, {
		fields: [dashboards.dashboardCategoryId],
		references: [chartCategories.chartCategoryId]
	}),
	organization: one(organizations, {
		fields: [dashboards.organizationId],
		references: [organizations.organizationId]
	}),
	dashboardCharts: many(dashboardCharts),
}));

export const chartCategoriesRelations = relations(chartCategories, ({many}) => ({
	dashboards: many(dashboards),
	chartDefinitions: many(chartDefinitions),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	dashboards: many(dashboards),
	roles: many(roles),
	userRoles: many(userRoles),
	userOrganizations: many(userOrganizations),
	workItems: many(workItems),
	workItemTypes: many(workItemTypes),
}));

export const workItemFieldsRelations = relations(workItemFields, ({one, many}) => ({
	user: one(users, {
		fields: [workItemFields.createdBy],
		references: [users.userId]
	}),
	workItemType: one(workItemTypes, {
		fields: [workItemFields.workItemTypeId],
		references: [workItemTypes.workItemTypeId]
	}),
	workItemFieldValues: many(workItemFieldValues),
}));

export const workItemTypesRelations = relations(workItemTypes, ({one, many}) => ({
	workItemFields: many(workItemFields),
	workItemStatuses: many(workItemStatuses),
	workItems: many(workItems),
	user: one(users, {
		fields: [workItemTypes.createdBy],
		references: [users.userId]
	}),
	organization: one(organizations, {
		fields: [workItemTypes.organizationId],
		references: [organizations.organizationId]
	}),
	workItemStatusTransitions: many(workItemStatusTransitions),
	workItemTypeRelationships_childTypeId: many(workItemTypeRelationships, {
		relationName: "workItemTypeRelationships_childTypeId_workItemTypes_workItemTypeId"
	}),
	workItemTypeRelationships_parentTypeId: many(workItemTypeRelationships, {
		relationName: "workItemTypeRelationships_parentTypeId_workItemTypes_workItemTypeId"
	}),
}));

export const workItemCommentsRelations = relations(workItemComments, ({one}) => ({
	user: one(users, {
		fields: [workItemComments.createdBy],
		references: [users.userId]
	}),
	workItem: one(workItems, {
		fields: [workItemComments.workItemId],
		references: [workItems.workItemId]
	}),
}));

export const workItemFieldValuesRelations = relations(workItemFieldValues, ({one}) => ({
	workItemField: one(workItemFields, {
		fields: [workItemFieldValues.workItemFieldId],
		references: [workItemFields.workItemFieldId]
	}),
	workItem: one(workItems, {
		fields: [workItemFieldValues.workItemId],
		references: [workItems.workItemId]
	}),
}));

export const workItemStatusesRelations = relations(workItemStatuses, ({one, many}) => ({
	workItemType: one(workItemTypes, {
		fields: [workItemStatuses.workItemTypeId],
		references: [workItemTypes.workItemTypeId]
	}),
	workItems: many(workItems),
	workItemStatusTransitions_fromStatusId: many(workItemStatusTransitions, {
		relationName: "workItemStatusTransitions_fromStatusId_workItemStatuses_workItemStatusId"
	}),
	workItemStatusTransitions_toStatusId: many(workItemStatusTransitions, {
		relationName: "workItemStatusTransitions_toStatusId_workItemStatuses_workItemStatusId"
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

export const userRolesRelations = relations(userRoles, ({one}) => ({
	organization: one(organizations, {
		fields: [userRoles.organizationId],
		references: [organizations.organizationId]
	}),
	role: one(roles, {
		fields: [userRoles.roleId],
		references: [roles.roleId]
	}),
}));

export const userOrganizationsRelations = relations(userOrganizations, ({one}) => ({
	organization: one(organizations, {
		fields: [userOrganizations.organizationId],
		references: [organizations.organizationId]
	}),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({one}) => ({
	permission: one(permissions, {
		fields: [rolePermissions.permissionId],
		references: [permissions.permissionId]
	}),
	role: one(roles, {
		fields: [rolePermissions.roleId],
		references: [roles.roleId]
	}),
}));

export const permissionsRelations = relations(permissions, ({many}) => ({
	rolePermissions: many(rolePermissions),
}));

export const chartPermissionsRelations = relations(chartPermissions, ({one}) => ({
	chartDefinition: one(chartDefinitions, {
		fields: [chartPermissions.chartDefinitionId],
		references: [chartDefinitions.chartDefinitionId]
	}),
	user_grantedByUserId: one(users, {
		fields: [chartPermissions.grantedByUserId],
		references: [users.userId],
		relationName: "chartPermissions_grantedByUserId_users_userId"
	}),
	user_userId: one(users, {
		fields: [chartPermissions.userId],
		references: [users.userId],
		relationName: "chartPermissions_userId_users_userId"
	}),
}));

export const chartDefinitionsRelations = relations(chartDefinitions, ({one, many}) => ({
	chartPermissions: many(chartPermissions),
	chartCategory: one(chartCategories, {
		fields: [chartDefinitions.chartCategoryId],
		references: [chartCategories.chartCategoryId]
	}),
	user: one(users, {
		fields: [chartDefinitions.createdBy],
		references: [users.userId]
	}),
	chartDataSource: one(chartDataSources, {
		fields: [chartDefinitions.dataSourceId],
		references: [chartDataSources.dataSourceId]
	}),
	dashboardCharts: many(dashboardCharts),
	userChartFavorites: many(userChartFavorites),
}));

export const chartDataSourcesRelations = relations(chartDataSources, ({many}) => ({
	chartDefinitions: many(chartDefinitions),
	chartDataSourceColumns: many(chartDataSourceColumns),
}));

export const dashboardChartsRelations = relations(dashboardCharts, ({one}) => ({
	chartDefinition: one(chartDefinitions, {
		fields: [dashboardCharts.chartDefinitionId],
		references: [chartDefinitions.chartDefinitionId]
	}),
	dashboard: one(dashboards, {
		fields: [dashboardCharts.dashboardId],
		references: [dashboards.dashboardId]
	}),
}));

export const userChartFavoritesRelations = relations(userChartFavorites, ({one}) => ({
	chartDefinition: one(chartDefinitions, {
		fields: [userChartFavorites.chartDefinitionId],
		references: [chartDefinitions.chartDefinitionId]
	}),
	user: one(users, {
		fields: [userChartFavorites.userId],
		references: [users.userId]
	}),
}));

export const chartDisplayConfigurationsRelations = relations(chartDisplayConfigurations, ({one}) => ({
	colorPalette: one(colorPalettes, {
		fields: [chartDisplayConfigurations.defaultColorPaletteId],
		references: [colorPalettes.paletteId]
	}),
}));

export const colorPalettesRelations = relations(colorPalettes, ({many}) => ({
	chartDisplayConfigurations: many(chartDisplayConfigurations),
}));

export const chartDataSourceColumnsRelations = relations(chartDataSourceColumns, ({one}) => ({
	chartDataSource: one(chartDataSources, {
		fields: [chartDataSourceColumns.dataSourceId],
		references: [chartDataSources.dataSourceId]
	}),
}));

export const csrfFailureEventsRelations = relations(csrfFailureEvents, ({one}) => ({
	user: one(users, {
		fields: [csrfFailureEvents.userId],
		references: [users.userId]
	}),
}));

export const workItemStatusTransitionsRelations = relations(workItemStatusTransitions, ({one}) => ({
	workItemStatus_fromStatusId: one(workItemStatuses, {
		fields: [workItemStatusTransitions.fromStatusId],
		references: [workItemStatuses.workItemStatusId],
		relationName: "workItemStatusTransitions_fromStatusId_workItemStatuses_workItemStatusId"
	}),
	workItemStatus_toStatusId: one(workItemStatuses, {
		fields: [workItemStatusTransitions.toStatusId],
		references: [workItemStatuses.workItemStatusId],
		relationName: "workItemStatusTransitions_toStatusId_workItemStatuses_workItemStatusId"
	}),
	workItemType: one(workItemTypes, {
		fields: [workItemStatusTransitions.workItemTypeId],
		references: [workItemTypes.workItemTypeId]
	}),
}));

export const workItemTypeRelationshipsRelations = relations(workItemTypeRelationships, ({one}) => ({
	workItemType_childTypeId: one(workItemTypes, {
		fields: [workItemTypeRelationships.childTypeId],
		references: [workItemTypes.workItemTypeId],
		relationName: "workItemTypeRelationships_childTypeId_workItemTypes_workItemTypeId"
	}),
	workItemType_parentTypeId: one(workItemTypes, {
		fields: [workItemTypeRelationships.parentTypeId],
		references: [workItemTypes.workItemTypeId],
		relationName: "workItemTypeRelationships_parentTypeId_workItemTypes_workItemTypeId"
	}),
}));

export const workItemWatchersRelations = relations(workItemWatchers, ({one}) => ({
	user: one(users, {
		fields: [workItemWatchers.userId],
		references: [users.userId]
	}),
	workItem: one(workItems, {
		fields: [workItemWatchers.workItemId],
		references: [workItems.workItemId]
	}),
}));

export const explorerColumnMetadataRelations = relations(explorerColumnMetadata, ({one}) => ({
	explorerTableMetadatum: one(explorerTableMetadata, {
		fields: [explorerColumnMetadata.tableId],
		references: [explorerTableMetadata.tableMetadataId]
	}),
}));

export const explorerTableMetadataRelations = relations(explorerTableMetadata, ({many}) => ({
	explorerColumnMetadata: many(explorerColumnMetadata),
	explorerTableRelationships_fromTableId: many(explorerTableRelationships, {
		relationName: "explorerTableRelationships_fromTableId_explorerTableMetadata_tableMetadataId"
	}),
	explorerTableRelationships_toTableId: many(explorerTableRelationships, {
		relationName: "explorerTableRelationships_toTableId_explorerTableMetadata_tableMetadataId"
	}),
}));

export const explorerSavedQueriesRelations = relations(explorerSavedQueries, ({one}) => ({
	explorerQueryHistory: one(explorerQueryHistory, {
		fields: [explorerSavedQueries.queryHistoryId],
		references: [explorerQueryHistory.queryHistoryId]
	}),
}));

export const explorerQueryHistoryRelations = relations(explorerQueryHistory, ({many}) => ({
	explorerSavedQueries: many(explorerSavedQueries),
}));

export const explorerTableRelationshipsRelations = relations(explorerTableRelationships, ({one}) => ({
	explorerTableMetadatum_fromTableId: one(explorerTableMetadata, {
		fields: [explorerTableRelationships.fromTableId],
		references: [explorerTableMetadata.tableMetadataId],
		relationName: "explorerTableRelationships_fromTableId_explorerTableMetadata_tableMetadataId"
	}),
	explorerTableMetadatum_toTableId: one(explorerTableMetadata, {
		fields: [explorerTableRelationships.toTableId],
		references: [explorerTableMetadata.tableMetadataId],
		relationName: "explorerTableRelationships_toTableId_explorerTableMetadata_tableMetadataId"
	}),
}));