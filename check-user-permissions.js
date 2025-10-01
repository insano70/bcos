const { getDb } = require('./lib/db/index.ts');
const { eq, and } = require('drizzle-orm');
const { users, user_roles, roles, role_permissions, permissions } = require('./lib/db/schema.ts');

async function checkUserPermissions() {
  try {
    const db = getDb();
    
    console.log('🔍 Checking current user permissions...\n');
    
    // Get all users
    const allUsers = await db.select().from(users).limit(5);
    console.log('Users found:', allUsers.length);
    
    if (allUsers.length > 0) {
      const user = allUsers[0]; // Check first user
      console.log('Checking user:', user.email);
      
      // Get user roles
      const userRoleData = await db
        .select({
          roleName: roles.name,
          roleId: roles.role_id
        })
        .from(user_roles)
        .innerJoin(roles, eq(user_roles.role_id, roles.role_id))
        .where(and(
          eq(user_roles.user_id, user.user_id),
          eq(user_roles.is_active, true)
        ));
      
      console.log('User roles:', userRoleData.map(r => r.roleName));
      
      // Get permissions for each role
      for (const roleData of userRoleData) {
        const rolePerms = await db
          .select({
            permissionName: permissions.name
          })
          .from(role_permissions)
          .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
          .where(eq(role_permissions.role_id, roleData.roleId));
        
        console.log(`Permissions for ${roleData.roleName}:`, rolePerms.map(p => p.permissionName));
        
        // Check specifically for users:create:organization
        const hasCreatePermission = rolePerms.some(p => p.permissionName === 'users:create:organization');
        console.log(`Has users:create:organization permission: ${hasCreatePermission}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkUserPermissions();
