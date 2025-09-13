-- Reset RBAC Tables Script
-- This script drops all RBAC tables and recreates them with fresh data

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS user_organizations CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Recreate organizations table
CREATE TABLE public.organizations (
    organization_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    parent_organization_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Recreate permissions table
CREATE TABLE public.permissions (
    permission_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    scope VARCHAR(50) DEFAULT 'own',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Recreate roles table
CREATE TABLE public.roles (
    role_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    organization_id UUID REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Recreate role_permissions junction table
CREATE TABLE public.role_permissions (
    role_permission_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(permission_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Recreate user_roles junction table
CREATE TABLE public.user_roles (
    user_role_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL, -- References users.user_id (from main schema)
    role_id UUID NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
    granted_by UUID, -- References users.user_id
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional: for temporary role assignments
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Recreate user_organizations table
CREATE TABLE public.user_organizations (
    user_organization_id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL, -- References users.user_id (from main schema)
    organization_id UUID NOT NULL REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_organizations_slug ON public.organizations (slug);
CREATE INDEX idx_organizations_parent ON public.organizations (parent_organization_id);
CREATE INDEX idx_organizations_active ON public.organizations (is_active);
CREATE INDEX idx_permissions_name ON public.permissions (name);
CREATE INDEX idx_permissions_resource_action ON public.permissions (resource, action);
CREATE INDEX idx_permissions_resource ON public.permissions (resource);
CREATE INDEX idx_permissions_scope ON public.permissions (scope);
CREATE INDEX idx_roles_name ON public.roles (name);
CREATE INDEX idx_roles_organization ON public.roles (organization_id);
CREATE INDEX idx_roles_system ON public.roles (is_system_role);
CREATE INDEX idx_role_permissions_role ON public.role_permissions (role_id);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions (permission_id);
CREATE INDEX idx_user_roles_user ON public.user_roles (user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles (role_id);
CREATE INDEX idx_user_roles_organization ON public.user_roles (organization_id);
CREATE INDEX idx_user_organizations_user ON public.user_organizations (user_id);
CREATE INDEX idx_user_organizations_org ON public.user_organizations (organization_id);

-- Add unique constraints
ALTER TABLE public.roles ADD CONSTRAINT unique_role_per_org UNIQUE (name, organization_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id);
ALTER TABLE public.user_roles ADD CONSTRAINT unique_user_role_org UNIQUE (user_id, role_id, organization_id);
ALTER TABLE public.user_organizations ADD CONSTRAINT unique_user_organization UNIQUE (user_id, organization_id);

-- Set table ownership
ALTER TABLE public.organizations OWNER TO bcos_d;
ALTER TABLE public.permissions OWNER TO bcos_d;
ALTER TABLE public.roles OWNER TO bcos_d;
ALTER TABLE public.role_permissions OWNER TO bcos_d;
ALTER TABLE public.user_roles OWNER TO bcos_d;
ALTER TABLE public.user_organizations OWNER TO bcos_d;
