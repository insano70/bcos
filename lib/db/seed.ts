import { db, users, templates, practices, practice_attributes, staff_members } from './index';
import { permissions, roles, role_permissions, organizations, user_roles, user_organizations } from './rbac-schema';
import { eq, sql, and } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@/lib/logger';

async function seedUsers() {
  logger.info('Seeding users', {
    operation: 'seedUsers',
    phase: 'start'
  });

  try {
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@bendcare.com'))
      .limit(1);

    if (existingAdmin.length === 0) {
      // Create admin user
      const adminPasswordHash = await hashPassword('admin123!'); // Change this to a secure password

      const [adminUser] = await db
        .insert(users)
        .values({
          email: 'admin@bendcare.com',
          first_name: 'Bendcare',
          last_name: 'Admin',
          password_hash: adminPasswordHash,
          email_verified: true,
          is_active: true,
        })
        .returning();

      logger.info('Admin user created', {
        email: adminUser?.email || 'Unknown',
        userId: adminUser?.user_id,
        operation: 'seedUsers'
      });
    } else {
      logger.info('Admin user already exists, skipping', {
        email: existingAdmin[0]?.email,
        operation: 'seedUsers'
      });
    }

    // Note: Super admin user is now created in the RBAC seeding script

    // Add more sample users for development
    const sampleUsers = [
      {
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password_hash: await hashPassword('password123'),
        email_verified: true,
        is_active: true,
      },
      {
        email: 'jane.smith@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        password_hash: await hashPassword('password123'),
        email_verified: false,
        is_active: true,
      },
      {
        email: 'bob.johnson@example.com',
        first_name: 'Bob',
        last_name: 'Johnson',
        password_hash: await hashPassword('password123'),
        email_verified: true,
        is_active: false,
      },
    ];

    // Check and create sample users
    for (const userData of sampleUsers) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existingUser.length === 0) {
        const [newUser] = await db.insert(users).values(userData).returning();

        logger.info('Sample user created', {
          email: newUser?.email || 'Unknown',
          userId: newUser?.user_id,
          operation: 'seedUsers'
        });
      } else {
        logger.info('User already exists, skipping', {
          email: userData.email,
          operation: 'seedUsers'
        });
      }
    }

    logger.info('User seeding completed', {
      operation: 'seedUsers',
      phase: 'completed'
    });
  } catch (error) {
    logger.error('Error seeding users', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'seedUsers'
    });
    throw error;
  }
}

async function seedTemplates() {
  logger.info('Seeding templates', {
    operation: 'seedTemplates',
    phase: 'start'
  });
  
  const templateData = [
    {
      name: 'Classic Professional',
      slug: 'classic-professional',
      description: 'Traditional medical practice layout inspired by established rheumatology clinics like Denver Arthritis Clinic',
    },
    {
      name: 'Modern Minimalist',
      slug: 'modern-minimalist', 
      description: 'Clean, contemporary design focusing on expertise and technology',
    },
    {
      name: 'Warm & Welcoming',
      slug: 'warm-welcoming',
      description: 'Patient-friendly, approachable design emphasizing comfort and care',
    },
    {
      name: 'Clinical Focus',
      slug: 'clinical-focus',
      description: 'Research and expertise-focused design for academic practices',
    },
    {
      name: 'Community Practice',
      slug: 'community-practice',
      description: 'Local, family-oriented approach for neighborhood practices',
    }
  ];

  for (const template of templateData) {
    const existing = await db
      .select()
      .from(templates)
      .where(eq(templates.slug, template.slug))
      .limit(1);

    if (existing.length === 0) {
      const [newTemplate] = await db
        .insert(templates)
        .values(template)
        .returning();
      
      logger.info('Template created', {
        name: newTemplate?.name || 'Unknown',
        slug: newTemplate?.slug,
        templateId: newTemplate?.template_id,
        operation: 'seedTemplates'
      });
    } else {
      logger.info('Template already exists, skipping', {
        name: template.name,
        slug: template.slug,
        operation: 'seedTemplates'
      });
    }
  }
}

