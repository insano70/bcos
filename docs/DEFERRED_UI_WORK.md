# Deferred UI Work - Analytics Security

**Status**: Ready for Frontend Implementation  
**Priority**: Medium (Core functionality works via API)  
**Estimated Effort**: 3.5 hours  
**Dependencies**: Phase 5 API work complete ✅

---

## Overview

The backend API endpoints for managing `practice_uids` (organizations) and `provider_uid` (users) are **fully implemented and tested**. Users can currently manage these fields via:
- ✅ Direct API calls (POST/PUT endpoints)
- ✅ SQL queries
- ❌ Admin UI forms (NOT YET IMPLEMENTED)

This document tracks the deferred UI form work.

---

## Task 5.2: Organization Form - practice_uids Input

**Estimated Time**: 2 hours  
**Assignee**: Frontend Engineer  
**Priority**: Medium  

### Requirements

#### 1. Add practice_uids Input Field
- **Type**: Text input (comma-separated integers)
- **Format**: "100, 101, 102"
- **Validation**: Client-side - must be comma-separated positive integers
- **Default Value**: Empty string (converts to empty array `[]`)
- **Example**: `100, 101, 102, 103`

#### 2. Input Validation
```typescript
// Parse comma-separated string to integer array
const parseracticeUids = (input: string): number[] => {
  if (!input.trim()) return [];
  
  const uids = input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10));
  
  // Validate all are integers
  if (uids.some(n => Number.isNaN(n) || n <= 0)) {
    throw new Error('All Practice UIDs must be positive integers (e.g., 100, 101, 102)');
  }
  
  return uids;
};
```

#### 3. Help Text
```
Practice UIDs (For Analytics Data Filtering)

Comma-separated list of practice_uid values from analytics database
(ih.agg_app_measures table). Users in this organization can only see
analytics data where practice_uid matches these values.

⚠️  Leave empty to restrict all analytics access (fail-closed security).

💡 Tip: Query your analytics database to find practice_uid values:
   SELECT DISTINCT practice_uid, practice 
   FROM ih.agg_app_measures 
   ORDER BY practice_uid;
```

