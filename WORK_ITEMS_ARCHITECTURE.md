# Work Items System Architecture - Comprehensive Overview

## 1. DATABASE SCHEMA STRUCTURE

### Core Work Items Tables

#### `work_items` (Main table)
- **Primary Key**: `work_item_id` (UUID)
- **Core Fields**:
  - `work_item_type_id`: References work item type (FK)
  - `organization_id`: References organization (FK)
  - `subject`: Main title/subject (required)
  - `description`: Rich text description (optional)
  - `status_id`: Current status (FK to work_item_statuses)
  - `priority`: Enum (critical, high, medium, low), defaults to 'medium'
  - `assigned_to`: User ID (optional)
  - `due_date`: Timestamp (optional)
  - `started_at`, `completed_at`: Lifecycle timestamps
  
- **Hierarchy Fields** (Phase 2):
  - `parent_work_item_id`: Parent item (nullable, self-referencing)
  - `root_work_item_id`: Root of tree (for quick filtering)
  - `depth`: Level in tree (0 = root)
  - `path`: Materialized path format '/root_id/parent_id/this_id'
  
- **Metadata**:
  - `created_by`: User who created (FK)
  - `created_at`, `updated_at`, `deleted_at` (soft delete)

- **Key Indexes**:
  - `idx_work_items_type`, `idx_work_items_org`, `idx_work_items_status`
  - `idx_work_items_assigned`, `idx_work_items_priority`
  - `idx_work_items_parent`, `idx_work_items_root`, `idx_work_items_path`

#### `work_item_types`
- **Purpose**: Defines configurable work item types (Task, Bug, Feature, Epic, etc.)
- **Scoping**: Can be global (`organization_id = NULL`) or org-specific
- **Fields**: `name`, `description`, `icon`, `color`, `is_active`
- **Relations**: Linked to statuses, fields, and type relationships

#### `work_item_statuses`
- **Purpose**: Configurable statuses per work item type
- **Key Fields**:
  - `status_name`: Display name (e.g., "To Do", "In Progress", "Done")
  - `status_category`: Enum (backlog, in_progress, completed, cancelled)
  - `is_initial`, `is_final`: Workflow markers
  - `display_order`: UI ordering
  - `color`: UI visualization
- **Critical for**: Status transitions validation, completion field checking

#### `work_item_status_transitions` (Phase 4, 7)
- **Purpose**: Define allowed workflow transitions per type
- **Fields**:
  - `work_item_type_id`, `from_status_id`, `to_status_id`
  - `is_allowed`: Boolean gate for transitions
  - `validation_config`: JSONB - required fields validation
  - `action_config`: JSONB - automated actions (notifications, field updates)
- **Unique Constraint**: One transition rule per (type, from, to) combination

### Custom Fields Tables

#### `work_item_fields` (Field Definitions)
Location: `/Users/pstewart/bcos/lib/db/work-item-fields-schema.ts`

- **Primary Key**: `work_item_field_id` (UUID)
- **Configuration**:
  - `work_item_type_id`: Which type this field belongs to (FK)
  - `field_name`: System identifier (slug format: lowercase + underscores)
  - `field_label`: User-friendly display name
  - `field_type`: See Field Types section below
  - `field_description`: Help text
  - `default_value`: Initial value when not provided

- **Options & Rules**:
  - `field_options`: JSONB array of `{ value, label }` for dropdown/multi_select
  - `field_config`: JSONB - conditional visibility rules
  - `validation_rules`: JSONB - min/max/pattern constraints
  
- **Requirement Patterns** (Two-tier system):
  - `is_required_on_creation`: Must be filled when creating work item
  - `is_required_to_complete`: Must be filled before transitioning to 'completed' status
  
- **Display**:
  - `display_order`: UI field ordering (sorted by this)
  - `is_visible`: Hide/show in UI
  
- **Metadata**:
  - `created_by`: User ID (FK)
  - `created_at`, `updated_at`, `deleted_at` (soft delete)

