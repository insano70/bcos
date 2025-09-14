#!/usr/bin/env node

const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d'
});

async function checkRBAC() {
  try {
    await client.connect();

    console.log('🔍 Checking RBAC state...\n');

    // Check if super_admin role exists
    const roles = await client.query('SELECT * FROM roles WHERE name = $1', ['super_admin']);
    console.log('Super admin role:', roles.rows[0] || 'NOT FOUND');

    // Check if admin@bendcare.com user exists
    const users = await client.query('SELECT * FROM users WHERE email = $1', ['admin@bendcare.com']);
    console.log('Super admin user:', users.rows[0] || 'NOT FOUND');

    if (users.rows[0] && roles.rows[0]) {
      // Check user-role assignment
      const userRoles = await client.query(`
        SELECT ur.*, r.name as role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = $1 AND ur.is_active = true
      `, [users.rows[0].user_id]);

      console.log('User roles assigned:', userRoles.rows);

      // Check role permissions
      const rolePermissions = await client.query(`
        SELECT rp.*, p.name as permission_name
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = $1
      `, [roles.rows[0].role_id]);

      console.log('Super admin permissions:', rolePermissions.rows.length);
      console.log('Sample permissions:', rolePermissions.rows.slice(0, 5).map(r => r.permission_name));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkRBAC();
