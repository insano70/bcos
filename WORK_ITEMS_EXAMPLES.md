# Work Items System - Practical Usage Examples

## Creating Custom Fields

### Example 1: Required Text Field on Creation

```typescript
// POST /api/work-item-fields
const fieldData = {
  work_item_type_id: "type-uuid",
  field_name: "patient_id",
  field_label: "Patient ID",
  field_type: "text",
  field_description: "Unique patient identifier",
  is_required_on_creation: true,  // Must be filled when creating work item
  is_required_to_complete: false,
  validation_rules: {
    minLength: 3,
    maxLength: 20,
    pattern: "^[A-Z0-9]+$"  // Alphanumeric only
  },
  display_order: 0,
  is_visible: true
};
```

### Example 2: Required Dropdown Field for Completion

```typescript
// POST /api/work-item-fields
const fieldData = {
  work_item_type_id: "type-uuid",
  field_name: "severity",
  field_label: "Severity Level",
  field_type: "dropdown",
  field_description: "Severity level for the issue",
  field_options: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "critical", label: "Critical" }
  ],
  is_required_on_creation: false,
  is_required_to_complete: true,  // Must be filled before marking complete
  display_order: 1,
  is_visible: true
};
```

### Example 3: Optional Currency Field with Validation

```typescript
// POST /api/work-item-fields
const fieldData = {
  work_item_type_id: "type-uuid",
  field_name: "estimated_cost",
  field_label: "Estimated Cost",
  field_type: "currency",
  field_description: "Estimated cost in USD",
  is_required_on_creation: false,
  is_required_to_complete: false,
  validation_rules: {
    min: 0,
    max: 999999.99
  },
  display_order: 2,
  is_visible: true
};
```

### Example 4: Multi-Select Field

```typescript
// POST /api/work-item-fields
const fieldData = {
  work_item_type_id: "type-uuid",
  field_name: "affected_systems",
  field_label: "Affected Systems",
  field_type: "multi_select",
  field_description: "Which systems are affected",
  field_options: [
    { value: "billing", label: "Billing System" },
    { value: "patient_portal", label: "Patient Portal" },
    { value: "ehr", label: "Electronic Health Records" },
    { value: "scheduling", label: "Scheduling" },
    { value: "reports", label: "Reporting Engine" }
  ],
  is_required_on_creation: false,
  is_required_to_complete: false,
  display_order: 3,
  is_visible: true
};
```

---

## Creating Work Items with Custom Fields

### Example 1: Basic Work Item with Required Fields

```typescript
// POST /api/work-items
const workItemData = {
  work_item_type_id: "type-uuid",
  organization_id: "org-uuid",
  subject: "Fix patient billing issue",
  description: "Patient was double-charged for copay",
  priority: "high",
  assigned_to: "user-uuid",
  custom_fields: {
    "field-id-1": "PAT123456",        // patient_id (required)
    "field-id-2": "John Smith"        // Other required field
  }
};

// Response includes:
{
  work_item_id: "item-uuid",
  subject: "Fix patient billing issue",
  custom_fields: {
    "field-id-1": "PAT123456",
    "field-id-2": "John Smith"
  }
}
```

### Example 2: Work Item with All Field Types

```typescript
// POST /api/work-items
const workItemData = {
  work_item_type_id: "type-uuid",
  organization_id: "org-uuid",
  subject: "Q4 Financial Review",
  custom_fields: {
    // Text field
    "field-text": "Some text content",
    
    // Number field
    "field-number": 42,
    
    // Date field (ISO format)
    "field-date": "2024-12-31",
    
    // DateTime field (ISO with timezone)
    "field-datetime": "2024-12-31T23:59:59Z",
    
    // Checkbox field
    "field-checkbox": true,
    
    // Dropdown field (single value)
    "field-dropdown": "critical",
    
    // Multi-select field (array of values)
    "field-multi": ["billing", "ehr", "scheduling"],
    
    // User picker field (user UUID)
    "field-user": "user-uuid",
    
    // Currency field
    "field-currency": 1234.56,
    
    // Percentage field (0-100)
    "field-percentage": 85.5,
    
    // Email field
    "field-email": "user@example.com",
    
    // Phone field
    "field-phone": "+1 (555) 123-4567",
    
    // URL field
    "field-url": "https://example.com/resource",
    
    // Rich text field
    "field-rich": "<p>HTML content</p>"
  }
};
```

---

## Updating Work Items and Custom Fields

### Example 1: Update Custom Field Only

```typescript
// PATCH /api/work-items/{id}
const updateData = {
  custom_fields: {
    "field-id-severity": "critical",
    "field-id-status": "resolved"
  }
};
```

### Example 2: Update Custom Fields and Status (With Completion Validation)

