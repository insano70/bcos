# Wide Coverage Plan - Committed Factory Testing

**Strategy**: Establish basic committed factory coverage across all major service areas before deepening any single area.

**Goal**: Every RBAC service has at minimum:
- ✅ Basic CRUD operation tests with real data
- ✅ Permission enforcement verification
- ✅ Committed factory usage
- ✅ Automatic cleanup
- ✅ 5-10 core tests per service

---

## Current Status

### ✅ Complete Coverage
1. **Charts Service** - 43 tests, comprehensive
2. **Dashboards Service** - 22 tests, comprehensive (committed version)

### 🔄 Services Needing Basic Coverage

#### High Priority (Core Business Domain)

**1. RBAC Users Service**
- **File**: `lib/services/rbac-users-service.ts`
- **Target**: `tests/integration/rbac/users-service-committed.test.ts`
- **Key Operations**:
  - getUsers() - list with filtering
  - getUserById(id) - single record
  - getUserCount() - aggregation
  - createUser(data) - creation
  - updateUser(id, data) - updates
  - deleteUser(id) - deletion (soft delete?)
  - getUserRoles(userId) - role associations
  - assignRole(userId, roleId) - role assignment
  - removeRole(userId, roleId) - role removal
- **Estimated Tests**: 10-12 tests
- **Dependencies**: User factory (exists)

**2. RBAC Organizations Service**
- **File**: `lib/services/rbac-organizations-service.ts`
- **Target**: `tests/integration/rbac/organizations-service-committed.test.ts`
- **Key Operations**:
  - getOrganizations() - list
  - getOrganizationById(id) - single
  - getOrganizationCount() - count
  - createOrganization(data) - create
  - updateOrganization(id, data) - update
  - deleteOrganization(id) - delete
  - getOrganizationUsers(orgId) - user associations
  - addUserToOrganization(orgId, userId) - add user
  - removeUserFromOrganization(orgId, userId) - remove user
- **Estimated Tests**: 10-12 tests
- **Dependencies**: Organization factory (exists), User factory

**3. RBAC Data Sources Service**
- **File**: `lib/services/rbac-data-sources-service.ts`
- **Target**: `tests/integration/rbac/data-sources-service-committed.test.ts`
- **Key Operations**:
  - getDataSources() - list
  - getDataSourceById(id) - single
  - createDataSource(data) - create
  - updateDataSource(id, data) - update
  - deleteDataSource(id) - delete
  - testDataSourceConnection(id) - connection test
- **Estimated Tests**: 8-10 tests
- **Dependencies**: Need DataSource factory (new)

#### Medium Priority (Supporting Services)

**4. Practice Management** (if has service)
- **Tables**: practices, practice_attributes, practice_comments
- **Target**: `tests/integration/business/practices-service-committed.test.ts`
- **Key Operations**: CRUD for practices
- **Estimated Tests**: 8-10 tests
- **Dependencies**: Need Practice factory (exists in basic form)

**5. Staff Management** (if has service)
- **Table**: staff_members
- **Target**: `tests/integration/business/staff-service-committed.test.ts`
- **Key Operations**: CRUD for staff
- **Estimated Tests**: 8-10 tests
- **Dependencies**: Need Staff factory (new)

**6. Templates** (if has service)
- **Table**: templates
- **Target**: `tests/integration/business/templates-service-committed.test.ts`
- **Key Operations**: CRUD for templates
- **Estimated Tests**: 6-8 tests
- **Dependencies**: Need Template factory (new)

#### Lower Priority (Analytics Supporting Services)

**7. Chart Config Service**
- **File**: `lib/services/chart-config-service.ts`
- **Target**: `tests/integration/analytics/chart-config-service-committed.test.ts`
- **Key Operations**: Chart configuration management
- **Estimated Tests**: 6-8 tests
- **Dependencies**: Chart factory (exists)

**8. Calculated Fields Service**
- **File**: `lib/services/calculated-fields-service.ts`
- **Target**: `tests/integration/analytics/calculated-fields-service-committed.test.ts`
- **Key Operations**: Calculated field management
- **Estimated Tests**: 6-8 tests

---

## Implementation Order

### Round 1: Core RBAC Services (Priority)
**Estimated Time**: 3-4 hours

1. **RBAC Users Service** (1 hour)
   - Most important - users are foundation of RBAC
   - Factory exists
   - Focus on basic CRUD + role management

2. **RBAC Organizations Service** (1 hour)
   - Second most important - org scoping
   - Factory exists
   - Focus on basic CRUD + user associations