- **Key Indexes**:
  - `idx_work_item_fields_type`: Query by type
  - `idx_work_item_fields_type_order`: Display ordering
  - `idx_work_item_fields_type_visible`: Visibility filtering

#### `work_item_field_values` (Field Values)
- **Purpose**: Stores actual custom field values for each work item
- **Structure**:
  - `work_item_field_value_id`: UUID primary key
  - `work_item_id`: Which item (FK)
  - `work_item_field_id`: Which field definition (FK)
  - `field_value`: JSONB - flexible storage (supports all types)
  - `created_at`, `updated_at`
  
- **N+1 Prevention**: Batched fetching via `getCustomFieldValues(workItemIds[])`
- **Performance**: Organized as Map<work_item_id, Map<field_id, value>>

### Related Tables

#### `work_item_comments` (Phase 2)
- Thread-able comments with reply support
- `parent_comment_id` for nested discussions
- Soft delete support

#### `work_item_activity` (Phase 2)
- Audit trail of all changes
- Fields: `activity_type`, `field_name`, `old_value`, `new_value`, `description`
- Indexed by type, work_item_id, created_by

#### `work_item_attachments` (Phase 2, File Management)
Location: `/Users/pstewart/bcos/lib/db/work-items-schema.ts` (lines 299-337)

- **S3 Integration**:
  - `s3_key`: Object key in S3 (e.g., 'work-items/abc-123/attachments/document_xyz.pdf')
  - `s3_bucket`: Bucket name (e.g., 'bcos-private-assets')
  
- **Metadata**:
  - `file_name`: Original filename
  - `file_size`: Size in bytes
  - `file_type`: MIME type
  - `uploaded_by`: User ID (FK)
  - `uploaded_at`: Timestamp
  - `deleted_at`: Soft delete
  
- **Security**: Enforces RBAC - user must have read permission on work item to access
- **URL Generation**: 
  - Uses `generateUploadUrl()` for presigned upload URLs (1 hour expiration)
  - Uses `generateDownloadUrl()` for presigned download URLs (15 minutes)

#### `work_item_type_relationships` (Phase 6)
- **Purpose**: Define parent-child type relationships with auto-creation
- **Features**:
  - `min_count`, `max_count`: Constraints on child count
  - `is_required`: Boolean requirement marker
  - `auto_create`: Auto-create child items when parent created
  - `auto_create_config`: JSONB with subject template and field inheritance
  
- **Template Variables**: `{parent.field_name}` for interpolation

#### `work_item_watchers` (Phase 7)
- **Watch Types**: manual, auto_creator, auto_assignee, auto_commenter
- **Notification Preferences**:
  - `notify_status_changes`, `notify_comments`, `notify_assignments`, `notify_due_date`
- **Unique Constraint**: One watcher entry per (work_item, user)

---

## 2. FIELD TYPES & IMPLEMENTATION

### Supported Field Types

Located in: `/Users/pstewart/bcos/lib/types/work-item-fields.ts` (lines 9-23)

```typescript
type FieldType =
  | 'text'           // Plain text, max 5000 chars
  | 'number'         // Numeric value
  | 'date'           // Date only (YYYY-MM-DD)
  | 'datetime'       // Date + time with timezone
  | 'dropdown'       // Single select from options
  | 'checkbox'       // Boolean checkbox
  | 'user_picker'    // Select user by UUID
  | 'multi_select'   // Multiple select from options
  | 'rich_text'      // HTML content, max 50000 chars
  | 'url'            // URL validation, max 2000 chars
  | 'email'          // Email format validation
  | 'phone'          // Phone number (international format)
  | 'currency'       // Number with 2 decimal places max
  | 'percentage'     // 0-100 with 2 decimal places max
```

### Field Type Specifications

#### Basic Text Types
- **text**: String, max 5000 characters
- **rich_text**: HTML content, max 50000 characters
- **url**: Valid URL with protocol, max 2000 chars
- **email**: Valid email format, max 255 chars
- **phone**: International format (digits, spaces, +, -, parentheses)
  - Min 7, max 20 characters

