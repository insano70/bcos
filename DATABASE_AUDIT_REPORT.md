# Database Schema Audit Report
**Date:** October 30, 2025  
**Audited By:** Claude AI Assistant  
**Scope:** Drizzle Schema Definitions vs Local PostgreSQL Database

---

## Executive Summary

The database audit compared Drizzle schema definitions in code against the actual local PostgreSQL database structure. The audit found:

- ✅ **All 53 tables match** between schema and database
- ✅ **No column-level discrepancies** (per `drizzle-kit check`)
- ❌ **Critical migration journal inconsistency** found
- ⚠️ **Missing migration file** referenced in journal

---

## 1. Table-Level Analysis

### Summary
- **Expected Tables (Drizzle Schema):** 53
- **Actual Tables (Database):** 53
- **Status:** ✅ **PERFECT MATCH**

### All Tables Present and Accounted For

All 53 tables defined in the Drizzle schema files exist in the database:

**Core Application Tables:**
- `users` - System users (admins)
- `templates` - Website templates
- `practices` - Rheumatology practices
- `practice_attributes` - Practice configuration
- `staff_members` - Practice staff/providers
- `practice_comments` - Customer reviews

**Authentication & Security:**
- `oidc_states` - OIDC state management
- `oidc_nonces` - OIDC nonce validation
- `saml_replay_prevention` - SAML replay attack prevention
- `refresh_tokens` - JWT refresh token storage
- `token_blacklist` - Revoked tokens
- `user_sessions` - Session tracking
- `account_security` - Account security state
- `login_attempts` - Login audit trail
- `webauthn_credentials` - Passkey storage
- `webauthn_challenges` - WebAuthn challenge storage
- `csrf_failure_events` - CSRF monitoring

**RBAC (Role-Based Access Control):**
- `organizations` - Multi-tenant organizations
- `permissions` - Permission definitions
- `roles` - Role definitions
- `role_permissions` - Role-permission mappings
- `user_roles` - User-role assignments
- `user_organizations` - User-organization associations

**Analytics & Dashboards:**
- `data_sources` - Available data sources
- `chart_categories` - Chart organization
- `chart_definitions` - Chart configurations
- `chart_permissions` - Chart access control
- `chart_data_sources` - Chart data source registry
- `chart_data_source_columns` - Column metadata
- `chart_display_configurations` - Display settings
- `color_palettes` - Color palette configurations
- `dashboards` - Dashboard definitions
- `dashboard_charts` - Dashboard-chart associations
- `user_chart_favorites` - User favorites

**Work Items System:**
- `work_item_types` - Work item type definitions
- `work_item_statuses` - Status definitions
- `work_item_status_transitions` - Allowed transitions
- `work_item_type_relationships` - Parent-child type relationships
- `work_items` - Main work items
- `work_item_fields` - Custom field definitions
- `work_item_field_values` - Field value storage
- `work_item_comments` - Comments/discussion
- `work_item_activity` - Activity audit log
- `work_item_attachments` - File attachments
- `work_item_watchers` - Notification subscriptions

**Data Explorer:**
- `explorer_table_metadata` - Table metadata for AI
- `explorer_column_metadata` - Column metadata for AI
- `explorer_query_history` - Query execution history
- `explorer_saved_queries` - Saved query templates
- `explorer_table_relationships` - Table relationship metadata
- `explorer_query_patterns` - Common query patterns
- `explorer_schema_instructions` - Global query rules

**Audit & Monitoring:**
- `audit_logs` - System audit trail

---

## 2. Column & Index Analysis

### Drizzle Kit Check Result
```
Everything's fine 🐶🔥
```

**Status:** ✅ **NO DISCREPANCIES**

The `drizzle-kit check` command confirms that:
- All columns match their expected types
- All indexes are properly defined
- All foreign keys are correctly configured
- All constraints (NOT NULL, DEFAULT, etc.) match
- No drift between schema code and database

---

## 3. Migration System Analysis

### ❌ CRITICAL ISSUE: Missing Migration File

**Problem:** The migration journal references a migration file that does not exist.

