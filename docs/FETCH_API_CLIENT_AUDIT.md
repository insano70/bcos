# Fetch vs ApiClient Usage Audit

**Date**: October 26, 2025  
**Purpose**: Identify all `fetch()` calls that should use `apiClient` for proper CSRF token handling

---

## Executive Summary

Found **7 problematic** `fetch()` calls in application code that should use `apiClient`.  
Found **20+ legitimate** `fetch()` calls that should remain as-is.

### Issues Found
- 🔴 **HIGH**: 4 files missing CSRF tokens on state-changing operations
- 🟡 **MEDIUM**: 3 files missing CSRF tokens on read operations

---

## Analysis by Category

### ✅ LEGITIMATE fetch() Usage (Keep As-Is)

#### 1. **S3 Presigned URLs** ✅
**Files**: 
- `lib/hooks/use-work-item-attachments.ts` (line 86)
- `lib/s3/private-assets/*` (documentation examples)

**Why Legitimate**:
```typescript
// Upload to S3 presigned URL (external AWS endpoint, not our API)
const uploadResponse = await fetch(uploadData.upload_url, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
});
```
- ✅ External S3 endpoint, not our API
- ✅ No CSRF needed (presigned URL includes signature)
- ✅ No authentication needed (URL is time-limited and signed)

#### 2. **ApiClient Implementation** ✅
**File**: `lib/api/client.ts`

**Why Legitimate**:
- This IS the apiClient implementation itself
- Must use raw fetch() internally
- Handles CSRF token injection

#### 3. **Auth HTTP Service** ✅
**File**: `components/auth/services/auth-http-service.ts`

**Why Legitimate**:
- Special authentication flow (login, logout, refresh)
- Manages CSRF tokens manually
- Part of the auth bootstrapping process

#### 4. **CSRF Token Fetching** ✅
**File**: `components/auth/hooks/use-csrf-management.ts`