async function seedRBAC() {
  logger.info('Seeding RBAC data', {
    operation: 'seedRBAC',
    phase: 'start'
  });

  try {
    // 1. Seed permissions
    logger.info('Seeding permissions', {
      operation: 'seedRBAC',
      phase: 'permissions'
    });
    const permissionData = [
      // User Management Permissions
      { name: 'users:read:own', description: 'Read own user profile', resource: 'users', action: 'read', scope: 'own' },
      { name: 'users:update:own', description: 'Update own user profile', resource: 'users', action: 'update', scope: 'own' },
      { name: 'users:read:organization', description: 'Read users in organization', resource: 'users', action: 'read', scope: 'organization' },
      { name: 'users:create:organization', description: 'Create users in organization', resource: 'users', action: 'create', scope: 'organization' },
      { name: 'users:update:organization', description: 'Update users in organization', resource: 'users', action: 'update', scope: 'organization' },
      { name: 'users:delete:organization', description: 'Delete users in organization', resource: 'users', action: 'delete', scope: 'organization' },
      { name: 'users:read:all', description: 'Read all users (super admin)', resource: 'users', action: 'read', scope: 'all' },
      { name: 'users:manage:all', description: 'Full user management (super admin)', resource: 'users', action: 'manage', scope: 'all' },
      
      // Practice Management Permissions
      { name: 'practices:read:own', description: 'Read own practice information', resource: 'practices', action: 'read', scope: 'own' },
      { name: 'practices:update:own', description: 'Update own practice information', resource: 'practices', action: 'update', scope: 'own' },
      { name: 'practices:staff:manage:own', description: 'Manage practice staff', resource: 'practices', action: 'staff:manage', scope: 'own' },
      { name: 'practices:create:all', description: 'Create new practices (super admin)', resource: 'practices', action: 'create', scope: 'all' },
      { name: 'practices:read:all', description: 'Read all practices (super admin)', resource: 'practices', action: 'read', scope: 'all' },
      { name: 'practices:manage:all', description: 'Full practice management (super admin)', resource: 'practices', action: 'manage', scope: 'all' },
      
      // Analytics Permissions
      { name: 'analytics:read:organization', description: 'View organization analytics', resource: 'analytics', action: 'read', scope: 'organization' },
      { name: 'analytics:export:organization', description: 'Export organization reports', resource: 'analytics', action: 'export', scope: 'organization' },
      { name: 'analytics:read:all', description: 'View all analytics (super admin)', resource: 'analytics', action: 'read', scope: 'all' },
      
      // Role Management Permissions
      { name: 'roles:read:organization', description: 'Read roles in organization', resource: 'roles', action: 'read', scope: 'organization' },
      { name: 'roles:create:organization', description: 'Create roles in organization', resource: 'roles', action: 'create', scope: 'organization' },
      { name: 'roles:update:organization', description: 'Update roles in organization', resource: 'roles', action: 'update', scope: 'organization' },
      { name: 'roles:delete:organization', description: 'Delete roles in organization', resource: 'roles', action: 'delete', scope: 'organization' },
      { name: 'roles:manage:all', description: 'Full role management (super admin)', resource: 'roles', action: 'manage', scope: 'all' },
      
      // Settings Permissions
      { name: 'settings:read:organization', description: 'Read organization settings', resource: 'settings', action: 'read', scope: 'organization' },
      { name: 'settings:update:organization', description: 'Update organization settings', resource: 'settings', action: 'update', scope: 'organization' },
      { name: 'settings:read:all', description: 'Read all system settings', resource: 'settings', action: 'read', scope: 'all' },
      { name: 'settings:update:all', description: 'Update all system settings', resource: 'settings', action: 'update', scope: 'all' },
      
      // Template Management Permissions
      { name: 'templates:read:organization', description: 'Read available templates', resource: 'templates', action: 'read', scope: 'organization' },
      { name: 'templates:manage:all', description: 'Full template management (super admin)', resource: 'templates', action: 'manage', scope: 'all' },
      
      // API Access Permissions
      { name: 'api:read:organization', description: 'Read API access for organization', resource: 'api', action: 'read', scope: 'organization' },
      { name: 'api:write:organization', description: 'Write API access for organization', resource: 'api', action: 'write', scope: 'organization' },
    ];

    for (const permission of permissionData) {
      const existing = await db.select().from(permissions).where(eq(permissions.name, permission.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(permissions).values(permission);
        logger.info('Permission created', {
          name: permission.name,
          resource: permission.resource,
          action: permission.action,
          operation: 'seedRBAC'
        });
      } else {
        logger.info('Permission already exists, skipping', {
          name: permission.name,
          operation: 'seedRBAC'
        });
      }
    }

    // 2. Seed roles
    logger.info('Seeding roles', {
      operation: 'seedRBAC',
      phase: 'roles'
    });
    const roleData = [
      { name: 'super_admin', description: 'Super administrator with full system access', is_system_role: true, is_active: true },
      { name: 'user', description: 'Basic user with own resource access', is_system_role: true, is_active: true }
    ];

    for (const role of roleData) {
      const existing = await db.select().from(roles).where(eq(roles.name, role.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(roles).values(role);
        logger.info('Role created', {
          name: role.name,
          systemRole: role.is_system_role,
          roleId: newRole?.role_id,
          operation: 'seedRBAC'
        });
      } else {
        logger.info('Role already exists, skipping', {
          name: role.name,
          operation: 'seedRBAC'
        });
      }
    }

    // 3. Seed organizations
    logger.info('Seeding organizations', {
      operation: 'seedRBAC',
      phase: 'organizations'
    });
    const orgData = [
      { name: 'Platform Administration', slug: 'platform-admin', is_active: true },
      { name: 'Rheumatology Associates', slug: 'rheumatology-associates', is_active: true },
      { name: 'Joint Care Specialists', slug: 'joint-care-specialists', is_active: true }
    ];

    for (const org of orgData) {
      const existing = await db.select().from(organizations).where(eq(organizations.slug, org.slug)).limit(1);
      if (existing.length === 0) {
        await db.insert(organizations).values(org);
        logger.info('Organization created', {
          name: org.name,
          slug: org.slug,
          organizationId: newOrg?.organization_id,
          operation: 'seedRBAC'
        });
      } else {
        logger.info('Organization already exists, skipping', {
          name: org.name,
          operation: 'seedRBAC'
        });
      }
    }

    // 4. Assign permissions to roles
    logger.info('Assigning permissions to roles', {
      operation: 'seedRBAC',
      phase: 'rolePermissions'
    });
    
    // Get roles
    const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, 'super_admin')).limit(1);
    const [userRole] = await db.select().from(roles).where(eq(roles.name, 'user')).limit(1);
    
    if (superAdminRole) {
      // Assign ALL permissions to super_admin
      const allPermissions = await db.select().from(permissions);
      for (const permission of allPermissions) {
        const existing = await db.select().from(role_permissions)
          .where(and(eq(role_permissions.role_id, superAdminRole.role_id), eq(role_permissions.permission_id, permission.permission_id)))
          .limit(1);
        
        if (existing.length === 0) {
          await db.insert(role_permissions).values({
            role_id: superAdminRole.role_id,
            permission_id: permission.permission_id
          });
        }
      }
      logger.info('Assigned all permissions to super_admin', {
        permissionsCount: allPermissions.length,
        operation: 'seedRBAC'
      });
    }

    if (userRole) {
      // Assign only 'own' scope permissions to user role
      const ownPermissions = await db.select().from(permissions).where(eq(permissions.scope, 'own'));
      for (const permission of ownPermissions) {
        const existing = await db.select().from(role_permissions)
          .where(and(eq(role_permissions.role_id, userRole.role_id), eq(role_permissions.permission_id, permission.permission_id)))
          .limit(1);
        
        if (existing.length === 0) {
          await db.insert(role_permissions).values({
            role_id: userRole.role_id,
            permission_id: permission.permission_id
          });
        }
      }
      logger.info('Assigned own scope permissions to user role', {
        permissionsCount: ownPermissions.length,
        operation: 'seedRBAC'
      });
    }

    logger.info('RBAC seeding completed', {
      operation: 'seedRBAC',
      phase: 'completed'
    });
  } catch (error) {
    logger.error('Error seeding RBAC', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'seedRBAC'
    });
    throw error;
  }
}

