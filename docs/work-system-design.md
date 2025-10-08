# Work System - Complete Design Document

## Table of Contents
1. [Overview](#overview)
2. [Core Concept & Philosophy](#core-concept--philosophy)
3. [Key Features](#key-features)
4. [Database Schema](#database-schema)
5. [Workflow Examples](#workflow-examples)
6. [Permission Structure](#permission-structure)
7. [API Considerations](#api-considerations)
8. [UI Components](#ui-components)
9. [Phased Implementation Plan](#phased-implementation-plan)

---

## Overview

The Work system is a flexible, hierarchical task management platform built for Next.js applications. It allows each organization to define their own work item types with custom fields while maintaining a consistent underlying structure. The system emphasizes configurability, hierarchy, and granular permissions.

**Key Characteristics:**
- Hierarchical work items (unlimited nesting)
- Configurable work item types per organization
- Custom fields with multiple data types
- Status workflows with automation
- File attachments with S3 integration
- Granular RBAC permissions
- Comprehensive activity tracking

---

## Core Concept & Philosophy

### Design Principles

1. **Configurability First**: Each organization can tailor the system to their needs without code changes
2. **Hierarchy as a Core Feature**: Work items can have sub-items, creating natural task breakdown
3. **Type Safety with Flexibility**: Custom fields are strongly typed but flexible in definition
4. **Auditability**: Complete history of all changes and actions
5. **Permission Aware**: All operations respect existing RBAC system

### Example Use Cases

**Medical Document Request:**
- Parent: Document Request work item
- Children: Patient Record sub-item, Document Upload sub-items
- Custom fields: patient_id, date_of_birth, document_type
- Files stored in S3 with organized structure

**Customer Support Ticket:**
- Parent: Support Ticket
- Children: Follow-up Tasks, Bug Reports
- Custom fields: customer_id, issue_category, severity
- Status workflow with SLA tracking

---

## Key Features

### 2.1 Work Item Management
- Create, read, update, delete work items
- Hierarchical structure (parent-child relationships with unlimited nesting)
- Assignment to users/teams
- Status tracking with configurable workflows
- Due dates and priority levels
- Comments and activity history
- File attachments with S3 integration

### 2.2 Work Item Type Configuration
- Organization-level type definitions (e.g., "Customer Support Ticket", "Medical Document Request")
- Standard fields for all types (subject, assigned_to, status, due_date, priority, created_by, etc.)
- Custom field definitions per type with various field types:
  - text, number, date, datetime
  - dropdown, multi_select
  - user_picker, checkbox
  - file_upload, url, email, phone
  - rich_text, currency, percentage
- Field validation rules and constraints
- Required vs optional field configuration

### 2.3 Sub-Work Item Configuration
- Define which sub-work item types are allowed for each parent type
- Configure whether sub-items are required or optional
- Set up automatic sub-item creation templates
- Define inheritance rules (which fields cascade from parent to child)

### 2.4 Workflow & Status Management
- Configurable status workflows per work item type
- Status transitions and rules (e.g., "In Progress" can only move to "Completed" or "Blocked")
- Automated actions on status changes (notifications, field updates, sub-item creation)
- SLA tracking based on status transitions

### 2.5 Permissions & Visibility
- Granular RBAC permissions (work_item:read:own, work_item:read:organization, work_item:read:all)
- Action-level permissions (create, read, update, delete, assign, close)
- Field-level visibility controls
- Organization/team-based access controls

### 2.6 Search & Filtering
- Advanced search across standard and custom fields
- Saved filters/views
- Bulk operations on filtered results
- Full-text search capabilities

### 2.7 Notifications & Automation
- Configurable notification triggers (assignment, status change, comments, due dates)
- Automated workflows (escalations, reminders, field auto-population)
- Watch/unwatch functionality for updates

---

## Database Schema

### Core Tables (11 Total)

#### `work_item_types`
Defines the types of work items available to each organization.

```sql
CREATE TABLE work_item_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  color VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_work_item_types_org ON work_item_types(organization_id);
```

**Purpose:** Each organization can have multiple types (e.g., "Support Ticket", "Document Request")

---

#### `work_item_fields`
Defines custom fields for each work item type.

```sql
CREATE TABLE work_item_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  is_required BOOLEAN DEFAULT false,
  is_system_field BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  field_config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_work_item_fields_type ON work_item_fields(work_item_type_id);
```

**Field Types:**
- text, number, date, datetime
- dropdown, multi_select
- user, checkbox, file
- url, email, phone
- rich_text, currency, percentage

**field_config structure (JSONB):**
```json
{
  "placeholder": "Enter patient ID",
  "help_text": "The unique identifier for the patient",
  "validation": {
    "min": 0,
    "max": 100,
    "regex": "^[A-Z]{2}[0-9]{6}$"
  },
  "options": [
    {"value": "option1", "label": "Option 1", "color": "#blue"},
    {"value": "option2", "label": "Option 2", "color": "#green"}
  ],
  "default_value": "option1",
  "conditional_visibility": {
    "field_id": "other-field-uuid",
    "operator": "equals",
    "value": "specific-value"
  }
}
```

---

#### `work_items`
The main work item records.

```sql
CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  parent_work_item_id UUID REFERENCES work_items(id),
  root_work_item_id UUID REFERENCES work_items(id),
  depth INTEGER DEFAULT 0,
  path VARCHAR(1000),
  subject VARCHAR(500) NOT NULL,
  description TEXT,
  status_id UUID NOT NULL REFERENCES work_item_statuses(id),
  priority VARCHAR(20) DEFAULT 'medium',
  assigned_to UUID REFERENCES users(id),
  assigned_team_id UUID REFERENCES teams(id),
  due_date TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_work_items_type ON work_items(work_item_type_id);
CREATE INDEX idx_work_items_org ON work_items(organization_id);
CREATE INDEX idx_work_items_parent ON work_items(parent_work_item_id);
CREATE INDEX idx_work_items_root ON work_items(root_work_item_id);
CREATE INDEX idx_work_items_status ON work_items(status_id);
CREATE INDEX idx_work_items_assigned ON work_items(assigned_to);
CREATE INDEX idx_work_items_due_date ON work_items(due_date);
CREATE INDEX idx_work_items_created_at ON work_items(created_at);
CREATE INDEX idx_work_items_path ON work_items(path);
```

**Priority values:** low, medium, high, critical

**Hierarchy fields:**
- `parent_work_item_id`: Immediate parent
- `root_work_item_id`: Top-level ancestor
- `depth`: Level in hierarchy (0 = root)
- `path`: Materialized path for efficient queries (e.g., '/uuid1/uuid2/uuid3/')

**Path Structure:**
The path field stores the full hierarchy using UUID separators:
- Root item: `/uuid/`
- Child item: `/parent-uuid/child-uuid/`
- Grandchild: `/root-uuid/parent-uuid/child-uuid/`

This allows efficient queries:
- Find all descendants: `WHERE path LIKE '/parent-uuid/%'`
- Find all ancestors: Parse the path and query each UUID
- Find children only: `WHERE parent_work_item_id = 'uuid'`

---

#### `work_item_field_values`
Stores actual values for custom fields.

```sql
CREATE TABLE work_item_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES work_item_fields(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number DECIMAL,
  value_date DATE,
  value_datetime TIMESTAMP,
  value_boolean BOOLEAN,
  value_reference_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_field_values_work_item ON work_item_field_values(work_item_id);
CREATE INDEX idx_field_values_field ON work_item_field_values(field_id);
CREATE INDEX idx_field_values_number ON work_item_field_values(value_number);
CREATE INDEX idx_field_values_date ON work_item_field_values(value_date);
CREATE INDEX idx_field_values_datetime ON work_item_field_values(value_datetime);
CREATE INDEX idx_field_values_ref ON work_item_field_values(value_reference_id);
CREATE UNIQUE INDEX idx_field_values_unique ON work_item_field_values(work_item_id, field_id, value_reference_id);
```

**Value storage strategy:**
- Use appropriate `value_*` column based on `field_type`
- `value_reference_id` for user pickers and dropdown options
- Multiple rows for multi-select fields (same work_item_id + field_id, different value_reference_id)

---

#### `work_item_type_relationships`
Defines which child types are allowed for each parent type.

```sql
CREATE TABLE work_item_type_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type_id UUID NOT NULL REFERENCES work_item_types(id) ON DELETE CASCADE,
  child_type_id UUID NOT NULL REFERENCES work_item_types(id) ON DELETE CASCADE,
  relationship_name VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT false,
  min_count INTEGER,
  max_count INTEGER,
  auto_create BOOLEAN DEFAULT false,
  auto_create_config JSONB,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_type_rel_parent ON work_item_type_relationships(parent_type_id);
CREATE INDEX idx_type_rel_child ON work_item_type_relationships(child_type_id);
```

**auto_create_config structure (JSONB):**
```json
{
  "subject_template": "Patient Record for {parent.patient_name}",
  "field_values": {
    "field_name": "value_or_reference_to_parent_field"
  },
  "inherit_fields": ["patient_id", "due_date"]
}
```

**Example:**
```json
{
  "parent_type": "Document Request",
  "child_type": "Patient Record",
  "relationship_name": "patient",
  "is_required": true,
  "min_count": 1,
  "max_count": 1,
  "auto_create": true
}
```

---

#### `work_item_statuses`
Defines available statuses for each work item type.

```sql
CREATE TABLE work_item_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(id) ON DELETE CASCADE,
  status_name VARCHAR(100) NOT NULL,
  status_category VARCHAR(50) NOT NULL,
  is_initial BOOLEAN DEFAULT false,
  is_final BOOLEAN DEFAULT false,
  color VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_statuses_type ON work_item_statuses(work_item_type_id);
```

**Status categories:** new, active, blocked, completed, cancelled

**Example statuses:**
- Open (new, is_initial=true)
- In Progress (active)
- Blocked (blocked)
- Completed (completed, is_final=true)
- Cancelled (cancelled, is_final=true)

---

#### `work_item_status_transitions`
Defines allowed transitions between statuses and associated automation.

```sql
CREATE TABLE work_item_status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(id) ON DELETE CASCADE,
  from_status_id UUID NOT NULL REFERENCES work_item_statuses(id),
  to_status_id UUID NOT NULL REFERENCES work_item_statuses(id),
  required_permission VARCHAR(100),
  validation_config JSONB,
  action_config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transitions_from ON work_item_status_transitions(from_status_id);
CREATE INDEX idx_transitions_to ON work_item_status_transitions(to_status_id);
```

**validation_config structure (JSONB):**
```json
{
  "rules": [
    {
      "type": "field_required",
      "field_id": "uuid",
      "error_message": "Resolution notes are required before completing"
    },
    {
      "type": "all_children_status",
      "status_category": "completed",
      "error_message": "All sub-items must be completed first"
    }
  ]
}
```

**action_config structure (JSONB):**
```json
{
  "actions": [
    {
      "type": "send_notification",
      "recipients": ["assigned_to", "created_by"],
      "template": "status_changed",
      "execution_order": 1
    },
    {
      "type": "update_field",
      "field_id": "uuid",
      "value": "auto-populated value",
      "execution_order": 2
    },
    {
      "type": "assign_to",
      "user_id": "uuid_or_field_reference",
      "execution_order": 3
    }
  ]
}
```

---

#### `work_item_comments`
User comments on work items.

```sql
CREATE TABLE work_item_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comments_work_item ON work_item_comments(work_item_id);
CREATE INDEX idx_comments_user ON work_item_comments(user_id);
CREATE INDEX idx_comments_created ON work_item_comments(created_at);
```

**is_internal:** Comments visible only to internal team members (not external stakeholders)

---

#### `work_item_attachments`
File attachments linked to work items.

```sql
CREATE TABLE work_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  field_id UUID REFERENCES work_item_fields(id),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  s3_key VARCHAR(1000) NOT NULL UNIQUE,
  s3_bucket VARCHAR(255) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_attachments_work_item ON work_item_attachments(work_item_id);
CREATE INDEX idx_attachments_field ON work_item_attachments(field_id);
CREATE INDEX idx_attachments_type ON work_item_attachments(file_type);
```

**S3 organization:**
```
/work-items/{work_item_id}/attachments/{attachment_id}/{filename}
/work-items/{work_item_id}/fields/{field_id}/{filename}
```

---

#### `work_item_activity`
Complete audit log of all work item changes.

```sql
CREATE TABLE work_item_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  activity_type VARCHAR(50) NOT NULL,
  field_id UUID REFERENCES work_item_fields(id),
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_work_item ON work_item_activity(work_item_id);
CREATE INDEX idx_activity_user ON work_item_activity(user_id);
CREATE INDEX idx_activity_type ON work_item_activity(activity_type);
CREATE INDEX idx_activity_created ON work_item_activity(created_at);
```

**Activity types:**
- created, updated, deleted
- status_changed, assigned, unassigned
- commented, attachment_added, attachment_removed
- field_changed, child_added, child_removed
- watched, unwatched

**metadata structure (JSONB):**
```json
{
  "from_status_name": "In Progress",
  "to_status_name": "Completed",
  "field_name": "patient_id",
  "comment_id": "uuid",
  "attachment_filename": "document.pdf"
}
```

---

#### `work_item_watchers`
Users subscribed to notifications for specific work items.

```sql
CREATE TABLE work_item_watchers (
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (work_item_id, user_id)
);

CREATE INDEX idx_watchers_work_item ON work_item_watchers(work_item_id);
CREATE INDEX idx_watchers_user ON work_item_watchers(user_id);
```

**Auto-watchers:** created_by, assigned_to, and commenters automatically watch

---

## Workflow Examples

### Medical Document Request Workflow

#### 1. Work Item Type Setup

**Type: "Medical Document Request"**
- Organization: Healthcare Operations
- Icon: document-medical
- Color: blue

**Standard Fields:**
- subject, description, status, priority
- assigned_to, due_date
- created_by, created_at

**Custom Fields:**
- patient_name (text, required)
- date_of_birth (date, required)
- requested_documents (multi_select, required)
  - Options: Medical Records, Lab Results, Imaging, Prescriptions
- urgency_level (dropdown)
  - Options: Routine, Urgent, Emergency

**Status Workflow:**
1. New (initial)
2. Assigned
3. In Progress
4. Documents Uploaded
5. Review
6. Completed (final)
7. Cancelled (final)

**Allowed Transitions:**
- New → Assigned, Cancelled
- Assigned → In Progress, Cancelled
- In Progress → Documents Uploaded, Blocked, Cancelled
- Documents Uploaded → Review
- Review → Completed, In Progress
- Any → Cancelled

**Child Type Relationships:**
- "Patient Record" (required, min: 1, max: 1, auto_create: true)
- "Document Upload" (optional, min: 0, max: unlimited)

---

#### 2. Creating a Document Request

**User Action:** Creates "Medical Document Request"

**Auto-creation triggers:**
- System creates "Patient Record" sub-item
- Subject: "Patient Record for [parent.patient_name]"
- Inherits: patient_name, date_of_birth from parent

**User fills in:**
- Subject: "Medical records request for John Doe"
- patient_name: "John Doe"
- date_of_birth: "1985-03-15"
- requested_documents: [Medical Records, Lab Results]
- urgency_level: "Routine"

**On "Patient Record" sub-item:**
- patient_id: "MRN123456"
- medical_record_number: "12345"

**User creates "Document Upload" sub-items:**
- Upload #1: Medical Records PDF
- Upload #2: Lab Results PDF

---

#### 3. Status Workflow Execution

**Transition: New → Assigned**
- Action: Assign to medical records team member
- Notification: Email to assigned user
- SLA: Start first response timer

**Transition: In Progress → Documents Uploaded**
- Validation: At least one document attachment required
- Action: Notify reviewer via email
- Action: Set completed_at timestamp

**Transition: Review → Completed**
- Validation: All required fields filled
- Validation: All document uploads have status "Approved"
- Action: Send completion notification to requester
- Action: Archive work item after 90 days (scheduled)

---

#### 4. File Organization in S3

```
/work-items/
  └── {document_request_id}/
      ├── attachments/
      │   └── {attachment_id}/
      │       └── cover_letter.pdf
      └── children/
          ├── {patient_record_id}/
          │   └── attachments/
          │       └── patient_consent.pdf
          └── {document_upload_id_1}/
              └── attachments/
                  └── medical_records.pdf
```

---

### Customer Support Ticket Workflow

#### 1. Work Item Type Setup

**Type: "Customer Support Ticket"**
- Organization: Customer Success

**Custom Fields:**
- customer_id (text, required)
- customer_email (email, required)
- issue_category (dropdown, required)
  - Options: Technical, Billing, Feature Request, Other
- severity (dropdown, required)
  - Options: Low, Medium, High, Critical
- resolution_notes (rich_text)

**Status Workflow:**
1. Open (initial)
2. In Progress
3. Waiting on Customer
4. Waiting on Internal
5. Resolved (final)
6. Closed (final)

**Child Type Relationships:**
- "Follow-up Task" (optional)
- "Bug Report" (optional)

---

#### 2. Creating a Ticket

**User Action:** Support agent creates ticket

**Form data:**
- Subject: "Cannot access billing page"
- customer_id: "CUST-5678"
- customer_email: "customer@example.com"
- issue_category: "Technical"
- severity: "High"
- Priority auto-set based on severity

**Assignment rules:**
- If category = "Billing" → assign to billing team queue
- If category = "Technical" AND severity = "Critical" → assign to senior tech
- Otherwise → assign to general support queue

---

#### 3. Sub-item Creation

**Scenario:** Issue requires development work

**Agent creates "Bug Report" sub-item:**
- Parent: Support Ticket #1234
- Subject: "Billing page 404 error"
- Inherits: customer_id, issue_category
- Additional fields: bug_severity, steps_to_reproduce, expected_behavior

**Bug Report workflow:**
- Dev team works independently
- Status updates reflected in parent ticket activity
- Parent ticket shows: "Related bug report in progress"

**Communication:**
- Agent communicates with customer on main ticket
- Developers work on bug report
- Both teams have visibility into full context

---

#### 4. SLA Tracking

**SLA Configuration by Severity:**
- Critical: 1 hour first response, 4 hours resolution
- High: 4 hours first response, 24 hours resolution
- Medium: 8 hours first response, 72 hours resolution
- Low: 24 hours first response, 7 days resolution

**Tracking:**
- Timer starts on ticket creation
- Pauses when status = "Waiting on Customer"
- Breach alerts sent at 80% of SLA time
- Reports show SLA compliance by team/agent

---

## Permission Structure

### Permission Format
`resource:action:scope`

### Work Item Permissions

**Create:**
- `work_item:create:own_organization` - Create work items in your organization
- `work_item:create:all` - Create work items in any organization

**Read:**
- `work_item:read:own` - Read only work items assigned to you or created by you
- `work_item:read:team` - Read work items assigned to your team
- `work_item:read:organization` - Read all work items in your organization
- `work_item:read:all` - Read all work items across all organizations

**Update:**
- `work_item:update:own` - Update work items you created
- `work_item:update:assigned` - Update work items assigned to you
- `work_item:update:organization` - Update any work item in your organization
- `work_item:update:all` - Update any work item

**Delete:**
- `work_item:delete:own` - Delete work items you created (if no children)
- `work_item:delete:organization` - Delete work items in your organization
- `work_item:delete:all` - Delete any work item

**Assign:**
- `work_item:assign:self` - Assign work items to yourself
- `work_item:assign:team` - Assign to anyone in your team
- `work_item:assign:organization` - Assign to anyone in your organization
- `work_item:assign:all` - Assign to anyone

**Status:**
- `work_item:status:assigned` - Change status on assigned items
- `work_item:status:organization` - Change status on org items
- `work_item:status:all` - Change any status

**Comment:**
- `work_item:comment:visible` - Comment on items you can see
- `work_item:comment:internal` - Add internal comments

**Attach:**
- `work_item:attach:own` - Add attachments to items you own
- `work_item:attach:assigned` - Add attachments to assigned items

### Configuration Permissions

**Work Item Types:**
- `work_item_type:configure:organization` - Configure types for your organization
- `work_item_type:configure:all` - Configure any type

**Fields:**
- `work_item_field:configure:organization` - Configure fields for org types
- `work_item_field:configure:all` - Configure any field

**Workflows:**
- `work_item_workflow:configure:organization` - Configure workflows for org types
- `work_item_workflow:configure:all` - Configure any workflow

### Field-Level Permissions

Stored in field_config:
```json
{
  "visibility": {
    "roles": ["admin", "manager"],
    "users": ["user-uuid"],
    "condition": "status_in:['review', 'completed']"
  },
  "editable": {
    "roles": ["admin"],
    "condition": "status_not_in:['completed', 'cancelled']"
  }
}
```

### Example Role Configurations

**Support Agent:**
```json
[
  "work_item:create:own_organization",
  "work_item:read:organization",
  "work_item:update:assigned",
  "work_item:assign:team",
  "work_item:status:assigned",
  "work_item:comment:visible",
  "work_item:attach:assigned"
]
```

**Manager:**
```json
[
  "work_item:create:own_organization",
  "work_item:read:organization",
  "work_item:update:organization",
  "work_item:delete:organization",
  "work_item:assign:organization",
  "work_item:status:organization",
  "work_item:comment:internal",
  "work_item:attach:own",
  "work_item_type:configure:organization"
]
```

**Super Admin:**
```json
[
  "work_item:*:all",
  "work_item_type:*:all",
  "work_item_field:*:all",
  "work_item_workflow:*:all"
]
```

---

## API Considerations

### Key Endpoints

#### Work Items

**Create Work Item**
```
POST /api/work-items
Body: {
  work_item_type_id: uuid,
  parent_work_item_id?: uuid,
  subject: string,
  description?: string,
  priority?: enum,
  assigned_to?: uuid,
  due_date?: datetime,
  field_values: {
    [field_id]: value
  }
}
Response: WorkItem
```

**Get Work Item**
```
GET /api/work-items/:id?include=children,comments,attachments,activity
Response: {
  work_item: WorkItem,
  children?: WorkItem[],
  comments?: Comment[],
  attachments?: Attachment[],
  activity?: Activity[]
}
```

**List Work Items**
```
GET /api/work-items?
  organization_id=uuid&
  type_id=uuid&
  status_id=uuid&
  assigned_to=uuid&
  priority=high&
  due_before=datetime&
  search=query&
  include_children=boolean&
  page=1&
  limit=50&
  sort=created_at&
  order=desc

Response: {
  items: WorkItem[],
  total: number,
  page: number,
  limit: number
}
```

**Update Work Item**
```
PATCH /api/work-items/:id
Body: {
  subject?: string,
  description?: string,
  priority?: enum,
  assigned_to?: uuid,
  due_date?: datetime,
  field_values?: {
    [field_id]: value
  }
}
Response: WorkItem
```

**Delete Work Item**
```
DELETE /api/work-items/:id?cascade=boolean
Response: { success: boolean }
```

**Update Status**
```
PATCH /api/work-items/:id/status
Body: {
  status_id: uuid,
  comment?: string
}
Response: WorkItem
```

---

#### Comments

**Add Comment**
```
POST /api/work-items/:id/comments
Body: {
  comment: string,
  is_internal?: boolean
}
Response: Comment
```

**Get Comments**
```
GET /api/work-items/:id/comments?page=1&limit=50
Response: {
  comments: Comment[],
  total: number
}
```

---

#### Attachments

**Upload Attachment**
```
POST /api/work-items/:id/attachments
Content-Type: multipart/form-data
Body: {
  file: File,
  field_id?: uuid
}
Response: Attachment
```

**Download Attachment**
```
GET /api/attachments/:id/download
Response: Signed S3 URL (redirect)
```

**Delete Attachment**
```
DELETE /api/attachments/:id
Response: { success: boolean }
```

---

#### Work Item Types

**Create Type**
```
POST /api/work-item-types
Body: {
  organization_id: uuid,
  name: string,
  description?: string,
  icon?: string,
  color?: string
}
Response: WorkItemType
```

**Get Type Configuration**
```
GET /api/work-item-types/:id?include=fields,statuses,relationships
Response: {
  type: WorkItemType,
  fields?: Field[],
  statuses?: Status[],
  relationships?: Relationship[]
}
```

**List Types**
```
GET /api/work-item-types?organization_id=uuid&is_active=true
Response: WorkItemType[]
```

---

#### Fields

**Add Field**
```
POST /api/work-item-types/:id/fields
Body: {
  field_name: string,
  field_label: string,
  field_type: enum,
  is_required: boolean,
  field_config: object
}
Response: Field
```

**Update Field**
```
PATCH /api/work-item-fields/:id
Body: {
  field_label?: string,
  is_required?: boolean,
  display_order?: number,
  field_config?: object
}
Response: Field
```

**Delete Field**
```
DELETE /api/work-item-fields/:id
Response: { success: boolean }
```

---

#### Statuses

**Add Status**
```
POST /api/work-item-types/:id/statuses
Body: {
  status_name: string,
  status_category: enum,
  is_initial?: boolean,
  is_final?: boolean,
  color?: string
}
Response: Status
```

**Configure Transitions**
```
POST /api/work-item-types/:id/transitions
Body: {
  from_status_id: uuid,
  to_status_id: uuid,
  required_permission?: string,
  validation_config?: object,
  action_config?: object
}
Response: Transition
```

---

#### Relationships

**Define Relationship**
```
POST /api/work-item-types/:id/relationships
Body: {
  child_type_id: uuid,
  relationship_name: string,
  is_required: boolean,
  min_count?: number,
  max_count?: number,
  auto_create: boolean,
  auto_create_config?: object
}
Response: Relationship
```

---

#### Activity & Watchers

**Get Activity Feed**
```
GET /api/work-items/:id/activity?page=1&limit=50
Response: {
  activity: Activity[],
  total: number
}
```

**Watch Work Item**
```
POST /api/work-items/:id/watch
Response: { success: boolean }
```

**Unwatch Work Item**
```
DELETE /api/work-items/:id/watch
Response: { success: boolean }
```

---

#### Bulk Operations

**Bulk Update**
```
POST /api/work-items/bulk-update
Body: {
  work_item_ids: uuid[],
  updates: {
    status_id?: uuid,
    assigned_to?: uuid,
    priority?: enum,
    field_values?: object
  }
}
Response: { updated: number, errors: Error[] }
```

**Bulk Delete**
```
POST /api/work-items/bulk-delete
Body: {
  work_item_ids: uuid[],
  cascade?: boolean
}
Response: { deleted: number, errors: Error[] }
```

---

#### Search & Reporting

**Full-Text Search**
```
GET /api/work-items/search?
  q=search+query&
  organization_id=uuid&
  type_ids[]=uuid&
  status_ids[]=uuid&
  date_from=datetime&
  date_to=datetime

Response: {
  results: WorkItem[],
  total: number,
  facets: {
    types: { [type_id]: count },
    statuses: { [status_id]: count },
    assignees: { [user_id]: count }
  }
}
```

**Reports**
```
GET /api/reports/work-items-by-status?
  organization_id=uuid&
  date_from=datetime&
  date_to=datetime

GET /api/reports/work-items-by-assignee?
  organization_id=uuid

GET /api/reports/overdue?
  organization_id=uuid

GET /api/reports/sla-breaches?
  organization_id=uuid
```

---

### Query Performance Considerations

**Hierarchy Queries:**
```sql
-- Get all descendants using materialized path
SELECT * FROM work_items
WHERE path LIKE '/parent-uuid/%';

-- Get direct children only
SELECT * FROM work_items
WHERE parent_work_item_id = 'uuid';

-- Get all ancestors (requires parsing path and IN query)
-- If path is '/uuid1/uuid2/uuid3/'
SELECT * FROM work_items
WHERE id IN ('uuid1', 'uuid2', 'uuid3')
ORDER BY depth;

-- Count descendants
SELECT COUNT(*) FROM work_items
WHERE path LIKE '/parent-uuid/%';

-- Find by depth level
SELECT * FROM work_items
WHERE depth = 2 AND path LIKE '/root-uuid/%';
```

**Path Management:**
```javascript
// When creating a child work item
function generatePath(parentPath, childId) {
  return `${parentPath}${childId}/`;
}

// Example:
// Parent path: '/parent-uuid/'
// Child path: '/parent-uuid/child-uuid/'

// Parse ancestors from path
function getAncestorIds(path) {
  return path.split('/').filter(id => id.length > 0);
}
```

**Custom Field Queries:**
```sql
-- Query by text field
SELECT wi.* FROM work_items wi
JOIN work_item_field_values wifv ON wi.id = wifv.work_item_id
JOIN work_item_fields wif ON wifv.field_id = wif.id
WHERE wif.field_name = 'patient_id'
  AND wifv.value_text = 'MRN123456';

-- Query by number range
SELECT wi.* FROM work_items wi
JOIN work_item_field_values wifv ON wi.id = wifv.work_item_id
JOIN work_item_fields wif ON wifv.field_id = wif.id
WHERE wif.field_name = 'severity_score'
  AND wifv.value_number BETWEEN 7 AND 10;
```

---

## UI Components

### Core Components Needed

#### 1. Work Item List View
**Features:**
- Table/grid view with sortable columns
- Customizable column selection
- Filters panel (status, assignee, type, date range)
- Bulk selection with actions
- Pagination
- Quick actions (assign, change status)
- Search bar with autocomplete

**Default Columns:**
- Subject (with link)
- Type (with icon/color)
- Status (with badge)
- Assigned to (with avatar)
- Priority (with icon)
- Due date (with warning for overdue)
- Created date

---

#### 2. Work Item Detail View
**Features:**
- Header with title, type, status badge
- Action buttons (Edit, Delete, Watch, More)
- Standard fields section
- Custom fields section (dynamic based on type)
- Comments section
- Attachments section
- Activity timeline
- Sub-items section (hierarchy tree)
- Related items section

**Tabs:**
- Overview (all sections)
- Comments
- Attachments
- Activity
- Sub-items

---

#### 3. Work Item Form (Create/Edit)
**Features:**
- Dynamic field rendering based on work item type
- Field validation (required, format, custom rules)
- Conditional field visibility
- Rich text editor for description
- User/team picker for assignment
- Date picker for due dates
- File upload area
- Parent item selector (if creating sub-item)
- Save draft functionality
- Preview mode

---

#### 4. Hierarchy Tree View
**Features:**
- Expandable/collapsible tree
- Drag-drop to reorder/reparent
- Visual indicators for item status
- Quick view on hover
- Context menu (add child, edit, delete)
- Breadcrumb navigation
- Depth limit indicator

---

#### 5. Type Configuration Interface
**Features:**
- Type creation wizard
- Icon and color picker
- Field builder with drag-drop ordering
- Field type selector
- Field configuration panel
- Status workflow builder (visual)
- Transition rule editor
- Relationship configurator
- Preview mode

**Field Builder:**
- Add field button
- Field list with reordering
- Field editor sidebar
- Field type templates
- Validation rule builder
- Conditional visibility rules

---

#### 6. Status Workflow Builder
**Features:**
- Visual node-based editor
- Drag nodes to position
- Click to add transitions
- Transition editor panel
- Validation rule builder
- Action configurator
- Test workflow functionality

---

#### 7. Search & Filter Builder
**Features:**
- Advanced search form
- Field-specific filters
- Date range pickers
- Multi-select for categories
- Save filter as view
- Manage saved views
- Export results

---

#### 8. Dashboard & Reports
**Features:**
- Widget-based layout
- Customizable widgets
- Common charts:
  - Work items by status (pie/bar)
  - Work items by assignee (bar)
  - Overdue items (list)
  - SLA compliance (gauge)
  - Trend over time (line)
- Quick stats cards
- Recent activity feed
- My work items widget

---

#### 9. Comments Component
**Features:**
- Rich text editor
- @mentions with autocomplete
- Internal/external toggle
- Edit/delete own comments
- Reply threading (optional)
- Real-time updates
- Emoji reactions (optional)

---

#### 10. File Attachment Component
**Features:**
- Drag-drop upload area
- Progress indicators
- File previews (images, PDFs)
- Download buttons
- Delete with confirmation
- File size/type restrictions
- Multiple file upload

---

#### 11. Activity Timeline
**Features:**
- Chronological feed
- Activity type icons
- Expandable details
- Filter by activity type
- User avatars
- Relative timestamps
- Grouped by date

---

#### 12. Permission Manager
**Features:**
- Role selector
- Permission checklist
- Permission groups
- Test permissions
- User assignment
- Audit log

---

### Component Library Considerations

**Recommended Stack:**
- shadcn/ui for base components
- Radix UI primitives
- TanStack Table for data tables
- React Hook Form for forms
- Zod for validation
- React Flow or ReactFlow for workflow builder
- Lexical or TipTap for rich text
- React Dropzone for file uploads
- Recharts for charts/graphs

---

## Phased Implementation Plan

### Timeline Overview
**Total Duration:** 16 weeks to full MVP
**Strategy:** Iterative delivery with feedback loops

---

### Phase 1: Core Foundation (Week 1-2)
**Goal:** Basic work item CRUD with one simple work item type

#### Features
- Create, read, update, delete work items
- Single hardcoded work item type (e.g., "General Task")
- Standard fields only: subject, description, status, priority, assigned_to, due_date
- Simple status workflow: Open → In Progress → Completed
- Basic list view and detail view
- Organization-based filtering (using existing org security)

#### Database Tables
- `work_item_types` (seed with one type)
- `work_items` (standard fields only, no custom fields yet)
- `work_item_statuses` (seed with basic statuses)

#### API Endpoints
- `POST /api/work-items` - Create
- `GET /api/work-items` - List with filters
- `GET /api/work-items/:id` - Get single item
- `PATCH /api/work-items/:id` - Update
- `DELETE /api/work-items/:id` - Delete
- `PATCH /api/work-items/:id/status` - Update status

#### UI Components
- Work item list page with table view
- Work item detail/edit page
- Simple form with standard fields
- Status dropdown
- User assignment picker (from existing user system)

#### Success Criteria
✓ Users can create and manage basic work items
✓ Filtering by status, assignee, organization works
✓ Permission checks work (using existing RBAC)
✓ Team can test core workflow and provide feedback

#### Deliverables
- Working CRUD for work items
- Basic UI for list and detail views
- Unit tests for API endpoints
- E2E test for create → update → complete flow
- Demo to stakeholders

---

### Phase 2: Hierarchy & Comments (Week 3)
**Goal:** Add parent-child relationships and basic collaboration

#### Features
- Parent-child work item relationships
- Unlimited nesting depth
- Comments on work items
- Activity feed showing changes

#### Database Tables
- Update `work_items` to add: parent_work_item_id, root_work_item_id, depth, path (VARCHAR materialized path)
- `work_item_comments`
- `work_item_activity`

#### API Endpoints
- `POST /api/work-items/:id/sub-items` - Create child item
- `GET /api/work-items/:id/children` - Get children
- `GET /api/work-items/:id/tree` - Get full hierarchy
- `POST /api/work-items/:id/comments` - Add comment
- `GET /api/work-items/:id/activity` - Get activity feed

#### UI Components
- Hierarchy tree view
- "Add sub-item" button on detail page
- Breadcrumb navigation for hierarchy
- Comments section on detail page
- Activity timeline showing all changes

#### Success Criteria
✓ Users can create nested work items
✓ Can navigate up/down the hierarchy easily
✓ Can communicate via comments
✓ Can see history of changes

#### Testing Focus
- Hierarchy query performance with 100+ items
- Deep nesting (10+ levels)
- Activity log accuracy

---

### Phase 3: Custom Fields (Week 4-5)
**Goal:** Make work items configurable with custom fields

#### Features
- Define custom fields for work item types
- Support field types: text, number, date, dropdown, checkbox, user picker
- Field validation (required fields)
- Display custom fields in forms

#### Database Tables
- `work_item_fields`
- `work_item_field_values`

#### API Endpoints
- `POST /api/work-item-types/:id/fields` - Add field definition
- `GET /api/work-item-types/:id/fields` - Get field definitions
- `PATCH /api/work-item-fields/:id` - Update field definition
- `DELETE /api/work-item-fields/:id` - Remove field
- Field values stored/retrieved via existing work item endpoints

#### UI Components
- Field configuration page (admin)
- Field builder with drag-drop ordering
- Field type selector
- Dynamic form rendering based on field definitions
- Validation feedback

#### Success Criteria
✓ Admins can define custom fields per type
✓ Forms dynamically render based on configuration
✓ Field values saved and displayed correctly
✓ Required field validation works
✓ Can query work items by custom field values

#### Testing Focus
- Dynamic form rendering with 20+ fields
- Field value storage/retrieval
- Validation rules enforcement
- Query performance on custom fields

---

### Phase 4: Multiple Work Item Types (Week 6)
**Goal:** Support different work item types per organization

#### Features
- Create and manage multiple work item types
- Each type has its own field configuration
- Each type has its own status workflow
- Type-based filtering and views

#### Database Tables
- Already have `work_item_types` - now make it user-configurable
- `work_item_status_transitions`

#### API Endpoints
- `POST /api/work-item-types` - Create new type
- `GET /api/work-item-types` - List types for organization
- `PATCH /api/work-item-types/:id` - Update type
- `DELETE /api/work-item-types/:id` - Delete type (if no items exist)
- `POST /api/work-item-types/:id/statuses` - Add status
- `POST /api/work-item-types/:id/transitions` - Define allowed transitions

#### UI Components
- Work item type management page
- Type configuration wizard
- Status workflow builder (visual)
- Type selector when creating new work items
- Type-based dashboard views

#### Success Criteria
✓ Can create multiple types (e.g., "Support Ticket", "Document Request")
✓ Each type has unique fields and statuses
✓ Status transitions enforced per type
✓ Users can filter/view by type

#### Testing Focus
- Multiple type configurations
- Status transition enforcement
- Type-specific field rendering

---

### Phase 5: File Attachments (Week 7)
**Goal:** Upload and manage files on work items

#### Features
- Upload files to work items
- Store files in S3
- File preview and download
- File field type for custom fields
- Organized S3 structure: `/work-items/{id}/attachments/{filename}`

#### Database Tables
- `work_item_attachments`

#### API Endpoints
- `POST /api/work-items/:id/attachments` - Upload file
- `GET /api/work-items/:id/attachments` - List files
- `GET /api/attachments/:id/download` - Download file (signed URL)
- `DELETE /api/attachments/:id` - Delete file

#### UI Components
- File upload component (drag-drop)
- File list with thumbnails
- Download/delete actions
- File field in custom field builder

#### Success Criteria
✓ Users can upload files
✓ Files stored securely in S3
✓ Can download files
✓ File uploads work in custom file fields
✓ File previews work for images/PDFs

#### Testing Focus
- Large file uploads (100MB+)
- S3 permission configuration
- File deletion cleanup
- Concurrent uploads

---

### Phase 6: Type Relationships & Auto-Creation (Week 8-9)
**Goal:** Configure which sub-item types are allowed and auto-create them

#### Features
- Define allowed child types for each parent type
- Required vs optional child types
- Auto-create child items when parent is created
- Templates for auto-created items

#### Database Tables
- `work_item_type_relationships`

#### API Endpoints
- `POST /api/work-item-types/:id/relationships` - Define relationship
- `GET /api/work-item-types/:id/relationships` - Get allowed children
- `PATCH /api/work-item-type-relationships/:id` - Update relationship config

#### UI Components
- Relationship configuration UI
- "Allowed sub-types" section in type config
- Auto-create toggle and template builder
- Guided creation flow (create parent → auto-creates children)

#### Success Criteria
✓ Can define that "Document Request" must have "Patient Record" sub-item
✓ Auto-creation works on parent creation
✓ Can't create invalid child types
✓ Templates pre-populate fields on auto-created items

#### Testing Focus
- Complex relationship configurations
- Auto-creation with field inheritance
- Validation of required child types

---

### Phase 7: Advanced Workflows & Automation (Week 10-11)
**Goal:** Automate actions based on status changes and conditions

#### Features
- Define automated actions on status transitions
- Notification triggers (email/in-app)
- Field auto-population on status change
- Conditional transitions (e.g., can't complete if required fields empty)
- Due date reminders

#### Database Tables
- Update `work_item_status_transitions` to use validation_config and action_config
- `work_item_watchers`

#### API Endpoints
- `PATCH /api/work-item-status-transitions/:id` - Configure automation
- `POST /api/work-items/:id/watch` - Watch for notifications
- `DELETE /api/work-items/:id/watch` - Unwatch

#### UI Components
- Workflow automation builder
- Transition rule configurator
- Action configurator (send email, assign to, etc.)
- Notification preferences
- Watch/unwatch buttons

#### Success Criteria
✓ Automated notifications work
✓ Status transitions validate conditions
✓ Actions execute on status change
✓ Users can subscribe to updates

#### Testing Focus
- Automation reliability
- Notification delivery
- Complex validation rules

---

### Phase 8: Advanced Field Types (Week 12)
**Goal:** Support more complex field types

#### Features
- Multi-select dropdowns
- Rich text editor fields
- URL, email, phone fields with validation
- Currency and percentage fields
- Conditional field visibility

#### Updates
- Extend `work_item_field_values` to support multi-value (multiple rows)
- Update field_config in `work_item_fields` for conditional logic

#### UI Components
- Rich text editor
- Multi-select component
- Format-specific input components
- Conditional visibility rules in field builder

#### Success Criteria
✓ All field types work correctly
✓ Multi-select allows multiple values
✓ Conditional fields show/hide based on rules
✓ Proper validation for each type

#### Testing Focus
- Rich text sanitization
- Multi-value field queries
- Conditional visibility logic

---

### Phase 9: Reporting & Analytics (Week 13-14)
**Goal:** Provide insights and metrics on work items

#### Features
- Pre-built reports (by status, by assignee, by type, overdue items)
- Custom report builder
- Export to CSV
- Dashboard with key metrics
- Charts and visualizations

#### API Endpoints
- `GET /api/reports/work-items-by-status`
- `GET /api/reports/work-items-by-assignee`
- `GET /api/reports/overdue`
- `POST /api/reports/custom` - Run custom query
- `GET /api/reports/export` - CSV export

#### UI Components
- Reports page with pre-built reports
- Custom report builder
- Dashboard with charts
- Export button
- Date range pickers

#### Success Criteria
✓ Standard reports provide useful insights
✓ Can build custom reports by field
✓ Can export data to CSV
✓ Dashboard shows key metrics at a glance

#### Testing Focus
- Report query performance
- Large data export
- Chart rendering performance

---

### Phase 10: Polish & Optimization (Week 15-16)
**Goal:** Performance, UX improvements, and edge cases

#### Features
- Bulk operations (bulk status update, bulk assign, bulk delete)
- Saved filters/views
- Search across all fields (full-text search)
- Performance optimization for large datasets
- Mobile-responsive UI improvements
- Keyboard shortcuts
- Inline editing

#### API Endpoints
- `POST /api/work-items/bulk-update` - Bulk operations
- `POST /api/saved-views` - Save custom views
- `GET /api/work-items/search` - Full-text search

#### UI Components
- Bulk action toolbar
- Saved views sidebar
- Global search
- Quick-edit mode
- Keyboard shortcut help

#### Success Criteria
✓ Can perform bulk operations efficiently
✓ Search finds items across all fields
✓ Pages load quickly even with 10k+ items
✓ Mobile experience is smooth
✓ Power users can work faster with shortcuts

#### Testing Focus
- Performance with 10k+ work items
- Bulk operation reliability
- Search relevance
- Mobile responsiveness

---

## Optional Future Phases

### Phase 11: SLA Management
**Features:**
- Define SLAs per type/priority
- Track first response and resolution times
- SLA breach alerts
- SLA reporting

**Tables:**
- `work_item_sla_configs`
- `work_item_sla_tracking`

---

### Phase 12: Time Tracking
**Features:**
- Log time spent on work items
- Time reports
- Capacity planning

**Tables:**
- `work_item_time_tracking`

---

### Phase 13: Integrations
**Features:**
- Webhook system for external integrations
- API webhooks on work item events
- Slack/Teams notifications
- Email integration (create items from email)

---

### Phase 14: Advanced Permissions
**Features:**
- Field-level permissions
- Granular action permissions per type
- Custom permission roles beyond RBAC

---

## Testing Strategy

### Per Phase Testing Requirements

**Unit Tests:**
- All API endpoints
- Database queries
- Validation logic
- Permission checks

**Integration Tests:**
- API workflows
- Database transactions
- File upload/download
- Notification delivery

**E2E Tests:**
- Critical user flows
- Create → update → complete workflow
- Hierarchy navigation
- Form submissions

**Manual Testing:**
- Product team review
- User acceptance testing
- Accessibility testing
- Cross-browser testing

**Performance Testing:**
- Load testing (1000+ concurrent users)
- Query performance (10k+ work items)
- File upload performance
- Report generation time

---

## Risk Mitigation

### Technical Risks

**Hierarchy Query Performance**
- **Risk:** Slow queries with deep nesting
- **Mitigation:** Use VARCHAR materialized path from Phase 2, index the path column, use LIKE queries for descendants, monitor query plans, consider path length limits (max depth 10)

**Custom Field Indexing**
- **Risk:** Poor query performance on custom fields
- **Mitigation:** Use GIN indexes on jsonb, separate value tables by type, monitor slow queries

**File Storage Costs**
- **Risk:** S3 costs escalate with usage
- **Mitigation:** Implement file size limits (50MB), retention policies, lifecycle rules

**JSONB Query Complexity**
- **Risk:** Complex queries on configuration data
- **Mitigation:** Keep JSONB for config only, use relational tables for reportable data

**Database Size**
- **Risk:** Activity table grows very large
- **Mitigation:** Partition by date, archive old records, implement retention policy

---

### Product Risks

**Scope Creep**
- **Risk:** Features expand beyond plan
- **Mitigation:** Strict phase adherence, capture ideas in backlog, prioritize ruthlessly

**User Adoption**
- **Risk:** Users don't adopt the system
- **Mitigation:** Get feedback after Phases 1, 3, 4, and 6; involve users early; provide training

**Configuration Complexity**
- **Risk:** Admin interface too complex
- **Mitigation:** Test with non-technical users in Phases 4 and 6; provide templates; create wizard flows

**Performance at Scale**
- **Risk:** System slows with large datasets
- **Mitigation:** Performance testing from Phase 7; optimize queries; implement caching; use pagination

---

## Success Metrics

### Phase 1-2 (Foundation)
- 80% of team actively creating work items
- Average 5+ items created per user
- <500ms page load time

### Phase 3-4 (Configuration)
- At least 3 different work item types configured
- Custom fields used in 80%+ of items
- Admin can configure new type in <10 minutes

### Phase 5-7 (Advanced Features)
- File attachments on 40%+ of relevant items
- Automated workflows reduce manual status updates by 50%
- Auto-created sub-items used in 60%+ of applicable cases

### Phase 8-10 (Polish & Analytics)
- 90% of work tracked in the system
- Reports accessed weekly by managers
- <2 second page load times with 5000+ items
- 95% user satisfaction score

---

## Deployment Strategy

### Per-Phase Deployment

**Phase 1-2:**
- Deploy to staging environment
- Internal team testing (1 week)
- Deploy to production with feature flag
- Enable for pilot organization
- Gather feedback, iterate

**Phase 3-6:**
- Deploy each phase to staging
- Beta testing with 2-3 organizations
- Gradual rollout to production
- Monitor performance metrics
- Weekly feedback sessions

**Phase 7-10:**
- Deploy with feature flags
- A/B testing for new features
- Gradual rollout to all organizations
- Performance monitoring
- User feedback surveys

---

## Documentation Requirements

### Technical Documentation
- API reference (OpenAPI/Swagger)
- Database schema documentation
- Architecture decision records (ADRs)
- Deployment guide
- Performance optimization guide

### User Documentation
- Admin guide (type configuration, workflows)
- End user guide (creating items, comments)
- Video tutorials for common tasks
- FAQ
- Troubleshooting guide

### Developer Documentation
- Local development setup
- Testing guidelines
- Code style guide
- Component library documentation
- Contribution guide

---

## Maintenance & Support Plan

### Ongoing Maintenance
- Weekly bug triage
- Monthly performance review
- Quarterly feature prioritization
- Annual security audit

### Support Structure
- Tier 1: In-app help and documentation
- Tier 2: Support ticket system
- Tier 3: Engineering escalation
- SLA: Critical issues within 4 hours, standard within 24 hours

---

## Conclusion

This phased implementation plan delivers a fully functional Work system in 16 weeks, with each phase providing tangible value and opportunities for feedback. The architecture is designed for scalability, configurability, and performance, while maintaining simplicity where possible.

**Key Success Factors:**
1. Stick to the phase timeline
2. Get user feedback early and often
3. Monitor performance from day one
4. Keep configuration simple and intuitive
5. Test thoroughly at each phase
6. Document as you build

The system will provide organizations with a flexible, powerful tool for managing work items while maintaining the structure and governance needed for enterprise use.