**Why Legitimate**:
- Fetching CSRF tokens (can't use apiClient - circular dependency)
- No authentication needed for anonymous CSRF tokens

#### 5. **MFA Auth Flow** ⚠️ REVIEW NEEDED
**Files**:
- `components/auth/mfa-verify-dialog.tsx`
- `components/auth/mfa-setup-dialog.tsx`

**Why Might Be Legitimate**:
- Part of authentication flow (using temp tokens)
- Manually manages CSRF tokens
- BUT: Could potentially use authHttpService instead

**Recommendation**: Leave as-is (auth flow complexity, manual CSRF handling works)

#### 6. **Integration Tests** ✅
**Files**: All files in `tests/integration/`

**Why Legitimate**:
- Testing auth flows, need direct fetch for test control
- Testing error cases, need raw responses

#### 7. **Documentation** ✅
**Files**: All files in `docs/`

**Why Legitimate**:
- Just code examples, not actual application code

---

### 🔴 PROBLEMATIC fetch() Usage (Should Use ApiClient)

#### **1. Gallery Manager** 🔴 HIGH PRIORITY
**File**: `components/gallery-manager.tsx` (line 47)

**Current**:
```typescript
const response = await fetch('/api/upload', {
  method: 'POST',
  credentials: 'include',
  headers,
  body: formData,
});
```

**Problem**:
- ❌ Manual CSRF token handling
- ❌ Missing error retry logic
- ❌ Missing standardized error handling
- ❌ FormData upload (apiClient might not support)

**Impact**: CSRF errors on image uploads (like we saw with attachments)

**Recommendation**: 
```typescript
// Check if apiClient supports FormData, if so:
const result = await apiClient.post<{ url: string }>('/api/upload', formData);

// If apiClient doesn't support FormData, create helper:
// lib/api/upload-client.ts with FormData + CSRF support
```

---

#### **2. Image Upload** 🔴 HIGH PRIORITY
**File**: `components/image-upload.tsx` (line 55)

**Current**:
```typescript
const response = await fetch('/api/upload', {
  method: 'POST',
  credentials: 'include',
  headers,
  body: formData,
});
```

**Problem**: Same as gallery-manager (FormData + missing CSRF)

**Impact**: CSRF errors on logo/image uploads

**Recommendation**: Same as gallery-manager

---

#### **3. Edit User Modal - MFA Reset** 🔴 HIGH PRIORITY
**File**: `components/edit-user-modal.tsx` (line 185)

**Current**:
```typescript
const response = await fetch(`/api/admin/users/${user.id}/mfa/reset`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Problem**:
- ❌ NO CSRF token
- ❌ NO credentials: 'include'
- ❌ Missing error handling
- ❌ State-changing POST operation

**Impact**: HIGH - MFA reset will fail with CSRF error

**Recommendation**:
```typescript
await apiClient.post(`/api/admin/users/${user.id}/mfa/reset`, {});
```

---

#### **4. Practices Activate** 🔴 HIGH PRIORITY
**File**: `app/(default)/configure/practices/practices-content.tsx` (line 124)

**Current**:
```typescript
const response = await fetch(`/api/practices/${_practice.id}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    status: 'active',
  }),
});
```

**Problem**:
- ❌ NO CSRF token
- ❌ NO credentials: 'include'
- ❌ State-changing PUT operation

**Impact**: HIGH - Practice activation will fail with CSRF error

**Recommendation**:
```typescript
await apiClient.put(`/api/practices/${_practice.id}`, {
  status: 'active',
});
```

---

#### **5. Dashboard Page - Default Dashboard Fetch** 🟡 MEDIUM PRIORITY
**File**: `app/(default)/dashboard/page.tsx` (line 15)

**Current**:
```typescript
const response = await fetch('/api/admin/analytics/dashboards/default');
const data = await response.json();
```

**Problem**:
- ⚠️ Read operation (GET), less critical
- ❌ Missing error handling
- ❌ Missing credentials: 'include'

**Impact**: MEDIUM - Might fail if API requires auth headers

**Recommendation**:
```typescript
const data = await apiClient.get<{ defaultDashboard: Dashboard }>(
  '/api/admin/analytics/dashboards/default'
);
```

---

#### **6. Login Form - Default Dashboard Fetch** 🟡 MEDIUM PRIORITY
**File**: `components/auth/login-form.tsx` (line 64)

**Current**:
```typescript
const response = await fetch('/api/admin/analytics/dashboards/default');
const data = await response.json();
```

**Problem**: Same as dashboard page

**Recommendation**: Same as dashboard page

---

#### **7. Work Item Data Table Bulk Delete** 🟡 LOW PRIORITY
**File**: `app/(default)/work/work-items-content.tsx` (line 169-177)

**Current**: Uses `apiClient.delete()` ✅ CORRECT

**Status**: Already fixed! ✅

---

## Recommendations Summary

### **Immediate Fixes Needed** (4 files)

| File | Line | Endpoint | Method | Priority | Fix |
|------|------|----------|--------|----------|-----|
| `gallery-manager.tsx` | 47 | `/api/upload` | POST | 🔴 HIGH | Use apiClient (if FormData supported) |
| `image-upload.tsx` | 55 | `/api/upload` | POST | 🔴 HIGH | Use apiClient (if FormData supported) |
| `edit-user-modal.tsx` | 185 | `/api/admin/users/.../mfa/reset` | POST | 🔴 HIGH | Use apiClient.post() |
| `practices-content.tsx` | 124 | `/api/practices/...` | PUT | 🔴 HIGH | Use apiClient.put() |

### **Nice-to-Have Fixes** (2 files)

| File | Line | Endpoint | Method | Priority | Fix |
|------|------|----------|--------|----------|-----|
| `dashboard/page.tsx` | 15 | `/api/admin/.../dashboards/default` | GET | 🟡 MEDIUM | Use apiClient.get() |
| `login-form.tsx` | 64 | `/api/admin/.../dashboards/default` | GET | 🟡 MEDIUM | Use apiClient.get() |

---

## Special Case: FormData Uploads

### **Current Approach** (gallery-manager.tsx, image-upload.tsx)

```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('practiceId', practiceId);

const headers: HeadersInit = {};
if (csrfToken) {
  headers['x-csrf-token'] = csrfToken;  // Manual CSRF
}

const response = await fetch('/api/upload', {
  method: 'POST',
  credentials: 'include',
  headers,
  body: formData,  // FormData
});
```

### **Does ApiClient Support FormData?**

Checking `lib/api/client.ts`:
```typescript
async request<T>(endpoint: string, options: RequestInit & ApiClientOptions = {}): Promise<T> {
  const requestHeaders = new Headers({
    'Content-Type': 'application/json',  // ❌ Hardcoded JSON
    ...(headers as Record<string, string>),
  });
  
  // Add CSRF token
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (this.authContext?.csrfToken) {
      requestHeaders.set('x-csrf-token', this.authContext.csrfToken);  // ✅
    }
  }
  
  // Body is stringified
  if (body) {
    requestInit.body = JSON.stringify(data);  // ❌ JSON.stringify doesn't work for FormData
  }
}
```

**Answer**: ❌ NO - ApiClient currently only supports JSON, not FormData

### **Options for FormData**

**Option A**: Extend apiClient to support FormData ⭐ RECOMMENDED
```typescript
async request<T>(endpoint: string, options: RequestInit & ApiClientOptions = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  
  const requestHeaders = new Headers({
    ...(!isFormData && { 'Content-Type': 'application/json' }),  // Only for JSON
    ...(headers as Record<string, string>),
  });
  
  // CSRF token
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (this.authContext?.csrfToken) {
      requestHeaders.set('x-csrf-token', this.authContext.csrfToken);
    }
  }
  
  const requestInit: RequestInit = {
    ...requestOptions,
    headers: requestHeaders,
    credentials: 'include',
    body: isFormData ? options.body : JSON.stringify(options.body),  // Handle both
  };
}
```

**Option B**: Create separate uploadClient for FormData
```typescript
// lib/api/upload-client.ts
export async function uploadFormData(endpoint: string, formData: FormData) {
  // Get CSRF token from context
  // Add to headers
  // fetch() with FormData
}
```

**Option C**: Keep current implementation, add better CSRF handling
- Ensure CSRF token is always retrieved
- Add better error handling
- Keep manual fetch() but make it robust

---

## Recommended Action Plan

### **Phase 1: Fix Critical Issues** (30 minutes)

1. **Edit User Modal** - MFA Reset
   - Change: Use `apiClient.post()`
   - Impact: Fixes CSRF errors on MFA reset
   - Lines: 1 change

2. **Practices Content** - Practice Activation
   - Change: Use `apiClient.put()`
   - Impact: Fixes CSRF errors on practice activation
   - Lines: 1 change

3. **Dashboard/Login** - Default Dashboard
   - Change: Use `apiClient.get()`
   - Impact: Better error handling, consistent auth
   - Lines: 2 changes (same code in 2 files)

### **Phase 2: Fix FormData Uploads** (1-2 hours)

**Option A** (Recommended): Extend ApiClient
- Modify `lib/api/client.ts` to detect and handle FormData
- Update `gallery-manager.tsx` to use apiClient
- Update `image-upload.tsx` to use apiClient
- Test file uploads still work

**Option B** (Alternative): Create UploadClient
- Create `lib/api/upload-client.ts`
- Move FormData logic there
- Update gallery-manager and image-upload
- Keep separation between JSON and FormData

**Option C** (Quick Fix): Improve current implementation
- Extract CSRF token handling to helper
- Add better error handling
- Keep fetch() but make it robust

---

## Impact Assessment

### **Fixes Needed by Priority**

**🔴 CRITICAL** (Will break in production):
1. MFA Reset - NO CSRF token
2. Practice Activation - NO CSRF token

**🟡 HIGH** (Will break with CSRF enforcement):
1. Gallery Manager - Manual CSRF (might fail)
2. Image Upload - Manual CSRF (might fail)

**🟢 MEDIUM** (Should fix for consistency):
1. Dashboard default fetch
2. Login form default dashboard fetch

---

## Detailed Recommendations

### **File 1: components/edit-user-modal.tsx**

**Line 185**: MFA Reset

**BEFORE**:
```typescript
const response = await fetch(`/api/admin/users/${user.id}/mfa/reset`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**AFTER**:
```typescript
await apiClient.post(`/api/admin/users/${user.id}/mfa/reset`, {});
```

**Benefits**: Automatic CSRF, auth, error handling

---

### **File 2: app/(default)/configure/practices/practices-content.tsx**

**Line 124**: Practice Activation

**BEFORE**:
```typescript
const response = await fetch(`/api/practices/${_practice.id}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    status: 'active',
  }),
});

if (!response.ok) {
  throw new Error('Failed to activate practice');
}
```

**AFTER**:
```typescript
await apiClient.put(`/api/practices/${_practice.id}`, {
  status: 'active',
});
```

**Benefits**: Automatic CSRF, auth, error handling, less code

---

### **File 3: app/(default)/dashboard/page.tsx**

**Line 15**: Default Dashboard Fetch

**BEFORE**:
```typescript
const response = await fetch('/api/admin/analytics/dashboards/default');
const data = await response.json();

if (data.data?.defaultDashboard?.dashboard_id) {
  const dashboardId = data.data.defaultDashboard.dashboard_id;
  router.replace(`/dashboard/view/${dashboardId}`);
}
```

**AFTER**:
```typescript
const data = await apiClient.get<{ defaultDashboard?: { dashboard_id: string } }>(
  '/api/admin/analytics/dashboards/default'
);

if (data.defaultDashboard?.dashboard_id) {
  router.replace(`/dashboard/view/${data.defaultDashboard.dashboard_id}`);
}
```

**Benefits**: Automatic CSRF, auth, standardized response parsing

---

### **File 4: components/auth/login-form.tsx**

**Line 64**: Same as dashboard page (duplicate code)

**BEFORE**:
```typescript
const response = await fetch('/api/admin/analytics/dashboards/default');
const data = await response.json();
```

**AFTER**:
```typescript
const data = await apiClient.get<{ defaultDashboard?: { dashboard_id: string } }>(
  '/api/admin/analytics/dashboards/default'
);
```

---

### **Files 5-6: FormData Uploads** 🔴 HIGH PRIORITY

**Files**:
- `components/gallery-manager.tsx` (line 47)
- `components/image-upload.tsx` (line 55)

**Current Approach**:
- Manual CSRF token from `getCSRFTokenFromCookie()`
- Manual credentials: 'include'
- Works, but fragile

**Recommendation**: **Extend ApiClient** (See Phase 2 below)

---

## Phase 2: Extend ApiClient for FormData Support

### **Current ApiClient Limitation**

```typescript
// lib/api/client.ts
async request<T>(endpoint: string, options: RequestInit & ApiClientOptions = {}): Promise<T> {
  const requestHeaders = new Headers({
    'Content-Type': 'application/json',  // ❌ Hardcoded
    ...(headers as Record<string, string>),
  });
  
  // ...
  
  requestInit.body = data ? JSON.stringify(data) : null;  // ❌ Only JSON
}
```

### **Proposed Enhancement**

```typescript
async request<T>(endpoint: string, options: RequestInit & ApiClientOptions = {}): Promise<T> {
  const { body, headers = {}, ...requestOptions } = options;
  
  // Detect FormData
  const isFormData = body instanceof FormData;
  
  // Build headers (don't set Content-Type for FormData - browser does it)
  const requestHeaders = new Headers({
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string>),
  });
  
  // Add CSRF token
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(requestOptions.method || 'GET')) {
    if (this.authContext?.csrfToken) {
      requestHeaders.set('x-csrf-token', this.authContext.csrfToken);
    }
  }
  
  // Build request
  const requestInit: RequestInit = {
    ...requestOptions,
    headers: requestHeaders,
    credentials: 'include',
    body: isFormData ? body : (body ? JSON.stringify(body) : null),
  };
  
  // ... rest of request logic
}
```

**Benefits**:
- ✅ Supports both JSON and FormData
- ✅ Automatic CSRF for FormData uploads
- ✅ Consistent API (one client for everything)
- ✅ Better error handling for uploads

---

## Summary of Recommendations

### **Immediate Action Items** (3 simple fixes - 15 minutes)

1. ✅ `edit-user-modal.tsx` - Use apiClient.post() for MFA reset
2. ✅ `practices-content.tsx` - Use apiClient.put() for practice activation
3. ✅ `dashboard/page.tsx` + `login-form.tsx` - Use apiClient.get() for default dashboard

### **Medium-Term** (FormData support - 1-2 hours)

4. ⚠️ Extend apiClient to support FormData
5. ⚠️ Update gallery-manager.tsx to use apiClient
6. ⚠️ Update image-upload.tsx to use apiClient

### **Optional** (Already working, but could improve)

7. 🟢 MFA dialogs - Could use authHttpService instead of direct fetch
   - But current implementation works and is part of auth flow
   - **Recommendation**: Leave as-is

---

## Files That Are CORRECT (Using ApiClient)

These files are already using apiClient properly:

✅ `app/(default)/work/work-items-content.tsx` - Uses apiClient.delete() for bulk delete  
✅ `lib/hooks/use-work-items.ts` - All hooks use apiClient  
✅ `lib/hooks/use-work-item-attachments.ts` - Fixed today, now uses apiClient ✅  

---

## Risk Assessment

### **Current Risks**

| Issue | Risk Level | Impact | Likelihood |
|-------|-----------|--------|------------|
| MFA reset fails | 🔴 HIGH | Users can't reset MFA | Medium (if users try) |
| Practice activation fails | 🔴 HIGH | Can't activate practices | Medium (admin feature) |
| Image uploads fail | 🟡 MEDIUM | Manual CSRF might fail | Low (currently works) |
| Dashboard redirect fails | 🟢 LOW | Minor UX issue | Low |

### **After Fixes**

All risks eliminated ✅

---

## Conclusion

**Found 6-7 problematic fetch() calls** that should use apiClient.

**Quick wins** (3 files, 15 minutes):
- edit-user-modal.tsx
- practices-content.tsx  
- dashboard/page.tsx + login-form.tsx

**Medium effort** (2 files, 1-2 hours):
- gallery-manager.tsx (need FormData support)
- image-upload.tsx (need FormData support)

**Priority**: Fix the 3 quick wins first (no CSRF at all), then tackle FormData support.