#### Numeric Types
- **number**: JavaScript number (finite, not too large)
- **currency**: Number with 0-2 decimal places validation
- **percentage**: 0-100 range with 0-2 decimal places

#### Date/Time Types
- **date**: ISO date string (YYYY-MM-DD format)
- **datetime**: ISO datetime with timezone

#### Selection Types
- **dropdown**: Single selection from `field_options` array
- **multi_select**: Array of selected values, min 1, max 100 options
- **checkbox**: Boolean value (true/false)
- **user_picker**: UUID of selected user

### Field Validators

Location: `/Users/pstewart/bcos/lib/validations/field-value-validators.ts`

Each field type has a Zod schema validator:
- Factory function: `getFieldValueValidator(fieldType: string): z.ZodType`
- Validation helper: `validateFieldValue(fieldType, value): boolean`
- Error retrieval: `getFieldValueValidationError(fieldType, value): string | null`

---

## 3. REQUIREDNESS PATTERNS (Create vs Complete)

### Two-Tier Requirement System

#### `is_required_on_creation`
- Field MUST be filled when creating a new work item
- Validated during POST to `/api/work-items`
- Enforced in: `RBACWorkItemFieldValuesService.setFieldValues()`
- Prevents work item creation if required fields are missing

#### `is_required_to_complete`
- Field MUST be filled before transitioning to 'completed' status category
- Enforced during status transition to any status with `status_category = 'completed'`
- Validation function: `validateForCompletion(workItemId, workItemTypeId)`
- Returns: `FieldCompletionValidationResult` with list of missing fields

### Completion Validation Logic

Location: `/Users/pstewart/bcos/lib/services/work-items/field-completion-validator.ts`

```typescript
async function validateForCompletion(
  workItemId: string,
  workItemTypeId: string
): Promise<FieldCompletionValidationResult> {
  // 1. Get all fields marked is_required_to_complete for this type
  // 2. Get all field values for this work item
  // 3. Check each required field for empty/null status
  // 4. Return validation result with missing field details
}

interface FieldCompletionError {
  field_id: string;
  field_name: string;
  field_label: string;
  reason: 'missing' | 'empty';  // Distinguishes not provided vs empty string
}
```

### Empty Value Detection

Different logic per field type (in `isValueEmpty(value, fieldType)`):
- **text, dropdown, user_picker**: Empty string is empty
- **date, datetime**: Null/undefined or empty string is empty
- **number**: null, undefined, or '' is empty
- **checkbox**: Never empty - false is a valid value
- **Default**: null or undefined is empty

### UI Display

Component: `/Users/pstewart/bcos/components/work-item-field-config.tsx`

Shows requirement status in a badge:
- Red badge: "On Creation" (`is_required_on_creation`)
- Orange badge: "To Complete" (`is_required_to_complete`)
- Gray badge: "Optional" (neither flag set)

---

## 4. CUSTOM FIELDS ARCHITECTURE

### Data Flow

#### 1. Field Definition Creation
```
POST /api/work-item-fields
  → RBACWorkItemFieldsService.createWorkItemField()
  → Insert into work_item_fields table
  → Returns WorkItemField object with all metadata
```

#### 2. Field Value Setting (On Work Item Create/Update)
```
POST/PATCH /api/work-items
  → custom_fields: { fieldId: value, fieldId: value, ... }
  → RBACWorkItemFieldValuesService.setFieldValues()
  → Validates field IDs against work_item_type_id
  → Validates each value using field type validator
  → Checks is_required_on_creation for all required fields
  → Upserts into work_item_field_values table
```

#### 3. Field Value Retrieval
```
GET /api/work-items or GET /api/work-items/{id}
  → WorkItemCustomFieldsService.getCustomFieldValues(workItemIds[])
  → Single batched query: SELECT * FROM work_item_field_values WHERE work_item_id IN (...)
  → Returns: Map<work_item_id, Record<field_id, value>>
  → Maps values to custom_fields in response
```

### Service Layer

#### `RBACWorkItemFieldsService`
Location: `/Users/pstewart/bcos/lib/services/rbac-work-item-fields-service.ts`