async function seedPractices() {
  logger.info('Seeding sample practice', {
    operation: 'seedPractices',
    phase: 'start'
  });

  try {
        // Get a random template for demo
        const allTemplates = await db.select().from(templates).where(eq(templates.is_active, true));
        const randomTemplate = allTemplates[Math.floor(Math.random() * allTemplates.length)];

        if (!randomTemplate) {
          logger.warn('No templates found, skipping practice seeding', {
            operation: 'seedPractices'
          });
          return;
        }

        logger.info('Using template for practice', {
          templateName: randomTemplate.name,
          templateSlug: randomTemplate.slug,
          templateId: randomTemplate.template_id,
          operation: 'seedPractices'
        });

    // Get admin user
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@bendcare.com'))
      .limit(1);

    if (!adminUser) {
      logger.warn('Admin user not found, skipping practice seeding', {
        operation: 'seedPractices'
      });
      return;
    }

    // Create Denver Rheumatology practice
    const denverPractice = await db
      .select()
      .from(practices)
      .where(eq(practices.domain, 'denver-rheumatology.com'))
      .limit(1);

    if (denverPractice.length === 0) {
      const [newDenverPractice] = await db
        .insert(practices)
        .values({
          name: 'Denver Rheumatology',
          domain: 'denver-rheumatology.com',
          template_id: randomTemplate.template_id,
          status: 'active',
          owner_user_id: adminUser.user_id,
        })
        .returning();
      
      logger.info('Denver Rheumatology practice created', {
        name: newDenverPractice?.name || 'Unknown',
        practiceId: newDenverPractice?.practice_id,
        domain: newDenverPractice?.domain,
        operation: 'seedPractices'
      });
      
      // Create practice attributes for Denver Rheumatology
      await db
        .insert(practice_attributes)
        .values({
          practice_id: newDenverPractice?.practice_id || '',
          phone: '(720) 555-0199',
          email: 'info@denver-rheumatology.com',
          address_line1: '456 Colorado Boulevard',
          address_line2: 'Suite 300',
          city: 'Denver',
          state: 'CO',
          zip_code: '80206',
          business_hours: JSON.stringify({
            monday: { open: '08:00', close: '17:00', closed: false },
            tuesday: { open: '08:00', close: '17:00', closed: false },
            wednesday: { open: '08:00', close: '17:00', closed: false },
            thursday: { open: '08:00', close: '17:00', closed: false },
            friday: { open: '08:00', close: '16:00', closed: false },
            saturday: { closed: true },
            sunday: { closed: true }
          }),
          services: JSON.stringify([
            'Rheumatoid Arthritis Treatment',
            'Psoriatic Arthritis Management',
            'Lupus Care',
            'Gout Treatment',
            'Osteoporosis Management',
            'Biologic Infusion Therapy',
            'Joint Injections',
            'Fibromyalgia Treatment'
          ]),
          conditions_treated: JSON.stringify([
            'Rheumatoid Arthritis',
            'Psoriatic Arthritis',
            'Systemic Lupus Erythematosus',
            'Gout',
            'Osteoporosis',
            'Osteoarthritis',
            'Fibromyalgia',
            'Ankylosing Spondylitis',
            'Sjögren\'s Syndrome',
            'Polymyalgia Rheumatica'
          ]),
          insurance_accepted: JSON.stringify([
            'Aetna',
            'Anthem Blue Cross Blue Shield',
            'Cigna',
            'Humana',
            'Kaiser Permanente',
            'Medicare',
            'UnitedHealthcare'
          ]),
          about_text: 'Denver Rheumatology is a leading rheumatology practice in the Denver metro area, dedicated to providing comprehensive care for patients with arthritis and autoimmune conditions. Our experienced team combines cutting-edge treatments with compassionate care.',
          mission_statement: 'To improve the quality of life for patients with rheumatic diseases through expert diagnosis, innovative treatment, and personalized care.',
          welcome_message: 'Welcome to Denver Rheumatology. We are committed to helping you manage your condition and live your best life.',
          meta_title: 'Denver Rheumatology - Expert Arthritis & Autoimmune Care in Denver, CO',
          meta_description: 'Denver\'s premier rheumatology practice specializing in arthritis, lupus, and autoimmune conditions. Board-certified rheumatologists providing expert care.',
          primary_color: '#00AEEF',
          secondary_color: '#FFFFFF',
          accent_color: '#44C0AE'
        });

      // Create staff members for Denver Rheumatology
      await db
        .insert(staff_members)
        .values([
          {
            practice_id: newDenverPractice?.practice_id || '',
            name: 'Dr. Michael Chen',
            title: 'Rheumatologist',
            credentials: 'MD, FACR',
            bio: 'Dr. Chen is a board-certified rheumatologist with expertise in inflammatory arthritis and biologic therapies. He completed his fellowship at the University of Colorado and has been practicing in Denver for over 10 years.',
            specialties: JSON.stringify([
              'Rheumatoid Arthritis',
              'Psoriatic Arthritis',
              'Biologic Therapy',
              'Inflammatory Arthritis'
            ]),
            education: JSON.stringify([
              { degree: 'MD', school: 'Stanford University School of Medicine', year: '2009' },
              { degree: 'Rheumatology Fellowship', school: 'University of Colorado', year: '2015' },
              { degree: 'Internal Medicine Residency', school: 'UCLA Medical Center', year: '2012' }
            ]),
            display_order: 1,
          },
          {
            practice_id: newDenverPractice?.practice_id || '',
            name: 'Dr. Emily Rodriguez',
            title: 'Rheumatologist',
            credentials: 'MD, MS',
            bio: 'Dr. Rodriguez specializes in lupus and other connective tissue diseases. She is actively involved in clinical research and has published numerous papers on novel treatments for autoimmune conditions.',
            specialties: JSON.stringify([
              'Lupus',
              'Sjögren\'s Syndrome',
              'Connective Tissue Diseases',
              'Clinical Research'
            ]),
            education: JSON.stringify([
              { degree: 'MD', school: 'University of Michigan Medical School', year: '2011' },
              { degree: 'MS', school: 'University of Michigan', year: '2008' },
              { degree: 'Rheumatology Fellowship', school: 'Mayo Clinic', year: '2017' }
            ]),
            display_order: 2,
          }
        ]);
      
      logger.info('Denver Rheumatology configuration and staff created', {
        operation: 'seedPractices',
        practice: 'Denver Rheumatology'
      });
    } else {
      logger.info('Denver Rheumatology practice already exists, skipping', {
        operation: 'seedPractices'
      });
    }

    // Check if demo practice exists
    const existingPractice = await db
      .select()
      .from(practices)
      .where(eq(practices.domain, 'demo-rheumatology.com'))
      .limit(1);

    if (existingPractice.length === 0) {
      const [newPractice] = await db
        .insert(practices)
        .values({
          name: 'Demo Rheumatology Clinic',
          domain: 'demo-rheumatology.com',
          template_id: randomTemplate.template_id,
          status: 'active',
          owner_user_id: adminUser.user_id,
        })
        .returning();
      
      logger.info('Demo practice created', {
        name: newPractice?.name || 'Unknown',
        practiceId: newPractice?.practice_id,
        domain: newPractice?.domain,
        operation: 'seedPractices'
      });
      
      // Create practice attributes
      await db
        .insert(practice_attributes)
        .values({
          practice_id: newPractice?.practice_id || '',
          phone: '(303) 555-0123',
          email: 'info@demo-rheumatology.com',
          address_line1: '123 Medical Center Drive',
          address_line2: 'Suite 200',
          city: 'Denver',
          state: 'CO',
          zip_code: '80202',
          business_hours: JSON.stringify({
            monday: { open: '08:00', close: '17:00', closed: false },
            tuesday: { open: '08:00', close: '17:00', closed: false },
            wednesday: { open: '08:00', close: '17:00', closed: false },
            thursday: { open: '08:00', close: '17:00', closed: false },
            friday: { open: '08:00', close: '17:00', closed: false },
            saturday: { closed: true },
            sunday: { closed: true }
          }),
          services: JSON.stringify([
            'Rheumatoid Arthritis Treatment',
            'Lupus Management', 
            'Infusion Therapy',
            'Joint Injections',
            'Osteoporosis Treatment',
            'Clinical Research'
          ]),
          conditions_treated: JSON.stringify([
            'Rheumatoid Arthritis',
            'Psoriatic Arthritis', 
            'Lupus',
            'Gout',
            'Osteoporosis',
            'Osteoarthritis',
            'Fibromyalgia',
            'Ankylosing Spondylitis'
          ]),
          insurance_accepted: JSON.stringify([
            'Aetna',
            'Anthem Blue Cross Blue Shield',
            'Cigna', 
            'Medicare',
            'UnitedHealthcare',
            'Rocky Mountain Health Plans'
          ]),
          about_text: 'Demo Rheumatology Clinic has been providing expert rheumatology care for over 20 years. Our board-certified rheumatologists specialize in treating complex autoimmune and inflammatory conditions.',
          mission_statement: 'To provide compassionate, expert rheumatology care while advancing the field through research and education.',
          welcome_message: 'Welcome to Demo Rheumatology Clinic, where expert care meets compassionate treatment.',
          meta_title: 'Demo Rheumatology Clinic - Expert Arthritis & Autoimmune Care',
          meta_description: 'Leading rheumatology practice specializing in rheumatoid arthritis, lupus, and autoimmune conditions. Expert care from board-certified rheumatologists.',
          primary_color: '#00AEEF',
          secondary_color: '#FFFFFF',
          accent_color: '#44C0AE'
        });

      // Create sample staff member
      await db
        .insert(staff_members)
        .values({
          practice_id: newPractice?.practice_id || '',
          name: 'Dr. Sarah Johnson',
          title: 'Rheumatologist',
          credentials: 'MD, FACR',
          bio: 'Dr. Johnson is a board-certified rheumatologist with over 15 years of experience treating autoimmune and inflammatory conditions. She completed her fellowship at Johns Hopkins and specializes in rheumatoid arthritis and lupus.',
          specialties: JSON.stringify([
            'Rheumatoid Arthritis',
            'Lupus',
            'Infusion Therapy',
            'Clinical Research'
          ]),
          education: JSON.stringify([
            { degree: 'MD', school: 'University of Colorado School of Medicine', year: '2005' },
            { degree: 'Rheumatology Fellowship', school: 'Johns Hopkins Hospital', year: '2009' },
            { degree: 'Internal Medicine Residency', school: 'Denver Health Medical Center', year: '2008' }
          ]),
          display_order: 1,
        });
      
      logger.info('Demo practice configuration and staff created', {
        operation: 'seedPractices',
        practice: 'Demo Practice'
      });
    } else {
      logger.info('Demo practice already exists, skipping', {
        operation: 'seedPractices'
      });
    }
    
  } catch (error) {
    logger.error('Error seeding practices', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'seedPractices'
    });
    throw error;
  }
}