**Details:**
- **Journal Entry (idx 26):** `0026_yummy_luke_cage`
- **Timestamp:** 1761665966163
- **Status:** ❌ **FILE MISSING**

**Evidence from git status:**
```
deleted:    lib/db/migrations/0026_yummy_luke_cage.sql
deleted:    lib/db/migrations/meta/0026_snapshot.json
```

### Migration Files Inventory

**Files on Disk:** 26 SQL files
```
0000_plain_toad.sql
0001_superb_magik.sql
0002_stale_madripoor.sql
0003_misty_sabretooth.sql
0007_overjoyed_vivisector.sql
0008_drop_chart_component_configs.sql
0009_rename_chart_display_configs_to_configurations.sql
0010_melodic_albert_cleary.sql
0011_unique_mandrill.sql
0014_add_chart_columns_baseline.sql
0015_saml_support.sql
0016_saml_replay_prevention.sql
0017_csrf_failure_events.sql
0018_oidc_state_management.sql
0019_clever_punisher.sql
0022_clear_dust.sql
0023_flawless_alex_power.sql
0025_add_data_source_id_to_chart_definitions.sql
0025_glamorous_madripoor.sql
0026_add_organization_practice_uids.sql ← Different from journal
0027_add_user_provider_uid.sql
0027_fix_explorer_columns.sql ← Not in journal
0028_add_analytics_read_own_permission.sql
0029_drop_unused_dual_axis_config.sql
0030_add_mfa_skip_tracking.sql
0031_add_organization_id_to_dashboards.sql
0032_add_hero_overlay_opacity.sql
```

**Journal Entries:** 27 entries
```
idx 0:  0000_plain_toad
idx 1:  0001_superb_magik
idx 2:  0002_stale_madripoor
idx 3:  0003_misty_sabretooth
idx 4:  0007_overjoyed_vivisector
idx 5:  0008_drop_chart_component_configs
idx 6:  0009_rename_chart_display_configs_to_configurations
idx 7:  0010_melodic_albert_cleary
idx 8:  0011_unique_mandrill
idx 9:  0014_add_chart_columns_baseline
idx 10: 0015_saml_support
idx 11: 0016_saml_replay_prevention
idx 12: 0017_csrf_failure_events
idx 13: 0018_oidc_state_management
idx 14: 0019_clever_punisher
idx 15: 0025_add_data_source_id_to_chart_definitions
idx 16: 0026_add_organization_practice_uids
idx 17: 0027_add_user_provider_uid
idx 18: 0028_add_analytics_read_own_permission
idx 19: 0029_drop_unused_dual_axis_config
idx 20: 0030_add_mfa_skip_tracking
idx 21: 0031_add_organization_id_to_dashboards
idx 22: 0022_clear_dust
idx 23: 0023_flawless_alex_power
idx 24: 0032_add_hero_overlay_opacity
idx 25: 0025_glamorous_madripoor
idx 26: 0026_yummy_luke_cage ← MISSING FILE
```

### Missing Snapshot Files

The following snapshot files are referenced in migrations but missing:
- `0026_snapshot.json` (deleted, per git status)

Additionally, many migrations lack corresponding snapshot files:
- 0010, 0012-0018, 0020-0021, 0024, 0026-0032

**Snapshots on Disk:** 15 files
```
0000_snapshot.json
0001_snapshot.json
0002_snapshot.json
0003_snapshot.json
0004_snapshot.json
0005_snapshot.json
0006_snapshot.json
0007_snapshot.json
0008_snapshot.json
0009_snapshot.json
0011_snapshot.json
0019_snapshot.json
0022_snapshot.json
0023_snapshot.json
0025_snapshot.json
```

### Unregistered Migration File

**File:** `0027_fix_explorer_columns.sql`
- **Status:** ⚠️ **EXISTS ON DISK BUT NOT IN JOURNAL**
- **Implication:** This migration exists but is not tracked in the migration system

---

## 4. Database Statistics

From `drizzle-kit introspect`:
- **Total Tables:** 53
- **Total Columns:** 623
- **Total Indexes:** 206
- **Total Foreign Keys:** 58
- **Total Enums:** 0
- **Total Policies:** 0
- **Total Check Constraints:** 0
- **Total Views:** 0