3. **RBAC Data Sources Service** (1-1.5 hours)
   - Need to create factory first
   - Focus on basic CRUD + connection testing

### Round 2: Business Domain Services (If They Exist)
**Estimated Time**: 2-3 hours

4. **Practices Service** (1 hour)
   - Enhance existing factory
   - Basic CRUD coverage

5. **Staff Service** (1 hour)
   - Create new factory
   - Basic CRUD coverage

6. **Templates Service** (30 min - 1 hour)
   - Create new factory
   - Basic CRUD coverage

### Round 3: Analytics Supporting Services (Optional)
**Estimated Time**: 1-2 hours

7. **Chart Config Service** (45 min)
8. **Calculated Fields Service** (45 min)

---

## Test Template Structure

Each basic committed test file should include:

```typescript
describe('[Service Name] - Basic Committed Tests', () => {
  let scope: ScopedFactoryCollection
  let scopeId: string

  beforeEach(() => {
    scopeId = `[service]-test-${nanoid(8)}`
    scope = createTestScope(scopeId)
  })

  afterEach(async () => {
    await scope.cleanup()
  })

  // 1. Read Operations (2-3 tests)
  describe('GET Operations', () => {
    it('should retrieve [entities] with real data', async () => { })
    it('should filter by search term', async () => { })
    it('should deny retrieval without permissions', async () => { })
  })

  // 2. Single Record (2 tests)
  describe('GET by ID', () => {
    it('should retrieve specific [entity]', async () => { })
    it('should return null for non-existent', async () => { })
  })

  // 3. Creation (2 tests)
  describe('POST - Creation', () => {
    it('should create [entity] successfully', async () => { })
    it('should deny creation without permissions', async () => { })
  })

  // 4. Updates (2 tests)
  describe('PATCH - Updates', () => {
    it('should update [entity] successfully', async () => { })
    it('should deny update without permissions', async () => { })
  })

  // 5. Deletion (2 tests)
  describe('DELETE - Deletion', () => {
    it('should delete [entity] successfully', async () => { })
    it('should deny deletion without permissions', async () => { })
  })
})
```

**Target**: 10 tests per service = good basic coverage

---

## Factory Creation Checklist

For each new factory needed:

### 1. Create Factory File
- [ ] Create `tests/factories/committed/[entity]-factory.ts`
- [ ] Extend BaseFactory
- [ ] Set entityType
- [ ] Override extractId if needed (check schema for ID field name)
- [ ] Implement createInDatabase
- [ ] Implement cleanupFromDatabase
- [ ] Override trackDependencies for foreign keys
- [ ] Export factory singleton
- [ ] Export convenience function

### 2. Register Factory
- [ ] Import in `tests/factories/committed/setup.ts`
- [ ] Register with FactoryRegistry
- [ ] Export from `tests/factories/committed/index.ts`

### 3. Update Cleanup Tracker
- [ ] Add entity type to TestEntityType in `id-generator.ts`
- [ ] Add cleanup priority to CLEANUP_ORDER in `cleanup-tracker.ts`

---

## Success Metrics

### Coverage Goals
- ✅ Charts: 43 tests (DONE)
- ✅ Dashboards: 22 tests (DONE)
- 🎯 Users: 10+ tests (TARGET)
- 🎯 Organizations: 10+ tests (TARGET)
- 🎯 Data Sources: 8+ tests (TARGET)
- 🎯 Practices: 8+ tests (STRETCH)
- 🎯 Staff: 8+ tests (STRETCH)
- 🎯 Templates: 6+ tests (STRETCH)

**Total Target**: 65 existing + 28 new = **93+ tests**

### Quality Gates
- ✅ All tests use committed factories
- ✅ All tests have automatic cleanup
- ✅ All tests verify real CRUD operations
- ✅ All tests check permission enforcement
- ✅ All tests pass consistently
- ✅ pnpm tsc passes
- ✅ Test suite completes in < 60 seconds

---

## Next Steps

1. ✅ Review this plan
2. 🔄 Start with RBAC Users Service (highest priority)
3. 🔄 Create/enhance factories as needed
4. 🔄 Implement basic test suites
5. 🔄 Verify all tests pass
6. 🔄 Document completion

After wide coverage is complete, we can return to deepening specific areas (Phase 2-4 from original plan).

---

## Notes

- Focus on BASIC coverage - 10 tests per service
- Don't go deep yet - that comes later
- Reuse patterns from charts/dashboards tests
- Prioritize services that exist and have clear CRUD operations
- Skip services that don't exist or are purely utility functions
- Keep factories simple - just enough to support basic tests

**Philosophy**: "Wide and shallow first, then deep later"