**Methods**:
- `getWorkItemFields(options)`: List fields for type with RBAC
- `getWorkItemFieldById(fieldId)`: Get single field
- `createWorkItemField(data)`: Create new field definition
- `updateWorkItemField(fieldId, data)`: Update existing field
- `deleteWorkItemField(fieldId)`: Soft delete field

**Permission Checks**: Requires `work-items:read:*` for reads, `work-items:manage:*` for mutations

#### `RBACWorkItemFieldValuesService`
Location: `/Users/pstewart/bcos/lib/services/rbac-work-item-field-values-service.ts`

**Methods**:
- `getFieldValues(workItemId)`: Get all values for a work item
- `setFieldValues(workItemId, workItemTypeId, fieldValues)`: Create/update all values
  - Validates field IDs belong to type
  - Validates each value against field type
  - Checks required fields
  - Performs upserts (create or update)

**Validation**: Uses `getFieldValueValidator(fieldType)` from field-value-validators

#### `WorkItemCustomFieldsService`
Location: `/Users/pstewart/bcos/lib/services/work-items/custom-fields-service.ts`

**Purpose**: Internal service for efficient batch field value retrieval

**Key Feature**: N+1 query prevention
- `getCustomFieldValues(workItemIds: string[])`
- Single query for all work items
- Returns Map for O(1) lookup
- Logged for slow query detection (>500ms = slow)

### Validation & Storage

#### Schema Definition
Location: `/Users/pstewart/bcos/lib/validations/work-item-fields.ts`

- **Field Configuration**:
  ```typescript
  export const workItemFieldCreateSchema = z.object({
    work_item_type_id: z.string().uuid(),
    field_name: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/),
    field_label: z.string().min(1).max(255),
    field_type: fieldTypeSchema,
    field_options: z.array(fieldOptionSchema).optional(),
    validation_rules: validationRulesSchema.optional(),
    is_required_on_creation: z.boolean().optional().default(false),
    is_required_to_complete: z.boolean().optional().default(false),
    // ... more fields
  });
  ```

#### Validation Rules Structure
```typescript
interface ValidationRules {
  min?: number;           // For numbers
  max?: number;           // For numbers
  minLength?: number;     // For strings
  maxLength?: number;     // For strings
  pattern?: string;       // Regex pattern for text fields
}
```

#### Field Options Structure (for dropdown/multi_select)
```typescript
interface FieldOption {
  value: string;          // Option identifier
  label: string;          // Display text
}
```

---

## 5. FILE/ATTACHMENT HANDLING

### Architecture

#### Database Table: `work_item_attachments`

**Schema**:
```typescript
work_item_attachments = pgTable('work_item_attachments', {
  work_item_attachment_id: uuid,        // PK
  work_item_id: uuid,                   // FK (onDelete: cascade)
  file_name: text,                      // Original filename
  file_size: integer,                   // Bytes
  file_type: text,                      // MIME type
  s3_key: text,                         // S3 object key
  s3_bucket: text,                      // S3 bucket name
  uploaded_by: uuid,                    // User FK
  uploaded_at: timestamp,               // Upload time
  deleted_at: timestamp,                // Soft delete
})
```

#### Two-Step Upload Process

1. **Generate Upload URL** (Server-side):
   - User requests presigned upload URL
   - Server calls `generateUploadUrl(s3Key, options)`
   - Returns signed URL valid for 1 hour
   - Options: contentType, fileSize limit, metadata

2. **Direct Upload** (Client-side):
   - Browser uploads file directly to S3 using presigned URL
   - Bypasses server (no data upload through app)
   - More efficient and scalable

3. **Register Attachment** (Server-side):
   - After successful S3 upload, client calls API to register
   - Server creates `work_item_attachments` record
   - Records: file metadata, S3 location, uploader info

#### Download Process

- Server generates presigned download URL (15 min expiration)
- URL returned in GET response with download link
- Browser uses link to fetch from S3

### S3 Integration

#### Key Generation
Location: `/Users/pstewart/bcos/lib/s3/private-assets/`

