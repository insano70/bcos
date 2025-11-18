/**
 * RBAC Data Sources Service - Basic Committed Tests
 *
 * Tests the Data Sources Service using committed factory pattern.
 * Uses real CRUD operations visible across database connections.
 *
 * Part of wide coverage strategy - basic tests for all services.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chart_data_sources } from '@/lib/db/chart-config-schema';
import { RBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { PermissionName } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedOrganization, createCommittedUser } from '@/tests/factories/committed';
import { assignUserToOrganization } from '@/tests/helpers/committed-rbac-helper';
import {
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

function createRBACDataSourcesService(userContext: ConstructorParameters<typeof RBACDataSourcesService>[0]): RBACDataSourcesService {
  return new RBACDataSourcesService(userContext);
}

describe('RBAC Data Sources Service - Basic Committed Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let createdDataSourceIds: number[] = [];

  beforeEach(() => {
    scopeId = `ds-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
    createdDataSourceIds = [];
  });

  afterEach(async () => {
    // Clean up data sources manually since they're not in the factory system
    if (createdDataSourceIds.length > 0) {
      const firstId = createdDataSourceIds[0];
      if (firstId) {
        await db
          .delete(chart_data_sources)
          .where(eq(chart_data_sources.data_source_id, firstId));
      }
      for (let i = 1; i < createdDataSourceIds.length; i++) {
        const dataSourceId = createdDataSourceIds[i];
        if (dataSourceId) {
          await db
            .delete(chart_data_sources)
            .where(eq(chart_data_sources.data_source_id, dataSourceId));
        }
      }
    }
    await scope.cleanup();
  });

  describe('getDataSources - Read Operations', () => {
    it('should retrieve data sources with real data', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_reader',
        permissions: [
          'data-sources:read:organization' as PermissionName,
          'analytics:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      // Create test data sources
      const [ds1] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `test_ds1_${nanoid(6)}`,
          table_name: 'test_table_1',
          schema_name: 'public',
          database_type: 'postgresql',
          created_by: user.user_id,
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds1?.data_source_id ?? 0);

      const [ds2] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `test_ds2_${nanoid(6)}`,
          table_name: 'test_table_2',
          schema_name: 'public',
          database_type: 'postgresql',
          created_by: user.user_id,
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds2?.data_source_id ?? 0);

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);
      const result = await dsService.getDataSources();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const dsIds = result.map((ds) => ds.data_source_id);
      expect(dsIds).toContain(ds1?.data_source_id);
      expect(dsIds).toContain(ds2?.data_source_id);
    });

    it('should filter data sources by search term', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_reader',
        permissions: [
          'data-sources:read:organization' as PermissionName,
          'analytics:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const uniqueName = `searchable_${nanoid(8)}`;
      const [ds] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: uniqueName,
          table_name: 'search_table',
          schema_name: 'public',
          database_type: 'postgresql',
          created_by: user.user_id,
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds?.data_source_id ?? 0);

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);
      const result = await dsService.getDataSources({ search: uniqueName, limit: 50, offset: 0 });

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((ds) => ds.data_source_name === uniqueName)).toBe(true);
    });

    it('should deny data source retrieval without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dsService = createRBACDataSourcesService(userContext);

      await expect(dsService.getDataSources()).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('getDataSourceById - Single Record Retrieval', () => {
    it('should retrieve specific data source with valid permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_reader',
        permissions: ['data-sources:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const [ds] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `specific_ds_${nanoid(6)}`,
          table_name: 'specific_table',
          schema_name: 'public',
          database_type: 'postgresql',
          created_by: user.user_id,
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds?.data_source_id ?? 0);

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);
      const result = await dsService.getDataSourceById(ds?.data_source_id ?? 0);

      expect(result).toBeTruthy();
      expect(result?.data_source_id).toBe(ds?.data_source_id);
      expect(result?.table_name).toBe('specific_table');
    });

    it('should return null for non-existent data source', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_reader',
        permissions: ['data-sources:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);
      const result = await dsService.getDataSourceById(999999);

      expect(result).toBeNull();
    });
  });

  describe('createDataSource - Creation Operations', () => {
    it('should create data source with all required fields', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_creator',
        permissions: [
          'data-sources:create:organization' as PermissionName,
          'data-sources:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);

      const dsData = {
        data_source_name: `new_ds_${nanoid(6)}`,
        table_name: 'new_table',
        schema_name: 'public',
        database_type: 'postgresql' as const,
        is_active: true,
        requires_auth: false,
      };

      const result = await dsService.createDataSource(dsData);
      createdDataSourceIds.push(result.data_source_id);

      expect(result.data_source_name).toBe(dsData.data_source_name);
      expect(result.table_name).toBe(dsData.table_name);
      expect(result.data_source_id).toBeTruthy();
    });

    it('should deny data source creation without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dsService = createRBACDataSourcesService(userContext);

      const dsData = {
        data_source_name: 'unauthorized_ds',
        table_name: 'unauthorized_table',
        schema_name: 'public',
        database_type: 'postgresql' as const,
        is_active: true,
        requires_auth: false,
      };

      await expect(dsService.createDataSource(dsData)).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('updateDataSource - Modification Operations', () => {
    it('should update data source successfully', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_editor',
        permissions: [
          'data-sources:update:organization' as PermissionName,
          'data-sources:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const [ds] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `original_ds_${nanoid(6)}`,
          table_name: 'original_table',
          schema_name: 'public',
          database_type: 'postgresql',
          created_by: user.user_id,
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds?.data_source_id ?? 0);

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);

      const result = await dsService.updateDataSource(ds?.data_source_id ?? 0, {
        data_source_name: `updated_ds_${nanoid(6)}`,
      });

      expect(result).toBeTruthy();
      if (result) {
        expect(result.data_source_name).toContain('updated_ds');
        expect(result.data_source_id).toBe(ds?.data_source_id);
      }
    });

    it('should deny data source update without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const [ds] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `test_ds_${nanoid(6)}`,
          table_name: 'test_table',
          schema_name: 'public',
          database_type: 'postgresql',
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds?.data_source_id ?? 0);

      const userContext = await buildUserContext(user);
      const dsService = createRBACDataSourcesService(userContext);

      await expect(
        dsService.updateDataSource(ds?.data_source_id ?? 0, { data_source_name: 'hacked' })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('deleteDataSource - Deletion Operations', () => {
    it('should delete data source successfully', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'ds_deleter',
        permissions: [
          'data-sources:delete:organization' as PermissionName,
          'data-sources:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const [ds] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `delete_ds_${nanoid(6)}`,
          table_name: 'delete_table',
          schema_name: 'public',
          database_type: 'postgresql',
          created_by: user.user_id,
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds?.data_source_id ?? 0);

      const userContext = await buildUserContext(user, org.organization_id);
      const dsService = createRBACDataSourcesService(userContext);

      await dsService.deleteDataSource(ds?.data_source_id ?? 0);

      // Verify soft deletion
      const [deleted] = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, ds?.data_source_id ?? 0));

      expect(deleted?.is_active).toBe(false);
    });

    it('should deny data source deletion without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const [ds] = await db
        .insert(chart_data_sources)
        .values({
          data_source_name: `test_ds_${nanoid(6)}`,
          table_name: 'test_table',
          schema_name: 'public',
          database_type: 'postgresql',
          is_active: true,
        })
        .returning();
      createdDataSourceIds.push(ds?.data_source_id ?? 0);

      const userContext = await buildUserContext(user);
      const dsService = createRBACDataSourcesService(userContext);

      await expect(dsService.deleteDataSource(ds?.data_source_id ?? 0)).rejects.toThrow(
        PermissionDeniedError
      );
    });
  });
});