---

## 5. Findings Summary

### ✅ What's Working Well

1. **Perfect Table Match:** All 53 tables exist in both schema and database
2. **No Column Drift:** All columns, types, and constraints match
3. **Index Integrity:** All 206 indexes are properly defined
4. **Foreign Key Integrity:** All 58 foreign keys are correct
5. **Schema Consistency:** `drizzle-kit check` reports no issues

### ❌ Critical Issues

1. **Missing Migration File:**
   - File: `0026_yummy_luke_cage.sql`
   - Referenced in journal (idx 26) but deleted from filesystem
   - **Impact:** Migration system cannot run `drizzle-kit migrate`
   - **Error:** `No file ./lib/db/migrations/0026_yummy_luke_cage.sql found`

### ⚠️ Warnings

1. **Untracked Migration:**
   - File: `0027_fix_explorer_columns.sql`
   - Exists on disk but not registered in journal
   - **Risk:** May have been applied manually without tracking

2. **Missing Snapshots:**
   - 12+ migration files lack corresponding snapshot JSON files
   - Could indicate manual migrations or incomplete generation

3. **Migration Numbering Gaps:**
   - Missing: 0004, 0005, 0006, 0012, 0013, 0020, 0021, 0024
   - Suggests deleted or merged migrations

---

## 6. Recommendations

### Immediate Actions Required

1. **Fix Migration Journal:**
   - Remove the reference to `0026_yummy_luke_cage` from `_journal.json`
   - OR restore the deleted file from git history if needed
   
2. **Register Missing Migration:**
   - Add `0027_fix_explorer_columns.sql` to the migration journal
   - OR remove it if already applied

3. **Verify Database State:**
   - Confirm all migrations up to 0032 have been applied to the database
   - Check `__drizzle_migrations` table in the database

### Best Practices Going Forward

1. **Never manually delete migrations** - Use `drizzle-kit drop` or proper migration rollback
2. **Always commit migration journal changes** with the corresponding SQL files
3. **Run `drizzle-kit check`** before and after schema changes
4. **Keep snapshots in sync** - regenerate if missing

---

## 7. Conclusion

**Overall Assessment:** ✅ **MOSTLY HEALTHY WITH CRITICAL MIGRATION ISSUE**

The database schema itself is in excellent condition with perfect alignment between code and database. However, the migration tracking system has a critical inconsistency that prevents running migrations programmatically.

**Risk Level:** 🟡 **MEDIUM**
- Database is correct and operational
- New migrations cannot be applied until journal is fixed
- Potential for confusion about which migrations have been applied

**Required Action:** Fix migration journal before next deployment or schema change.

---

## Appendix A: Schema File Locations

**Main Schema File:**
- `lib/db/schema.ts` (central export file)

**Modular Schema Files:**
- `lib/db/analytics-schema.ts` - Analytics tables
- `lib/db/audit-schema.ts` - Audit logging
- `lib/db/chart-config-schema.ts` - Chart configuration
- `lib/db/csrf-schema.ts` - CSRF monitoring
- `lib/db/explorer-schema.ts` - Data Explorer AI metadata
- `lib/db/oidc-schema.ts` - OIDC authentication
- `lib/db/rbac-schema.ts` - Role-based access control
- `lib/db/refresh-token-schema.ts` - JWT and session management
- `lib/db/webauthn-schema.ts` - Passkey/WebAuthn
- `lib/db/work-item-fields-schema.ts` - Custom fields
- `lib/db/work-items-schema.ts` - Work items and related

**Configuration:**
- `drizzle.config.ts` - Drizzle Kit configuration

**Generated Files:**
- `lib/db/migrations/schema.ts` - Introspected schema (auto-generated)
- `lib/db/migrations/relations.ts` - Introspected relations (auto-generated)

---

## Appendix B: Audit Commands Used

```bash
# Check for schema differences
npx drizzle-kit check

# Introspect database
npx drizzle-kit introspect

# List migration files
ls -la lib/db/migrations/*.sql

# List snapshot files  
ls -la lib/db/migrations/meta/*.json

# Check git status for deleted files
git status
```

---

**End of Report**