```typescript
// Generate consistent S3 key
const s3Key = generateS3Key(
  ['work-items', workItemId, 'attachments'],  // Path segments
  originalFileName                             // Filename
);
// Result: 'work-items/abc-123/attachments/document_k3j2h4g5.pdf'

// Options
generateS3Key(path, name, {
  addUniqueId: true,      // Add collision-resistant nanoid (default)
  addTimestamp: false,    // Add Unix timestamp for versioning
  preserveName: false,    // Lowercase sanitization
})
```

#### Configuration
Environment variables required:
```bash
S3_PRIVATE_REGION=us-east-1
S3_PRIVATE_ACCESS_KEY_ID=AKIA...
S3_PRIVATE_SECRET_ACCESS_KEY=secret...
S3_PRIVATE_BUCKET=bcos-private-assets
S3_PRIVATE_UPLOAD_EXPIRATION=3600    # 1 hour default
S3_PRIVATE_DOWNLOAD_EXPIRATION=900   # 15 min default
```

#### File Constraints
Location: `/Users/pstewart/bcos/lib/s3/private-assets/constants.ts`

**File Size Limits**:
- Image: 50 MB
- Document: 50 MB
- Archive: 100 MB
- Default: 100 MB

**Allowed MIME Types** (Whitelist):
- Images: image/jpeg, image/png, image/gif, image/webp, image/svg+xml
- Documents: application/pdf, application/msword, text/plain, text/csv
- Spreadsheets: application/vnd.ms-excel, application/vnd.openxmlformats-officedocument
- Blocked: application/x-msdownload (executables), script types, etc.

#### Automatic Thumbnail Generation

For image types:
- Automatic 300x300px thumbnail generation
- JPEG format, 80% quality
- Stored at: `{key}/thumbnails/{filename}_thumb.jpg`

### Service Layer

#### `RBACWorkItemAttachmentsService`
Location: `/Users/pstewart/bcos/lib/services/rbac-work-item-attachments-service.ts`

**Methods**:
- `getAttachments(options)`: List attachments for work item
  - Auto-validates user can read the work item
  - Soft delete filtering
  - Ordered by upload date (newest first)
  
- `generateUploadUrl(workItemId, fileData)`: Generate presigned URL
  - Validates work item exists
  - Validates MIME type is allowed
  - Validates file size within limits
  - Returns: `{ uploadUrl, bucket }`
  
- `registerAttachment(workItemId, s3Data)`: Create attachment record
  - Called after S3 upload succeeds
  - Stores metadata in database
  
- `generateDownloadUrl(attachmentId)`: Generate download URL
  - Validates user can access work item
  - Returns: `{ downloadUrl, fileName }`
  
- `deleteAttachment(attachmentId)`: Soft delete
  - Validates user can access work item

**Permission Model**: User must have read access to work item to see/download attachments

---

## 6. CUSTOM FIELDS UI COMPONENTS

### Dynamic Field Rendering

#### `DynamicFieldRenderer`
Location: `/Users/pstewart/bcos/components/dynamic-field-renderer.tsx`

**Props**:
- `fields`: Array of `WorkItemField` definitions
- `values`: Record of `{ fieldId: value }`
- `onChange`: Callback on value change
- `errors`: Validation error messages by field ID

**Features**:
- Auto-sorts by `display_order`
- Filters hidden fields (`is_visible = false`)
- Renders appropriate input component per type
- Shows required marker for `is_required_on_creation`
- Displays field description as help text
- Shows validation errors

**Rendered Input Types**:
- **text**: Standard text input with max validation
- **number**: Number input with min/max
- **date**: Date picker component
- **datetime**: DateTime picker component
- **dropdown**: Select with option list
- **checkbox**: Toggle checkbox
- **user_picker**: User selection component
- **multi_select**: Multiple option selector

#### `FieldRenderer`
Location: `/Users/pstewart/bcos/components/work-items/field-renderer.tsx`

**Purpose**: Display-only rendering of field values

#### `WorkItemFieldConfig`
Location: `/Users/pstewart/bcos/components/work-item-field-config.tsx`