```typescript
// PATCH /api/work-items/{id}
const updateData = {
  status_id: "status-completed-uuid",  // Transitioning to 'completed' category
  custom_fields: {
    "field-id-severity": "medium",      // Required-to-complete field
    "field-id-resolution": "Fixed in v2.1"  // Another required field
  }
};

// If is_required_to_complete fields are missing, returns:
{
  error: "Cannot complete work item: the following required fields must be filled: \"Severity Level\", \"Resolution Notes\"",
  missingFields: [
    {
      field_id: "field-id-severity",
      field_name: "severity",
      field_label: "Severity Level",
      reason: "empty"
    },
    {
      field_id: "field-id-resolution",
      field_name: "resolution_notes",
      field_label: "Resolution Notes",
      reason: "missing"
    }
  ]
}
```

---

## File Attachments Workflow

### Step 1: Request Upload URL

```typescript
// POST /api/work-items/{id}/attachments
const uploadRequest = {
  file_name: "patient_report.pdf",
  file_size: 2048576,  // 2 MB
  file_type: "application/pdf"
};

// Response
{
  uploadUrl: "https://s3.amazonaws.com/bucket/...?signature=...",
  bucket: "bcos-private-assets"
}
```

### Step 2: Upload File Directly to S3 (Client-side)

```typescript
// JavaScript in browser
const response = await fetch(uploadUrl, {
  method: 'PUT',
  body: fileBlob,
  headers: {
    'Content-Type': 'application/pdf'
  }
});

// On success (status 200), proceed to register attachment
```

### Step 3: Register Attachment Record

```typescript
// POST /api/work-items/{id}/attachments/register (hypothetical endpoint)
// Server creates work_item_attachments record with S3 metadata
const registerData = {
  s3_key: "work-items/abc-123/attachments/patient_report_xyz.pdf",
  s3_bucket: "bcos-private-assets",
  file_name: "patient_report.pdf",
  file_size: 2048576,
  file_type: "application/pdf"
};
```

### Step 4: List Attachments

```typescript
// GET /api/work-items/{id}/attachments

// Response
{
  attachments: [
    {
      work_item_attachment_id: "attach-uuid",
      file_name: "patient_report.pdf",
      file_size: 2048576,
      file_type: "application/pdf",
      uploaded_by: "user-uuid",
      uploaded_by_name: "Dr. Smith",
      uploaded_at: "2024-10-15T10:30:00Z",
      downloadUrl: "https://s3.amazonaws.com/bucket/...?signature=..."
    }
  ]
}
```

---

## Validation Examples

### Example 1: Currency Field Validation

```typescript
// Valid
field_value: 1234.56   // OK: 2 decimal places

// Invalid
field_value: 1234.567  // ERROR: exceeds 2 decimal places
field_value: -50       // ERROR: currency cannot be negative
```

### Example 2: Percentage Field Validation

```typescript
// Valid
field_value: 0         // OK
field_value: 50.5      // OK
field_value: 100       // OK

// Invalid
field_value: 100.1     // ERROR: exceeds 100
field_value: -5        // ERROR: below 0
field_value: 50.555    // ERROR: exceeds 2 decimal places
```

### Example 3: Email Field Validation

```typescript
// Valid
field_value: "user@example.com"
field_value: "dr.smith+test@hospital.org"

// Invalid
field_value: "not-an-email"        // ERROR: invalid email format
field_value: "user@"               // ERROR: missing domain
```

### Example 4: Phone Field Validation

```typescript
// Valid
field_value: "+1 (555) 123-4567"
field_value: "555-123-4567"
field_value: "5551234567"
field_value: "+442071838750"      // International

// Invalid
field_value: "555-1234"            // ERROR: too short (< 7 chars)
field_value: "555-123-4567-ext"    // ERROR: invalid characters
```

### Example 5: URL Field Validation

```typescript
// Valid
field_value: "https://example.com"
field_value: "http://sub.domain.co.uk/path?query=value"

// Invalid
field_value: "not a url"           // ERROR: missing protocol
field_value: "example.com"         // ERROR: requires http:// or https://
```

---

## Hierarchy Examples

### Creating Hierarchical Work Items

```typescript
// Create parent work item
POST /api/work-items
{
  work_item_type_id: "epic-type",
  subject: "Improve Patient Portal",
  organization_id: "org-uuid"
}
// Response: parent_item_id = "epic-123"

// Create child work item (feature)
POST /api/work-items
{
  work_item_type_id: "feature-type",
  subject: "Add appointment scheduling",
  organization_id: "org-uuid",
  parent_work_item_id: "epic-123"  // Link to parent
}
// Response: depth = 1, path = "/epic-123/feature-456"

// Create grandchild work item (task)
POST /api/work-items
{
  work_item_type_id: "task-type",
  subject: "Design calendar component",
  organization_id: "org-uuid",
  parent_work_item_id: "feature-456"
}
// Response: depth = 2, path = "/epic-123/feature-456/task-789"
```

### Querying Hierarchies

```typescript
// Get only root items (depth = 0)
GET /api/work-items?show_hierarchy=root_only

// Get all items including hierarchy (all depths)
GET /api/work-items?show_hierarchy=all

// Get children of specific parent
GET /api/work-items?parent_work_item_id=epic-123

// Get all descendants of root
GET /api/work-items?root_work_item_id=epic-123
```