async function assignUserRoles() {
  logger.info('Assigning roles to users', {
    operation: 'assignUserRoles',
    phase: 'start'
  });

  try {
    // Get the admin user
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@bendcare.com'))
      .limit(1);

    if (!adminUser) {
      logger.warn('Admin user not found, skipping role assignment', {
        operation: 'assignUserRoles'
      });
      return;
    }

    // Get the super_admin role
    const [superAdminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'super_admin'))
      .limit(1);

    if (!superAdminRole) {
      logger.warn('Super admin role not found, skipping role assignment', {
        operation: 'assignUserRoles'
      });
      return;
    }

    // Get the platform admin organization
    const [platformOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'platform-admin'))
      .limit(1);

    if (!platformOrg) {
      logger.warn('Platform admin organization not found, skipping role assignment', {
        operation: 'assignUserRoles'
      });
      return;
    }

    // Check if role assignment already exists
    const existingAssignment = await db
      .select()
      .from(user_roles)
      .where(
        and(
          eq(user_roles.user_id, adminUser.user_id),
          eq(user_roles.role_id, superAdminRole.role_id)
        )
      )
      .limit(1);

    if (existingAssignment.length === 0) {
      // Assign super admin role to admin user
      await db
        .insert(user_roles)
        .values({
          user_id: adminUser.user_id,
          role_id: superAdminRole.role_id,
          organization_id: platformOrg.organization_id,
          granted_by: adminUser.user_id, // Self-granted for initial setup
          granted_at: new Date(),
          is_active: true
        });

      logger.info('Super admin role assigned to admin user', {
        userId: adminUser.user_id,
        email: adminUser.email,
        roleId: superAdminRole.role_id,
        operation: 'assignUserRoles'
      });
    } else {
      logger.info('Admin user already has super admin role, skipping', {
        userId: adminUser.user_id,
        operation: 'assignUserRoles'
      });
    }

    // Assign user to platform organization
    const existingOrgAssignment = await db
      .select()
      .from(user_organizations)
      .where(
        and(
          eq(user_organizations.user_id, adminUser.user_id),
          eq(user_organizations.organization_id, platformOrg.organization_id)
        )
      )
      .limit(1);

    if (existingOrgAssignment.length === 0) {
      await db
        .insert(user_organizations)
        .values({
          user_id: adminUser.user_id,
          organization_id: platformOrg.organization_id,
          is_primary: true,
          joined_at: new Date()
        });

      logger.info('Admin user assigned to platform organization', {
        userId: adminUser.user_id,
        organizationId: platformOrganization.organization_id,
        operation: 'assignUserRoles'
      });
    } else {
      logger.info('Admin user already in platform organization, skipping', {
        userId: adminUser.user_id,
        operation: 'assignUserRoles'
      });
    }

    // Assign 'user' role to all sample users
    const sampleUserEmails = ['john.doe@example.com', 'jane.smith@example.com', 'bob.johnson@example.com'];
    const [userRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'user'))
      .limit(1);

    const [rheumatologyOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'rheumatology-associates'))
      .limit(1);

    if (userRole && rheumatologyOrg) {
      for (const email of sampleUserEmails) {
        const [sampleUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (sampleUser) {
          // Check if role assignment exists
          const existingRole = await db
            .select()
            .from(user_roles)
            .where(
              and(
                eq(user_roles.user_id, sampleUser.user_id),
                eq(user_roles.role_id, userRole.role_id)
              )
            )
            .limit(1);

          if (existingRole.length === 0) {
            await db
              .insert(user_roles)
              .values({
                user_id: sampleUser.user_id,
                role_id: userRole.role_id,
                organization_id: rheumatologyOrg.organization_id,
                granted_by: adminUser.user_id,
                granted_at: new Date(),
                is_active: true
              });

            // Assign to organization
            const existingSampleOrgAssignment = await db
              .select()
              .from(user_organizations)
              .where(
                and(
                  eq(user_organizations.user_id, sampleUser.user_id),
                  eq(user_organizations.organization_id, rheumatologyOrg.organization_id)
                )
              )
              .limit(1);

            if (existingSampleOrgAssignment.length === 0) {
              await db
                .insert(user_organizations)
                .values({
                  user_id: sampleUser.user_id,
                  organization_id: rheumatologyOrg.organization_id,
                  is_primary: true,
                  joined_at: new Date()
                });
            }

            logger.info('User role assigned', {
              email,
              userId: sampleUser.user_id,
              roleId: userRole.role_id,
              operation: 'assignUserRoles'
            });
          } else {
            logger.info('User already has user role, skipping', {
              email,
              operation: 'assignUserRoles'
            });
          }
        }
      }
    }

    logger.info('User role assignments completed', {
      operation: 'assignUserRoles',
      phase: 'completed'
    });
  } catch (error) {
    logger.error('Error assigning user roles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'assignUserRoles'
    });
    throw error;
  }
}

async function seed() {
  logger.info('Starting database seeding', {
    operation: 'seedDatabase',
    phase: 'start'
  });

  try {
    // Seed RBAC data first (permissions, roles, role_permissions)
    await seedRBAC();

    // Then seed application data
    await seedUsers();
    await seedTemplates();
    await seedPractices();

    // Finally assign roles to users
    await assignUserRoles();

    logger.info('Database seeding completed successfully', {
      operation: 'seedDatabase',
      phase: 'completed'
    });
    process.exit(0);
  } catch (error) {
    logger.error('Database seeding failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'seedDatabase'
    });
    process.exit(1);
  }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
  seed();
}

export { seed, seedUsers, seedRBAC };