#### 4. UI Location
- **Component**: `components/admin/organization-form.tsx` (create if doesn't exist)
- **Position**: After "Parent Organization" field, before "Is Active" checkbox
- **Visibility**: Always visible (admins only)

#### 5. Form Integration
```typescript
// In organization form component
const [formData, setFormData] = useState({
  name: organization?.name || '',
  slug: organization?.slug || '',
  parent_organization_id: organization?.parent_organization_id || null,
  practice_uids: organization?.practice_uids?.join(', ') || '', // Array to comma-separated string
  is_active: organization?.is_active ?? true,
});

// On submit
const practiceUidsArray = parsePracticeUids(formData.practice_uids);

await apiClient.put(`/api/organizations/${organizationId}`, {
  ...formData,
  practice_uids: practiceUidsArray, // Send as array to API
});
```

#### 6. Error Handling
- Show validation error inline below input field
- Red border on invalid input
- Clear error message: "All Practice UIDs must be positive integers (e.g., 100, 101, 102)"

#### 7. Success Criteria
- ✅ Input accepts comma-separated integers
- ✅ Validation rejects non-integers
- ✅ Help text guides administrators
- ✅ SQL query helper visible (tooltip or expandable section)
- ✅ Changes persist via API call
- ✅ Form shows current practice_uids when editing

---

## Task 5.4: User Form - provider_uid Input

**Estimated Time**: 1.5 hours  
**Assignee**: Frontend Engineer  
**Priority**: Medium  

### Requirements

#### 1. Add provider_uid Input Field
- **Type**: Number input
- **Format**: Single integer (not array)
- **Validation**: Must be positive integer or empty (null)
- **Default Value**: null
- **Example**: `42`

#### 2. Input Validation
```typescript
// Parse and validate provider_uid
const parseProviderUid = (input: string): number | null => {
  if (!input.trim()) return null;
  
  const uid = parseInt(input, 10);
  
  if (Number.isNaN(uid) || uid <= 0) {
    throw new Error('Provider UID must be a positive integer');
  }
  
  return uid;
};
```

#### 3. Help Text
```
Provider UID (For Analytics Data Filtering)

Optional. Only required for users with analytics:read:own permission.
Must match provider_uid from ih.agg_app_measures table in analytics database.

⚠️  Leave empty if user doesn't need provider-level analytics access.
⚠️  Users with this field and analytics:read:own see ONLY their provider's data.

💡 Tip: Query analytics database to find provider_uid values:
   SELECT DISTINCT provider_uid, provider_name 
   FROM ih.agg_app_measures 
   WHERE provider_uid IS NOT NULL 
   ORDER BY provider_uid;
```

#### 4. UI Location
- **Component**: `components/admin/user-form.tsx` (create if doesn't exist)
- **Position**: After "Is Active" checkbox, in "Advanced Settings" or "Analytics" section
- **Visibility**: Always visible to admins (help text explains when needed)

#### 5. Form Integration
```typescript
// In user form component
const [formData, setFormData] = useState({
  first_name: user?.first_name || '',
  last_name: user?.last_name || '',
  email: user?.email || '',
  email_verified: user?.email_verified ?? false,
  is_active: user?.is_active ?? true,
  provider_uid: user?.provider_uid?.toString() || '', // Number to string for input
});

// On submit
const providerUid = parseProviderUid(formData.provider_uid);

await apiClient.put(`/api/users/${userId}`, {
  data: {
    ...formData,
    provider_uid: providerUid, // Send as number|null to API
  },
});
```

#### 6. Conditional Display (Optional Enhancement)
```typescript
// Only show if user has analytics:read:own role (optional feature)
const userHasAnalyticsOwn = user?.roles?.some(
  role => role.permissions?.some(p => p.name === 'analytics:read:own')
);

{userHasAnalyticsOwn && (
  <div>
    <label>Provider UID</label>
    <input type="number" ... />
  </div>
)}
```

#### 7. Error Handling
- Show validation error inline below input field
- Red border on invalid input
- Clear error message: "Provider UID must be a positive integer"
- Handle null values (empty input = null provider_uid)

#### 8. Success Criteria
- ✅ Input accepts positive integers
- ✅ Input can be cleared (set to null)
- ✅ Validation rejects invalid input
- ✅ Help text guides administrators
- ✅ SQL query helper visible
- ✅ Changes persist via API call
- ✅ Form shows current provider_uid when editing

---

## Implementation Guidelines

### API Endpoints (Already Complete ✅)

**Organization Endpoints**:
```bash
# Get all organizations with practice_uids
GET /api/organizations
Response: { organizations: [{ id, name, practice_uids: [100, 101], ... }] }

# Update organization practice_uids
PUT /api/organizations/{id}
Body: { practice_uids: [100, 101, 102] }
Response: { id, name, practice_uids: [100, 101, 102], ... }
```

**User Endpoints**:
```bash
# Get user with provider_uid
GET /api/users/{id}
Response: { id, email, provider_uid: 42, ... }

# Update user provider_uid
PUT /api/users/{id}
Body: { data: { provider_uid: 42 } }
Response: { id, email, provider_uid: 42, ... }
```

### Validation (Already Complete ✅)

**Zod Schemas**:
- `organizationCreateSchema.practice_uids` - Array validation
- `organizationUpdateSchema.practice_uids` - Optional array validation
- `userUpdateSchema.provider_uid` - Nullable integer validation

---

## Testing Requirements

### Organization Form Testing

**Test Scenarios**:
1. ✅ Create organization with practice_uids
2. ✅ Update organization practice_uids
3. ✅ Clear practice_uids (set to empty array)
4. ✅ Validation rejects non-integers ("abc, 100")
5. ✅ Validation rejects negative integers ("-1, 100")
6. ✅ Validation accepts comma-separated integers ("100, 101, 102")
7. ✅ Whitespace handling ("100 , 101 , 102" → [100, 101, 102])
8. ✅ Empty input converts to empty array ([])

### User Form Testing

**Test Scenarios**:
1. ✅ Set provider_uid for user
2. ✅ Update provider_uid
3. ✅ Clear provider_uid (set to null)
4. ✅ Validation rejects non-integers ("abc")
5. ✅ Validation rejects negative integers ("-1")
6. ✅ Validation accepts positive integer ("42")
7. ✅ Empty input converts to null
8. ✅ Zero is rejected (must be positive)

---

## SQL Workaround (Until UI Complete)

Administrators can use SQL to manage these fields:

### Find Available practice_uid Values
```sql
SELECT DISTINCT practice_uid, practice, COUNT(*) as record_count
FROM ih.agg_app_measures
GROUP BY practice_uid, practice
ORDER BY practice;
```

### Find Available provider_uid Values
```sql
SELECT DISTINCT provider_uid, provider_name, COUNT(*) as record_count
FROM ih.agg_app_measures
WHERE provider_uid IS NOT NULL
GROUP BY provider_uid, provider_name
ORDER BY provider_uid;
```

### Set practice_uids for Organization
```sql
UPDATE organizations
SET practice_uids = ARRAY[100, 101, 102]
WHERE slug = 'acme-healthcare';

-- Verify
SELECT organization_id, name, practice_uids FROM organizations;
```

### Set provider_uid for User
```sql
UPDATE users
SET provider_uid = 42
WHERE email = 'provider@example.com';

-- Verify
SELECT user_id, email, provider_uid FROM users WHERE provider_uid IS NOT NULL;
```

---

## Acceptance Criteria

### API Layer (Complete ✅)
- [x] Organization API accepts practice_uids array
- [x] User API accepts provider_uid integer/null
- [x] Validation schemas enforce data integrity
- [x] GET endpoints return practice_uids/provider_uid
- [x] Cache invalidation on organization changes
- [x] Audit logging for changes

### UI Layer (Pending ⏸️)
- [ ] Organization form has practice_uids input field
- [ ] User form has provider_uid input field
- [ ] Client-side validation works
- [ ] Help text guides administrators
- [ ] SQL query examples shown
- [ ] Error messages are clear
- [ ] Forms integrate with API endpoints

---

## Deployment Options

### Option 1: Deploy Without UI Forms (Recommended)
- ✅ Core security functionality works
- ✅ Admins can use SQL to set values
- ✅ Admins can use direct API calls
- ⏸️ UI forms added in next release

### Option 2: Wait for UI Forms
- ⏸️ Delay deployment until frontend work complete
- ⏸️ Additional 3.5 hours for form implementation
- ⏸️ Additional testing required

**Recommendation**: Deploy Option 1 (without UI forms) and add forms in next sprint.

---

## Files to Create/Modify (Frontend Work)

### New/Updated Components
1. `components/admin/organization-form.tsx` - Add practice_uids field
2. `components/admin/user-form.tsx` - Add provider_uid field

### Estimated Lines of Code
- Organization form: ~50 lines (input field + validation + help text)
- User form: ~50 lines (input field + validation + help text)
- **Total**: ~100 lines of UI code

---

## Priority Assessment

**Priority**: Medium (Not Blocking)

**Justification**:
- Core security functionality operational
- API endpoints fully functional
- SQL workaround available
- UI forms improve UX but don't add functionality
- Can be implemented post-deployment

**Timeline**: Next sprint or as frontend resources become available

---

**Document Status**: Ready for Frontend Implementation  
**Last Updated**: 2025-10-13  
**Contact**: Backend team for API questions, refer to this doc for requirements