---

## Status Transition with Validation

### Example: Completing Work Item with Required Fields

```typescript
// Initial state: status = "In Progress"
// Target state: status = "Done" (status_category = "completed")

// Field configuration:
// - Severity (dropdown) - is_required_to_complete = true
// - Resolution Notes (text) - is_required_to_complete = true

// Attempt 1: Missing required fields
PATCH /api/work-items/{id}
{
  status_id: "status-done-uuid"
  // Missing custom fields
}

// Response (400 Bad Request)
{
  error: "Cannot complete work item: the following required fields must be filled: \"Severity\", \"Resolution Notes\"",
  missingFields: [
    {
      field_id: "field-severity-uuid",
      field_name: "severity",
      field_label: "Severity",
      reason: "missing"
    },
    {
      field_id: "field-resolution-uuid",
      field_name: "resolution_notes",
      field_label: "Resolution Notes",
      reason: "missing"
    }
  ]
}

// Attempt 2: Provide required fields
PATCH /api/work-items/{id}
{
  status_id: "status-done-uuid",
  custom_fields: {
    "field-severity-uuid": "medium",
    "field-resolution-uuid": "Fixed in version 2.1"
  }
}

// Response (200 OK)
{
  work_item_id: "item-uuid",
  status_id: "status-done-uuid",
  status_name: "Done",
  status_category: "completed",
  custom_fields: {
    "field-severity-uuid": "medium",
    "field-resolution-uuid": "Fixed in version 2.1"
  }
}
```

---

## Permission Model Examples

### RBAC Work Items Permissions

**Permission Format**: `work-items:action:scope`

**Actions**: read, create, update, delete, manage

**Scopes**: all, organization, own

#### Example 1: Super Admin
```typescript
// Can read all work items
permissions: ['work-items:read:all']

// Can create/update/delete any work item
permissions: ['work-items:manage:all']
```

#### Example 2: Organization Manager
```typescript
// Can read work items in their organizations
permissions: ['work-items:read:organization']

// Can manage work items in their organizations
permissions: ['work-items:manage:organization']
```

#### Example 3: Team Member
```typescript
// Can read own work items and assigned work items
permissions: ['work-items:read:own']

// Can only create/update/delete their own work items
permissions: ['work-items:create:own', 'work-items:update:own']
```

### File Attachment Permissions

```typescript
// User must have read permission on work item to:
// - List attachments
// - Download attachments
// - Request upload URL
// - Delete attachments

// Check: User has 'work-items:read:*' permission for the work item
```

---

## Batch Operations

### Fetch Multiple Work Items with Custom Fields (Efficient)

```typescript
// Single request returns all work items with custom fields
GET /api/work-items?limit=100

// Backend optimizes with:
// 1. Single query to work_items table (100 records)
// 2. Single batched query to work_item_field_values 
//    WHERE work_item_id IN (id1, id2, ..., id100)
// 3. Results mapped to custom_fields in response

// No N+1 queries!
```

---

## Performance Considerations

### 1. Slow Query Logging

Custom fields service logs queries slower than 500ms:

```typescript
// In logs (slow query detected)
{
  operation: 'get_custom_field_values',
  workItemCount: 500,
  fieldValueCount: 1200,
  queryDuration: 850,  // ms
  component: 'custom_fields_service'
}
```

### 2. Indexes for Performance

**Work Items**:
- `idx_work_items_type`: Query by type
- `idx_work_items_org`: Filter by organization
- `idx_work_items_parent`: Hierarchy queries
- `idx_work_items_status`: Status filtering

**Custom Fields**:
- `idx_work_item_fields_type`: By type
- `idx_work_item_fields_type_order`: Ordering display
- `idx_work_item_fields_type_visible`: Visibility filtering

**Attachments**:
- `idx_attachments_work_item`: List attachments
- `idx_attachments_uploaded_at`: Sort by date

---

## Error Handling Examples

### Example 1: Invalid Field Type Validation

```typescript
// Client sends invalid field value type
PATCH /api/work-items/{id}
{
  custom_fields: {
    "field-percentage-id": 150  // Percentage must be 0-100
  }
}

// Response (400 Bad Request)
{
  error: "Invalid value for field percentage: Percentage must not exceed 100"
}
```

### Example 2: Field Type Mismatch

```typescript
// Create field with invalid options for type
POST /api/work-item-fields
{
  field_type: "number",  // Number type
  field_options: [       // Invalid: options only for dropdown/multi_select
    { value: "1", label: "One" }
  ]
}

// Response (400 Bad Request) or silently ignored
```

### Example 3: Required Field Missing on Creation

```typescript
// Create work item without required field
POST /api/work-items
{
  work_item_type_id: "type-uuid",
  subject: "New task"
  // Missing required field: patient_id
}

// Response (400 Bad Request)
{
  error: "Required field missing: patient_id"
}
```