**Purpose**: Field management UI for admins/managers

**Features**:
- DataTable showing all fields for a type
- Columns: label, name, type, requirements, visibility, order
- Inline actions: Edit, Delete
- Delete confirmation modal
- Add new field button opens modal

**Modals**:
- `AddWorkItemFieldModal`: Create new field with all options
- `EditWorkItemFieldModal`: Modify existing field

---

## 7. API ROUTES

### Work Items Endpoints

#### List Work Items
```
GET /api/work-items
  Query params: work_item_type_id, organization_id, status_id, status_category,
                priority, assigned_to, created_by, search, limit, offset,
                sortBy, sortOrder, show_hierarchy
  Response: Paginated list with custom_fields included
```

#### Create Work Item
```
POST /api/work-items
  Body: {
    work_item_type_id: uuid,
    organization_id: uuid,
    subject: string,
    description?: string,
    priority?: 'critical'|'high'|'medium'|'low',
    assigned_to?: uuid,
    due_date?: datetime,
    parent_work_item_id?: uuid,
    custom_fields?: { fieldId: value, ... }
  }
  Validates: is_required_on_creation fields present
  Response: Created work item with custom_fields
```

#### Get Work Item
```
GET /api/work-items/{id}
  Response: Single work item with custom_fields
```

#### Update Work Item
```
PATCH /api/work-items/{id}
  Body: {
    subject?: string,
    description?: string,
    status_id?: uuid,
    priority?: string,
    assigned_to?: uuid,
    due_date?: datetime,
    custom_fields?: { fieldId: value, ... }
  }
  Validates: is_required_to_complete fields if transitioning to 'completed'
  Response: Updated work item
```

### Custom Field Endpoints

#### List Fields for Type
```
GET /api/work-item-fields
  Query: work_item_type_id, is_visible, limit, offset
  Response: Array of WorkItemField definitions
```

#### Create Field
```
POST /api/work-item-fields
  Body: WorkItemFieldCreate (see schema)
  Response: Created field definition
```

#### Get Field
```
GET /api/work-item-fields/{id}
  Response: Single field definition
```

#### Update Field
```
PATCH /api/work-item-fields/{id}
  Body: WorkItemFieldUpdate (partial schema)
  Response: Updated field definition
```

#### Delete Field
```
DELETE /api/work-item-fields/{id}
  Response: Soft delete (sets deleted_at)
```

### Attachment Endpoints

#### List Attachments
```
GET /api/work-items/{id}/attachments
  Query: limit, offset
  Response: Array with download URLs included
```

#### Generate Upload URL
```
POST /api/work-items/{id}/attachments
  Body: {
    file_name: string,
    file_size: number,
    file_type: string  // MIME type
  }
  Response: { uploadUrl: string, bucket: string }
```

#### Get Attachment Download URL
```
GET /api/work-items/{id}/attachments/{attachmentId}
  Response: { downloadUrl: string, fileName: string }
```

#### Delete Attachment
```
DELETE /api/work-items/{id}/attachments/{attachmentId}
  Response: Success
```

---

## 8. TYPE DEFINITIONS

### Core Types

**Location**: `/Users/pstewart/bcos/lib/types/work-item-fields.ts`

```typescript
interface WorkItemField {
  work_item_field_id: string;
  work_item_type_id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  field_description: string | null;
  field_options: FieldOption[] | null;
  field_config: FieldConfig | null;
  is_required_on_creation: boolean;
  is_required_to_complete: boolean;
  validation_rules: ValidationRules | null;
  default_value: string | null;
  display_order: number;
  is_visible: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface WorkItemFieldValue {
  work_item_field_value_id: string;
  work_item_id: string;
  work_item_field_id: string;
  field_value: unknown;  // Flexible storage
  created_at: Date;
  updated_at: Date;
}

interface FieldConfig {
  conditional_visibility?: ConditionalVisibilityRule[];
}

interface ConditionalVisibilityRule {
  field_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' 
          | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value?: unknown;
}
```

**Location**: `/Users/pstewart/bcos/lib/types/work-items.ts`

