# Upload Security & Permission Standardization Recommendations

## Executive Summary
The current implementation has a **CRITICAL SECURITY VULNERABILITY** where any authenticated user can upload photos to any practice's staff members without proper ownership verification. This document provides detailed recommendations for fixing these issues.

## Current Issues

### 1. **Critical Security Vulnerability in Staff Photo Upload**
- **Issue**: No ownership validation when updating staff photos
- **Risk**: Any authenticated user can upload photos to any practice's staff
- **Impact**: HIGH - Data integrity and privacy breach

### 2. **Permission Inconsistencies**
- **Issue**: GET endpoints using UPDATE permissions
- **Risk**: MEDIUM - Confusion in permission model
- **Example**: `GET /api/practices/[id]/attributes` requires `practices:update:own`

### 3. **Overly Broad Upload Permissions**
- **Issue**: Upload endpoint accepts multiple unrelated permissions
- **Risk**: MEDIUM - Permission creep and unclear security boundaries

## Implementation Status

### ✅ Fixed in This Update:
1. **Staff Photo Upload Authorization**
   - Added practice ownership verification
   - Validates staff member belongs to practice
   - Checks proper permissions (`practices:staff:manage:own`)

2. **Practice Image Upload Authorization**
   - Added practice ownership verification
   - Validates user has `practices:update:own` permission
   - Proper error messages for authorization failures

3. **Permission Standardization**
   - Fixed GET practice attributes to use `practices:read:own`
   - Simplified upload route permissions to `api:write:organization`
   - Internal permission checks based on upload type

## Detailed Recommendations

### 1. **Upload Workflow Architecture** ✅ CORRECT AS DESIGNED
The current workflow is properly designed:
```
Frontend → Upload File with Metadata → Backend Processes & Updates DB → Frontend Refreshes
```
This is the correct pattern - no URL passing between frontend and backend.

### 2. **Permission Model Standardization**

#### Current Permission Structure:
```typescript
// Practice Permissions
practices:read:own      - View own practice data
practices:read:all      - View all practices (super admin)
practices:update:own    - Update own practice
practices:manage:all    - Full practice management (super admin)

// Staff Permissions
practices:staff:read:own    - View own practice staff
practices:staff:manage:own  - Create/update/delete own practice staff
```

#### Recommended Changes:
1. **Separate Staff Read Permission**: Already exists but not consistently used
2. **Granular Upload Permissions**: Consider adding:
   - `practices:images:upload:own` - Upload practice images
   - `practices:staff:images:upload:own` - Upload staff photos

### 3. **Security Best Practices**

#### Authorization Checks (Now Implemented):
```typescript
// 1. Verify practice exists and user owns it
const [practice] = await db.select().from(practices)
  .where(and(
    eq(practices.practice_id, practiceId),
    isNull(practices.deleted_at)
  ))

// 2. Check permissions AND ownership
const canManage = userContext.all_permissions?.some(p => 
  p.name === 'practices:staff:manage:own' || p.name === 'practices:manage:all'
)
const isOwner = practice.owner_user_id === userContext.user_id
const isSuperAdmin = userContext.is_super_admin

if (!canManage || (!isOwner && !isSuperAdmin)) {
  return createErrorResponse('Access denied', 403, request)
}
```

### 4. **API Pattern Consistency**

#### Standard Error Handling:
```typescript
// ✅ CORRECT
throw NotFoundError('Practice')

// ❌ INCORRECT (found in staff route)
return NextResponse.json({ error: 'Practice not found' }, { status: 404 })
```

#### Parameter Extraction:
```typescript
// ✅ CORRECT - Use predefined schemas
const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema)

// ❌ AVOID - Inline schemas
const params = await extractRouteParams(args[0], z.object({...}))
```

### 5. **Future Enhancements**

#### 1. **Audit Trail for Uploads**
```typescript
await AuditLogger.logUserAction({
  action: 'staff_photo_upload',
  userId: userContext.user_id,
  resourceType: 'staff_member',
  resourceId: staffId,
  metadata: {
    practiceId,
    fileName,
    previousPhotoUrl: existingStaff.photo_url
  }
})
```

#### 2. **Rate Limiting by Resource**
```typescript
// Different rate limits for different upload types
const rateLimits = {
  'practice_logo': { requests: 5, window: '1h' },
  'staff_photo': { requests: 20, window: '1h' },
  'gallery': { requests: 50, window: '1h' }
}
```

#### 3. **Image Validation**
- Verify image dimensions for specific use cases
- Check for inappropriate content (integration with moderation API)
- Validate file headers match MIME type

## Testing Recommendations

### 1. **Security Tests**
```typescript
describe('Upload Authorization', () => {
  it('should reject staff photo upload for non-owner', async () => {
    const otherUserToken = await createUserWithPractice()
    const response = await uploadStaffPhoto(practiceId, staffId, otherUserToken)
    expect(response.status).toBe(403)
  })
  
  it('should allow staff photo upload for practice owner', async () => {
    const ownerToken = await getPracticeOwnerToken(practiceId)
    const response = await uploadStaffPhoto(practiceId, staffId, ownerToken)
    expect(response.status).toBe(200)
  })
})
```

### 2. **Permission Tests**
- Test each permission combination
- Verify super admin override works
- Test boundary conditions (deleted practices, inactive staff)

## Migration Steps

### Phase 1: Security Fixes ✅ COMPLETED
1. Add authorization checks to upload endpoints
2. Fix permission inconsistencies
3. Standardize error handling

### Phase 2: Monitoring
1. Add detailed logging for all upload operations
2. Monitor for authorization failures
3. Track upload patterns for anomaly detection

### Phase 3: Enhancement
1. Implement granular upload permissions
2. Add image moderation
3. Implement upload quotas

## Conclusion

The critical security vulnerabilities have been addressed. The upload workflow follows the correct pattern of service-layer database updates. Further enhancements can be made for more granular permissions and better monitoring, but the system is now secure against unauthorized uploads.