```typescript
interface WorkItemWithDetails {
  work_item_id: string;
  work_item_type_id: string;
  work_item_type_name: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  description: string | null;
  status_id: string;
  status_name: string;
  status_category: string;
  priority: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  parent_work_item_id: string | null;
  root_work_item_id: string | null;
  depth: number;
  path: string | null;
  created_by: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
  custom_fields?: Record<string, unknown>;  // Custom field values
  [key: string]: unknown;  // For template interpolation
}
```

---

## 9. KEY FILES REFERENCE

### Database Schema
- **Work Items**: `/Users/pstewart/bcos/lib/db/work-items-schema.ts` (522 lines)
- **Custom Fields**: `/Users/pstewart/bcos/lib/db/work-item-fields-schema.ts`
- **Schema Export**: `/Users/pstewart/bcos/lib/db/schema.ts` (modular re-exports)

### Type Definitions
- **Work Items**: `/Users/pstewart/bcos/lib/types/work-items.ts`
- **Custom Fields**: `/Users/pstewart/bcos/lib/types/work-item-fields.ts`

### Services
- **Work Items Main**: `/Users/pstewart/bcos/lib/services/work-items/work-items-service.ts`
- **Custom Fields**: `/Users/pstewart/bcos/lib/services/rbac-work-item-fields-service.ts`
- **Field Values**: `/Users/pstewart/bcos/lib/services/rbac-work-item-field-values-service.ts`
- **Attachments**: `/Users/pstewart/bcos/lib/services/rbac-work-item-attachments-service.ts`
- **Custom Fields Batch**: `/Users/pstewart/bcos/lib/services/work-items/custom-fields-service.ts`
- **Field Completion**: `/Users/pstewart/bcos/lib/services/work-items/field-completion-validator.ts`
- **Base Service**: `/Users/pstewart/bcos/lib/services/work-items/base-service.ts`

### Validation
- **Work Items**: `/Users/pstewart/bcos/lib/validations/work-items.ts`
- **Custom Fields**: `/Users/pstewart/bcos/lib/validations/work-item-fields.ts`
- **Field Value Validators**: `/Users/pstewart/bcos/lib/validations/field-value-validators.ts`

### UI Components
- **Dynamic Field Renderer**: `/Users/pstewart/bcos/components/dynamic-field-renderer.tsx`
- **Field Config**: `/Users/pstewart/bcos/components/work-item-field-config.tsx`
- **Add Field Modal**: `/Users/pstewart/bcos/components/add-work-item-field-modal.tsx`
- **Edit Field Modal**: `/Users/pstewart/bcos/components/edit-work-item-field-modal.tsx`
- **Manage Fields Modal**: `/Users/pstewart/bcos/components/manage-work-item-fields-modal.tsx`

### API Routes
- **Work Items**: `/Users/pstewart/bcos/app/api/work-items/` (list, CRUD, hierarchy, comments, attachments)
- **Custom Fields**: `/Users/pstewart/bcos/app/api/work-item-fields/[id]/route.ts`

---

## 10. CURRENT IMPLEMENTATION STATUS

### Completed Features
- Core work item CRUD with full RBAC
- 14 field types with validation
- Two-tier requirement system (create vs complete)
- Soft delete support across all tables
- Hierarchical work items (parent-child, depth, materialized path)
- Comments with threading
- Activity audit trail
- File attachments with S3 presigned URLs
- Work item watchers with notification preferences
- Status transitions with workflow validation
- Type relationships with auto-creation
- Comprehensive field validation and sanitization

### Architecture Highlights
- **RBAC-First**: All services extend `BaseRBACService` with permission checking
- **N+1 Prevention**: Batch field value retrieval for performance
- **Type Safety**: Full TypeScript strict mode, no `any` types
- **Validation**: Multi-layer validation (Zod schemas + field type validators)
- **Soft Deletes**: All tables support soft delete with `deleted_at`
- **Modular Database**: Schema organized by domain with barrel exports
- **Factory Pattern**: All services created via factory functions
- **Error Handling**: Comprehensive logging and error responses

